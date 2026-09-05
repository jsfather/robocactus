import { backend } from '@/lib/backend'
import { normalizePhone, validateDocumentFile } from '@/lib/validation'
import { toDateOnly } from '@/lib/dates'
import type { DocumentRow, Team, TeamMember } from '@/types/database'

export type TeamMemberDraft = {
  first_name: string
  last_name: string
  first_name_en: string
  last_name_en: string
  full_name: string
  role: 'captain' | 'member' | string
  national_id: string
  birth_date: string
  education: string
  father_name_fa: string
  father_name_en: string
  phone: string
  residence: string
  province: string
  city: string
  country_code: string
  nationality: string
  is_foreign: boolean
  passport_number: string
  education_level: string
  field_of_study: string
  photo_url?: string
  national_id_doc_path?: string
}

export type TeamWizardDraft = {
  companyId: string
  leagueId: string
  name: string
  nameEn: string
  mottoFa: string
  mottoEn: string
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
    parsed.nameEn = parsed.nameEn ?? ''
    parsed.mottoFa = parsed.mottoFa ?? ''
    parsed.mottoEn = parsed.mottoEn ?? ''
    // migrate older drafts
    parsed.members = (parsed.members ?? []).map((m) => ({
      first_name: m.first_name ?? (m.full_name?.split(' ')[0] ?? ''),
      last_name: m.last_name ?? (m.full_name?.split(' ').slice(1).join(' ') ?? ''),
      first_name_en: m.first_name_en ?? '',
      last_name_en: m.last_name_en ?? '',
      full_name: m.full_name ?? `${m.first_name ?? ''} ${m.last_name ?? ''}`.trim(),
      role: m.role || 'member',
      national_id: m.national_id ?? '',
      birth_date: m.birth_date ?? '',
      education: m.education ?? '',
      father_name_fa: m.father_name_fa ?? '', father_name_en: m.father_name_en ?? '', phone: m.phone ?? '', residence: m.residence ?? '',
      province: m.province ?? '', city: m.city ?? '', country_code: m.country_code ?? 'IR', nationality: m.nationality ?? '', is_foreign: m.is_foreign ?? false,
      passport_number: m.passport_number ?? '', education_level: m.education_level ?? '', field_of_study: m.field_of_study ?? '', photo_url: m.photo_url,
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

export function emptyMemberDraft(role: 'captain' | 'coach' | 'member' = 'member'): TeamMemberDraft {
  return {
    first_name: '',
    last_name: '',
    first_name_en: '',
    last_name_en: '',
    full_name: '',
    role,
    national_id: '',
    birth_date: '',
    education: '',
    father_name_fa: '', father_name_en: '', phone: '', residence: '', province: '', city: '', country_code: 'IR', nationality: 'ایرانی', is_foreign: false,
    passport_number: '', education_level: '', field_of_study: '',
  }
}

export function emptyTeamDraft(companyId: string, leagueId = ''): TeamWizardDraft {
  return {
    companyId,
    leagueId,
    name: '',
    nameEn: '',
    mottoFa: '',
    mottoEn: '',
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
  nameEn: string
  mottoFa: string
  mottoEn: string
  province: string
  city: string
  captainId: string
  memberCount: number
  seasonYear: number
}): Promise<Team> {
  const existing = await backend
    .from('teams')
    .select('*')
    .eq('captain_id', input.captainId)
    .eq('league_id', input.leagueId)
    .eq('season_year', input.seasonYear)
    .in('lifecycle_status', ['draft', 'incomplete', 'awaiting_documents', 'awaiting_review', 'awaiting_technical_review', 'awaiting_rules', 'awaiting_payment'])
    .order('last_activity_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (existing.error) throw new Error(existing.error.message)
  if (existing.data) {
    return updateDraftTeam((existing.data as Team).id, {
      company_id: input.companyId,
      name: input.name,
      name_en: input.nameEn || null,
      motto_fa: input.mottoFa || null,
      motto_en: input.mottoEn || null,
      province: input.province,
      city: input.city,
      member_count: input.memberCount,
    } as Partial<Team>)
  }
  const { data, error } = await backend
    .from('teams')
    .insert({
      company_id: input.companyId,
      league_id: input.leagueId,
      captain_id: input.captainId,
      name: input.name,
      name_en: input.nameEn || null,
      motto_fa: input.mottoFa || null,
      motto_en: input.mottoEn || null,
      season_year: input.seasonYear,
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
    Pick<Team, 'name' | 'name_en' | 'motto_fa' | 'motto_en' | 'province' | 'city' | 'league_id' | 'captain_id' | 'member_count' | 'season_year'>
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

export async function persistRegistrationDraft(teamId: string, draft: TeamWizardDraft, input?: { stage?: Team['registration_stage']; progress?: number; lastCompletedStep?: number; lifecycleStatus?: Team['lifecycle_status'] }): Promise<void> {
  const { error } = await backend.from('teams').update({
    registration_draft: draft,
    registration_stage: input?.stage ?? 'team_info',
    registration_progress: Math.max(0, Math.min(100, input?.progress ?? 10)),
    last_completed_step: input?.lastCompletedStep ?? Math.max(-1, draft.step - 1),
    lifecycle_status: input?.lifecycleStatus ?? 'incomplete',
    last_activity_at: new Date().toISOString(),
  }).eq('id', teamId)
  if (error) throw new Error(error.message)
}

export async function loadRegistrationDraft(teamId: string): Promise<TeamWizardDraft | null> {
  const { data, error } = await backend.from('teams').select('*').eq('id', teamId).single()
  if (error) throw new Error(error.message)
  const team = data as Team
  const persistedMembers = await fetchTeamMembers(teamId)
  const members = persistedMembers.length ? persistedMembers.map((member) => ({
    full_name: member.full_name ?? '',
    first_name: member.first_name ?? member.first_name_fa ?? '',
    last_name: member.last_name ?? member.last_name_fa ?? '',
    first_name_en: member.first_name_en ?? '',
    last_name_en: member.last_name_en ?? '',
    role: member.role ?? 'member',
    national_id: member.national_id ?? '',
    birth_date: member.birth_date ?? '',
    education: member.education ?? '',
    father_name_fa: member.father_name_fa ?? '', father_name_en: member.father_name_en ?? '', phone: member.phone ?? '', residence: member.residence ?? '',
    province: member.province ?? '', city: member.city ?? '', country_code: member.country_code ?? 'IR', nationality: member.nationality ?? '', is_foreign: member.is_foreign ?? false,
    passport_number: member.passport_number ?? '', education_level: member.education_level ?? '', field_of_study: member.field_of_study ?? '', photo_url: member.photo_url ?? undefined,
    national_id_doc_path: member.national_id_doc_path ?? undefined,
  })) : undefined
  const saved = team.registration_draft as TeamWizardDraft | undefined
  if (saved && Object.keys(saved).length) return { ...saved, ...(members ? { members } : {}), teamId: team.id, companyId: team.company_id, leagueId: team.league_id, step: Math.max(0, Number(team.last_completed_step ?? -1) + 1) }
  return { ...emptyTeamDraft(team.company_id, team.league_id), ...(members ? { members } : {}), teamId: team.id, name: team.name, nameEn: team.name_en ?? '', mottoFa: team.motto_fa ?? '', mottoEn: team.motto_en ?? '', province: team.province ?? '', city: team.city ?? '', step: Math.max(0, Number(team.last_completed_step ?? -1) + 1) }
}

export async function findResumableRegistration(companyId: string, leagueId?: string): Promise<Team | null> {
  let query = backend.from('teams').select('*').eq('company_id', companyId).in('lifecycle_status', ['draft', 'incomplete', 'awaiting_documents', 'awaiting_review', 'awaiting_technical_review', 'awaiting_rules', 'awaiting_payment']).order('last_activity_at', { ascending: false }).limit(1)
  if (leagueId) query = query.eq('league_id', leagueId)
  const { data, error } = await query.maybeSingle()
  if (error) throw new Error(error.message)
  return data as Team | null
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
        first_name_fa: first || null,
        last_name_fa: last || null,
        first_name_en: m.first_name_en.trim() || null,
        last_name_en: m.last_name_en.trim() || null,
        role: ['captain', 'coach', 'member'].includes(m.role) ? m.role : 'member',
        national_id: m.national_id?.trim() || null,
        birth_date: toDateOnly(m.birth_date),
        education: m.education?.trim() || null,
        father_name_fa: m.father_name_fa.trim() || null, father_name_en: m.father_name_en.trim() || null,
        phone: m.phone.trim() || null, residence: m.residence.trim() || null, province: m.province.trim() || null, city: m.city.trim() || null,
        country_code: m.country_code || 'IR', nationality: m.nationality.trim() || null, is_foreign: m.is_foreign,
        passport_number: m.passport_number.trim() || null, education_level: m.education_level || null, field_of_study: m.field_of_study.trim() || null,
        photo_url: m.photo_url || null,
        national_id_doc_path: m.national_id_doc_path || null,
        review_status: 'pending',
      }
    })

  if (!rows.length) return []

  const { data, error } = await backend.from('team_members').insert(rows).select('*')
  if (error) throw new Error(error.message)
  return (data ?? []) as TeamMember[]
}

export async function uploadMemberPhoto(teamId: string, memberId: string, file: File): Promise<TeamMember> {
  if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) throw new Error('تصویر باید JPG، PNG یا WebP و حداکثر ۵ مگابایت باشد.')
  const path = `${teamId}/${memberId}-${Date.now()}.${file.name.split('.').pop() ?? 'jpg'}`
  const { error: uploadError } = await backend.storage.from('team-member-photos').upload(path, file, { contentType: file.type, upsert: false })
  if (uploadError) throw new Error(uploadError.message)
  const url = backend.storage.from('team-member-photos').getPublicUrl(path).data.publicUrl
  const { data, error } = await backend.from('team_members').update({ photo_url: url }).eq('id', memberId).select('*').single()
  if (error) throw new Error(error.message)
  return data as TeamMember
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
