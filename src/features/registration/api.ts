import { backend } from '@/lib/backend'
import { normalizePhone, validateDocumentFile } from '@/lib/validation'
import { toDateOnly } from '@/lib/dates'
import type { DocumentRow, Team, TeamMember } from '@/types/database'

export type TeamMemberDraft = {
  first_name: string
  last_name: string
  full_name: string
  role: 'captain' | 'member' | string
  national_id: string
  birth_date: string
  education: string
  national_id_doc_path?: string
}

export type TeamWizardDraft = {
  companyId: string
  leagueId: string
  name: string
  province: string
  city: string
  captainPhone: string
  captainNameHint: string
  members: TeamMemberDraft[]
  pendingDocs: Array<{
    doc_type: string
    localId: string
    fileName: string
  }>
  step: number
  teamId?: string
}

const DRAFT_KEY = (companyId: string) => `robocactus-team-draft:${companyId}`

export function loadTeamDraft(companyId: string): TeamWizardDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY(companyId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as TeamWizardDraft
    // migrate older drafts
    parsed.members = (parsed.members ?? []).map((m) => ({
      first_name: m.first_name ?? (m.full_name?.split(' ')[0] ?? ''),
      last_name: m.last_name ?? (m.full_name?.split(' ').slice(1).join(' ') ?? ''),
      full_name: m.full_name ?? `${m.first_name ?? ''} ${m.last_name ?? ''}`.trim(),
      role: m.role || 'member',
      national_id: m.national_id ?? '',
      birth_date: m.birth_date ?? '',
      education: m.education ?? '',
      national_id_doc_path: m.national_id_doc_path,
    }))
    return parsed
  } catch {
    return null
  }
}

export function saveTeamDraft(draft: TeamWizardDraft) {
  localStorage.setItem(DRAFT_KEY(draft.companyId), JSON.stringify(draft))
}

export function clearTeamDraft(companyId: string) {
  localStorage.removeItem(DRAFT_KEY(companyId))
}

export function emptyMemberDraft(role: 'captain' | 'member' = 'member'): TeamMemberDraft {
  return {
    first_name: '',
    last_name: '',
    full_name: '',
    role,
    national_id: '',
    birth_date: '',
    education: '',
  }
}

export function emptyTeamDraft(companyId: string, leagueId = ''): TeamWizardDraft {
  return {
    companyId,
    leagueId,
    name: '',
    province: '',
    city: '',
    captainPhone: '',
    captainNameHint: '',
    members: [emptyMemberDraft('captain'), emptyMemberDraft('member')],
    pendingDocs: [],
    step: 0,
  }
}

export async function resolveCaptainId(
  companyId: string,
  phone: string,
  fullNameHint?: string,
): Promise<{ captainId: string; alreadyRegistered: boolean }> {
  const normalized = normalizePhone(phone)
  const { data: exists, error: existsError } = await backend.rpc('profile_exists_by_phone', {
    p_phone: normalized,
  })
  if (existsError) throw new Error(existsError.message)

  const { data: captainId, error } = await backend.rpc('resolve_team_captain', {
    p_company_id: companyId,
    p_phone: normalized,
    p_full_name_hint: fullNameHint ?? null,
  })

  if (error) throw new Error(error.message)
  return { captainId: captainId as string, alreadyRegistered: Boolean(exists) }
}

export async function createDraftTeam(input: {
  companyId: string
  leagueId: string
  name: string
  province: string
  city: string
  captainId: string
  memberCount: number
}): Promise<Team> {
  const { data, error } = await backend
    .from('teams')
    .insert({
      company_id: input.companyId,
      league_id: input.leagueId,
      captain_id: input.captainId,
      name: input.name,
      province: input.province,
      city: input.city,
      member_count: input.memberCount,
      status: 'draft',
    })
    .select('*')
    .single()

  if (error) throw new Error(error.message)
  return data as Team
}

export async function updateDraftTeam(
  teamId: string,
  patch: Partial<
    Pick<Team, 'name' | 'province' | 'city' | 'league_id' | 'captain_id' | 'member_count'>
  >,
): Promise<Team> {
  const { data, error } = await backend
    .from('teams')
    .update(patch)
    .eq('id', teamId)
    .select('*')
    .single()

  if (error) throw new Error(error.message)
  return data as Team
}

export async function replaceTeamMembers(
  teamId: string,
  members: TeamMemberDraft[],
): Promise<TeamMember[]> {
  const { error: deleteError } = await backend.from('team_members').delete().eq('team_id', teamId)
  if (deleteError) throw new Error(deleteError.message)

  if (!members.length) return []

  const rows = members
    .filter((m) => (m.first_name || m.last_name || m.full_name).trim())
    .map((m) => {
      const first = m.first_name.trim()
      const last = m.last_name.trim()
      const full = m.full_name.trim() || `${first} ${last}`.trim()
      return {
        team_id: teamId,
        full_name: full,
        first_name: first || null,
        last_name: last || null,
        role: m.role === 'captain' ? 'captain' : m.role === 'member' ? 'member' : m.role?.trim() || 'member',
        national_id: m.national_id?.trim() || null,
        birth_date: toDateOnly(m.birth_date),
        education: m.education?.trim() || null,
        national_id_doc_path: m.national_id_doc_path || null,
        review_status: 'pending',
      }
    })

  if (!rows.length) return []

  const { data, error } = await backend.from('team_members').insert(rows).select('*')
  if (error) throw new Error(error.message)
  return (data ?? []) as TeamMember[]
}

