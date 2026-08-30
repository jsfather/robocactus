import { backend } from '@/lib/backend'
import { validateDocumentFile } from '@/lib/validation'
import type {
  DocumentRow,
  RegistrationStatus,
  ResultRow,
  Team,
  Ticket,
  TicketMessage,
  JudgeScore,
  JudgeSubmissionProgress,
} from '@/types/database'

export type TeamWithMeta = Team & {
  league_name?: string
  company_name?: string
}

export async function fetchMyJudgeScore(teamId: string, seasonYear: number, judgeId: string): Promise<JudgeScore | null> {
  const { data, error } = await backend.from('judge_scores').select('*').eq('team_id', teamId).eq('season_year', seasonYear).eq('judge_id', judgeId).maybeSingle()
  if (error) throw new Error(error.message)
  return data as JudgeScore | null
}

export async function fetchJudgeProgress(teamId: string, seasonYear: number): Promise<JudgeSubmissionProgress | null> {
  const { data, error } = await backend.from('judge_submission_progress').select('*').eq('team_id', teamId).eq('season_year', seasonYear).maybeSingle()
  if (error) throw new Error(error.message)
  return data as JudgeSubmissionProgress | null
}

export async function saveJudgeScore(input: { teamId: string; seasonYear: number; scores: Record<string, number>; notes?: string; submit: boolean }): Promise<JudgeScore> {
  const { data, error } = await backend.rpc('save_judge_score', { p_team_id: input.teamId, p_season_year: input.seasonYear, p_scores: input.scores, p_notes: input.notes ?? null, p_submit: input.submit })
  if (error) throw new Error(error.message)
  return data as JudgeScore
}

export async function publishOfficialTeamResult(teamId: string, seasonYear: number): Promise<ResultRow> {
  const { data, error } = await backend.rpc('publish_official_team_result', { p_team_id: teamId, p_season_year: seasonYear })
  if (error) throw new Error(error.message)
  return data as ResultRow
}

export async function fetchMyLeagueIds(userId: string): Promise<string[]> {
  const { data, error } = await backend
    .from('league_admins')
    .select('league_id')
    .eq('user_id', userId)
  if (error) throw new Error(error.message)
  return (data ?? []).map((r: { league_id: string }) => r.league_id)
}

export async function fetchTeamsForReview(filters?: {
  leagueIds?: string[]
  statuses?: RegistrationStatus[]
}): Promise<Team[]> {
  let query = backend.from('teams').select('*').order('submitted_at', { ascending: true })

  if (filters?.leagueIds?.length) {
    query = query.in('league_id', filters.leagueIds)
  }
  if (filters?.statuses?.length) {
    query = query.in('status', filters.statuses)
  } else {
    query = query.in('status', ['submitted', 'under_review', 'waitlisted', 'approved', 'rejected'])
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []) as Team[]
}

export async function reviewTeam(input: {
  teamId: string
  status: Extract<RegistrationStatus, 'under_review' | 'approved' | 'rejected' | 'waitlisted'>
  rejectionReason?: string
}): Promise<Team> {
  const { data, error } = await backend.rpc('review_team', {
    p_team_id: input.teamId,
    p_status: input.status,
    p_rejection_reason: input.rejectionReason ?? null,
  })
  if (error) throw new Error(error.message)
  return data as Team
}

export async function adminDeleteTeam(teamId: string): Promise<void> {
  const { error } = await backend.rpc('admin_delete_team', { p_team_id: teamId })
  if (error) throw new Error(error.message)
}

