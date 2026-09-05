import { backend } from '@/lib/backend'
import type { TeamMember } from '@/types/database'

export type AttendanceSettings = {
  league_id: string; enabled: boolean
  team_documents_enabled: boolean
  team_documents_notice_fa: string; team_documents_notice_en: string
  member_review_title_fa: string; member_review_title_en: string
  member_review_help_fa: string; member_review_help_en: string
  article_required: boolean; video_required: boolean; article_max_bytes: number; video_max_bytes: number
  technical_help_fa: string; technical_help_en: string
  rules_title_fa: string; rules_title_en: string; rules_body_fa: string; rules_body_en: string
  participant_note_enabled: boolean; participant_note_label_fa: string; participant_note_label_en: string
  confirmation_title_fa: string; confirmation_title_en: string
  confirmation_message_fa: string; confirmation_message_en: string
  venue_fa?: string | null; venue_en?: string | null; venue_address_fa?: string | null; venue_address_en?: string | null
  event_starts_at?: string | null; support_phone?: string | null
}
export type AttendanceClearance = {
  team_id: string; league_id: string; stage: 'members'|'technical'|'rules'|'payment'|'confirmed'
  technical_status: 'locked'|'draft'|'pending'|'approved'|'rejected'
  technical_rejection_reason?: string|null; participant_note?: string|null; rules_accepted_at?: string|null; confirmed_at?: string|null
}
export type TechnicalFile = { id:string; team_id:string; kind:'article'|'robot_video'; file_path:string; original_name:string; mime_type:string; size_bytes:number; created_at:string }

export async function fetchAttendance(teamId:string, leagueId:string) {
  const flow = await backend.rpc('get_or_create_team_attendance',{p_team_id:teamId})
  if (flow.error) throw new Error(flow.error.message)
  const [settings, members, files] = await Promise.all([
    backend.from('league_attendance_settings').select('*').eq('league_id',leagueId).maybeSingle(),
    backend.from('team_members').select('*').eq('team_id',teamId),
    backend.from('team_technical_files').select('*').eq('team_id',teamId),
  ])
  const error = settings.error || members.error || files.error
  if (error) throw new Error(error.message)
  return { flow: flow.data as AttendanceClearance, settings: settings.data as AttendanceSettings, members: (members.data??[]) as TeamMember[], files:(files.data??[]) as TechnicalFile[] }
}

export async function uploadTechnicalFile(teamId:string, kind:'article'|'robot_video', file:File, maxBytes=90*1024*1024, previousPath?:string) {
  const allowed = kind==='article' ? ['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document'] : ['video/mp4','video/webm','video/quicktime']
  if (!allowed.includes(file.type)) throw new Error('invalid_file_type')
  if (file.size > Math.min(maxBytes,90*1024*1024)) throw new Error('file_too_large')
  const extension=file.name.split('.').pop()?.toLowerCase() || (kind==='article'?'pdf':'mp4')
  const path=`${teamId}/${kind}-${crypto.randomUUID()}.${extension}`
  const uploaded=await backend.storage.from('technical-submissions').upload(path,file,{contentType:file.type,upsert:false})
  if(uploaded.error) throw new Error(uploaded.error.message)
  const saved=await backend.rpc('upsert_team_technical_file',{p_team_id:teamId,p_kind:kind,p_file_path:path,p_original_name:file.name,p_mime_type:file.type,p_size_bytes:file.size})
  if(saved.error){ await backend.storage.from('technical-submissions').remove([path]); throw new Error(saved.error.message) }
  if(previousPath&&previousPath!==path) await backend.storage.from('technical-submissions').remove([previousPath])
  return saved.data as TechnicalFile
}

export async function submitTechnical(teamId:string){const r=await backend.rpc('submit_team_technical_files',{p_team_id:teamId});if(r.error)throw new Error(r.error.message);return r.data as AttendanceClearance}
export async function reviewTechnical(teamId:string,approved:boolean,reason?:string){const r=await backend.rpc('review_team_technical_files',{p_team_id:teamId,p_approved:approved,p_reason:reason??null});if(r.error)throw new Error(r.error.message);return r.data as AttendanceClearance}
export async function acceptAttendanceRules(teamId:string,note:string){const r=await backend.rpc('accept_team_attendance_rules',{p_team_id:teamId,p_accepted:true,p_note:note||null});if(r.error)throw new Error(r.error.message);return r.data as AttendanceClearance}
export async function technicalSignedUrl(path:string){const r=await backend.storage.from('technical-submissions').createSignedUrl(path,600);if(r.error)throw new Error(r.error.message);return r.data.signedUrl}