export async function uploadMemberNationalId(input: {
  userId: string
  teamId: string
  memberId: string
  file: File
}): Promise<TeamMember> {
  const validation = validateDocumentFile(input.file)
  if (validation) throw new Error(validation)

  const ext = input.file.name.split('.').pop() ?? 'bin'
  const path = `${input.userId}/${input.teamId}/member-${input.memberId}-id-${Date.now()}.${ext}`

  const { error: uploadError } = await backend.storage
    .from('team-documents')
    .upload(path, input.file, { contentType: input.file.type, upsert: false })
  if (uploadError) throw new Error(uploadError.message)

  await backend.from('documents').insert({
    team_id: input.teamId,
    file_path: path,
    doc_type: 'member_national_id',
    team_member_id: input.memberId,
  })

  const { data, error } = await backend
    .from('team_members')
    .update({ national_id_doc_path: path })
    .eq('id', input.memberId)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data as TeamMember
}

export async function createCaptainInvite(input: {
  companyId: string
  teamId: string
  phone: string
  fullNameHint: string
  invitedBy: string
}): Promise<void> {
  const phone = normalizePhone(input.phone)
  const { data: exists } = await backend.rpc('profile_exists_by_phone', { p_phone: phone })
  if (exists) return

  await backend.from('captain_invites').delete().eq('team_id', input.teamId)

  const { error } = await backend.from('captain_invites').insert({
    company_id: input.companyId,
    team_id: input.teamId,
    phone,
    full_name_hint: input.fullNameHint || null,
    invited_by: input.invitedBy,
  })

  if (error) throw new Error(error.message)
}

export async function uploadTeamDocument(input: {
  userId: string
  teamId: string
  file: File
  docType: string
}): Promise<DocumentRow> {
  const validation = validateDocumentFile(input.file)
  if (validation) throw new Error(validation)

  const ext = input.file.name.split('.').pop() ?? 'bin'
  const path = `${input.userId}/${input.teamId}/${input.docType}-${Date.now()}.${ext}`

  const { error: uploadError } = await backend.storage
    .from('team-documents')
    .upload(path, input.file, { contentType: input.file.type, upsert: false })

  if (uploadError) throw new Error(uploadError.message)

  const { data, error } = await backend
    .from('documents')
    .insert({
      team_id: input.teamId,
      file_path: path,
      doc_type: input.docType,
    })
    .select('*')
    .single()

  if (error) throw new Error(error.message)
  return data as DocumentRow
}

export async function fetchTeamDocuments(teamId: string): Promise<DocumentRow[]> {
  const { data, error } = await backend
    .from('documents')
    .select('*')
    .eq('team_id', teamId)
    .order('uploaded_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as DocumentRow[]
}

export async function fetchTeamMembers(teamId: string): Promise<TeamMember[]> {
  const { data, error } = await backend.from('team_members').select('*').eq('team_id', teamId)
  if (error) throw new Error(error.message)
  return (data ?? []) as TeamMember[]
}

export async function reviewTeamMember(
  memberId: string,
  status: 'pending' | 'approved' | 'rejected',
  reason?: string,
): Promise<TeamMember> {
  const { data, error } = await backend.rpc('review_team_member', {
    p_member_id: memberId,
    p_status: status,
    p_reason: reason ?? null,
  })
  if (error) throw new Error(error.message)
  return data as TeamMember
}

export async function fetchCaptainTeams(userId: string): Promise<Team[]> {
  const { data, error } = await backend
    .from('teams')
    .select('*')
    .eq('captain_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as Team[]
}

export async function fetchTeamById(teamId: string): Promise<Team | null> {
  const { data, error } = await backend.from('teams').select('*').eq('id', teamId).maybeSingle()
  if (error) throw new Error(error.message)
  return data as Team | null
}

export async function deleteTeamDocument(doc: DocumentRow): Promise<void> {
  await backend.storage.from('team-documents').remove([doc.file_path])
  const { error } = await backend.from('documents').delete().eq('id', doc.id)
  if (error) throw new Error(error.message)
}

export async function fetchCompanyTeamForLeague(
  companyId: string,
  leagueId: string,
): Promise<Team | null> {
  const { data, error } = await backend
    .from('teams')
    .select('*')
    .eq('company_id', companyId)
    .eq('league_id', leagueId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data as Team | null
}