export async function getDocumentSignedUrl(filePath: string): Promise<string> {
  const { data, error } = await backend.storage
    .from('team-documents')
    .createSignedUrl(filePath, 60 * 10)
  if (error) throw new Error(error.message)
  return data.signedUrl
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

export async function upsertTeamResult(input: {
  teamId: string
  seasonYear: number
  rank?: number | null
  score?: number | null
  notes?: string | null
  publish?: boolean
}): Promise<ResultRow> {
  const { data, error } = await backend.rpc('upsert_team_result', {
    p_team_id: input.teamId,
    p_season_year: input.seasonYear,
    p_rank: input.rank ?? null,
    p_score: input.score ?? null,
    p_notes: input.notes ?? null,
    p_publish: input.publish ?? false,
  })
  if (error) throw new Error(error.message)
  return data as ResultRow
}

export async function fetchTeamResult(
  teamId: string,
  seasonYear: number,
): Promise<ResultRow | null> {
  const { data, error } = await backend
    .from('results')
    .select('*')
    .eq('team_id', teamId)
    .eq('season_year', seasonYear)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data as ResultRow | null
}

export async function createTicket(input: {
  teamId: string
  subject: string
  body: string
  leagueId?: string | null
  departmentId?: string | null
}): Promise<Ticket> {
  const { data, error } = await backend.rpc('create_ticket_with_department', {
    p_team_id: input.teamId,
    p_subject: input.subject,
    p_body: input.body,
    p_league_id: input.leagueId ?? null,
    p_department_id: input.departmentId ?? null,
  })
  if (error) throw new Error(error.message)
  return data as Ticket
}

export async function fetchTickets(filters?: {
  generalOnly?: boolean
  leagueIds?: string[]
  teamId?: string
  departmentId?: string | null
}): Promise<Ticket[]> {
  let query = backend.from('tickets').select('*').order('created_at', { ascending: false })

  if (filters?.generalOnly) query = query.is('league_id', null)
  if (filters?.leagueIds?.length) query = query.in('league_id', filters.leagueIds)
  if (filters?.teamId) query = query.eq('team_id', filters.teamId)
  if (filters?.departmentId) query = query.eq('department_id', filters.departmentId)

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []) as Ticket[]
}

export async function fetchTicketMessages(ticketId: string): Promise<TicketMessage[]> {
  const { data, error } = await backend
    .from('ticket_messages')
    .select('*')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as TicketMessage[]
}

export async function replyTicket(input: {
  ticketId: string
  body: string
  markAnswered?: boolean
  attachmentUrl?: string | null
  attachmentName?: string | null
  attachmentMime?: string | null
  attachmentSize?: number | null
}): Promise<TicketMessage> {
  const { data, error } = await backend.rpc('reply_ticket', {
    p_ticket_id: input.ticketId,
    p_body: input.body,
    p_mark_answered: input.markAnswered ?? true,
    p_attachment_url: input.attachmentUrl ?? null,
    p_attachment_name: input.attachmentName ?? null,
    p_attachment_mime: input.attachmentMime ?? null,
    p_attachment_size: input.attachmentSize ?? null,
  })
  if (error) throw new Error(error.message)
  return data as TicketMessage
}

export async function uploadTicketAttachment(userId: string, file: File): Promise<{
  url: string
  name: string
  mime: string
  size: number
}> {
  const validation = validateDocumentFile(file)
  if (validation === 'invalid_type') throw new Error('invalid_type')
  if (validation === 'too_large') throw new Error('too_large')

  const ext = file.name.split('.').pop() ?? 'bin'
  const path = `${userId}/${Date.now()}.${ext}`
  const { error } = await backend.storage.from('ticket-attachments').upload(path, file, {
    contentType: file.type,
    upsert: false,
  })
  if (error) throw new Error(error.message)

  const { data, error: signedError } = await backend.storage
    .from('ticket-attachments')
    .createSignedUrl(path, 60 * 60 * 24 * 7)
  if (signedError) throw new Error(signedError.message)

  return {
    url: data.signedUrl,
    name: file.name,
    mime: file.type,
    size: file.size,
  }
}

export async function referTicket(input: {
  ticketId: string
  leagueId: string
  assignedTo?: string | null
}): Promise<Ticket> {
  const { data, error } = await backend.rpc('refer_ticket', {
    p_ticket_id: input.ticketId,
    p_league_id: input.leagueId,
    p_assigned_to: input.assignedTo ?? null,
  })
  if (error) throw new Error(error.message)
  return data as Ticket
}

export async function closeTicket(ticketId: string): Promise<void> {
  const { error } = await backend.from('tickets').update({ status: 'closed' }).eq('id', ticketId)
  if (error) throw new Error(error.message)
}

export async function fetchLeagueAdminsForLeague(
  leagueId: string,
): Promise<Array<{ user_id: string }>> {
  const { data, error } = await backend
    .from('league_admins')
    .select('user_id')
    .eq('league_id', leagueId)
  if (error) throw new Error(error.message)
  return (data ?? []) as Array<{ user_id: string }>
}
