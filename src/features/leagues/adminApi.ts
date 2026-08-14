import { supabase } from '@/lib/supabase'
import { slugify } from '@/lib/validation'
import type {
  League,
  LeagueDaySlot,
  LeagueFaq,
  LeagueFile,
  LeaguePastResult,
  LeaguePerson,
  LeagueScoringRow,
  LeagueSponsor,
  LeagueTimelineStep,
  Profile,
  StaticPage,
  UserRole,
} from '@/types/database'

export type LeagueAdminRow = {
  league_id: string
  user_id: string
}

export type LeagueInput = {
  name: string
  slug?: string
  description?: string | null
  category?: string | null
  capacity?: number | null
  registration_fee?: number
  registration_open_at?: string | null
  registration_close_at?: string | null
  contact_email?: string | null
  is_active?: boolean
  short_description?: string | null
  full_description?: string | null
  cover_image_url?: string | null
  hero_image_url?: string | null
  hero_video_url?: string | null
  intro_video_url?: string | null
  regulation_pdf_url?: string | null
  rules_summary?: string | null
  rules_pdf_url?: string | null
  age_range?: string | null
  participation_mode?: string | null
  team_size_min?: number | null
  team_size_max?: number | null
  event_starts_at?: string | null
  event_ends_at?: string | null
  venue_name?: string | null
  venue_address?: string | null
  venue_map_embed_url?: string | null
  difficulty_level?: string | null
  competition_language?: string | null
  scoring_rows?: LeagueScoringRow[]
  timeline_steps?: LeagueTimelineStep[]
  day_schedule?: LeagueDaySlot[]
  allowed_equipment?: string[]
  forbidden_equipment?: string[]
  discount_info?: string | null
  refund_policy?: string | null
  show_registered_count?: boolean
  period_override?: string | null
  secretary_name?: string | null
  secretary_phone?: string | null
  secretary_telegram?: string | null
  related_league_ids?: string[]
  judging_path?: string | null
  technical_committee_notes?: string | null
  results_status?: 'auto' | 'hidden' | 'live' | 'final' | string | null
}

function leaguePayloadBasic(input: LeagueInput) {
  return {
    name: input.name.trim(),
    slug: slugify(input.slug || input.name),
    description: input.description ?? null,
    category: input.category ?? null,
    capacity: input.capacity ?? null,
    registration_fee: input.registration_fee ?? 0,
    registration_open_at: input.registration_open_at || null,
    registration_close_at: input.registration_close_at || null,
    contact_email: input.contact_email || null,
    is_active: input.is_active ?? true,
  }
}

function leaguePayload(input: LeagueInput) {
  return {
    ...leaguePayloadBasic(input),
    short_description: input.short_description ?? null,
    full_description: input.full_description ?? null,
    cover_image_url: input.cover_image_url || null,
    hero_image_url: input.hero_image_url || null,
    hero_video_url: input.hero_video_url || null,
    intro_video_url: input.intro_video_url || null,
    regulation_pdf_url: input.regulation_pdf_url || null,
    rules_summary: input.rules_summary ?? null,
    rules_pdf_url: input.rules_pdf_url || null,
    age_range: input.age_range || null,
    participation_mode: input.participation_mode || 'team',
    team_size_min: input.team_size_min ?? null,
    team_size_max: input.team_size_max ?? null,
    event_starts_at: input.event_starts_at || null,
    event_ends_at: input.event_ends_at || null,
    venue_name: input.venue_name || null,
    venue_address: input.venue_address || null,
    venue_map_embed_url: input.venue_map_embed_url || null,
    difficulty_level: input.difficulty_level || null,
    competition_language: input.competition_language || null,
    scoring_rows: input.scoring_rows ?? [],
    timeline_steps: input.timeline_steps ?? [],
    day_schedule: input.day_schedule ?? [],
    allowed_equipment: input.allowed_equipment ?? [],
    forbidden_equipment: input.forbidden_equipment ?? [],
    discount_info: input.discount_info ?? null,
    refund_policy: input.refund_policy ?? null,
    show_registered_count: input.show_registered_count ?? true,
    period_override: input.period_override || null,
    secretary_name: input.secretary_name || null,
    secretary_phone: input.secretary_phone || null,
    secretary_telegram: input.secretary_telegram || null,
    related_league_ids: input.related_league_ids ?? [],
    judging_path: input.judging_path ?? null,
    technical_committee_notes: input.technical_committee_notes ?? null,
    results_status: (input.results_status as string) || 'auto',
  }
}

export async function fetchAllLeagues(): Promise<League[]> {
  const { data, error } = await supabase.from('leagues').select('*').order('created_at', {
    ascending: false,
  })
  if (error) throw new Error(error.message)
  return (data ?? []) as League[]
}

export async function fetchLeagueById(id: string): Promise<League | null> {
  const { data, error } = await supabase.from('leagues').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  return data as League | null
}

export async function createLeague(input: LeagueInput): Promise<League> {
  const { data, error } = await supabase
    .from('leagues')
    .insert(leaguePayloadBasic(input))
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data as League
}

export async function updateLeague(id: string, input: LeagueInput): Promise<League> {
  const hasDetail =
    input.short_description != null ||
    input.full_description != null ||
    input.cover_image_url != null ||
    input.hero_image_url != null ||
    input.rules_summary != null ||
    input.scoring_rows != null ||
    input.timeline_steps != null ||
    input.day_schedule != null ||
    input.event_starts_at != null ||
    input.period_override != null ||
    input.secretary_name != null ||
    input.related_league_ids != null ||
    input.judging_path != null ||
    input.technical_committee_notes != null

  const payload = hasDetail ? leaguePayload(input) : leaguePayloadBasic(input)
  const { data, error } = await supabase
    .from('leagues')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data as League
}

export async function deleteLeague(id: string): Promise<void> {
  const { error } = await supabase.from('leagues').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function fetchLeagueFiles(leagueId: string): Promise<LeagueFile[]> {
  const { data, error } = await supabase
    .from('league_files')
    .select('*')
    .eq('league_id', leagueId)
    .order('sort_order')
  if (error) throw new Error(error.message)
  return (data ?? []) as LeagueFile[]
}

export async function upsertLeagueFile(input: {
  id?: string
  league_id: string
  title: string
  file_url: string
  file_kind?: string
  sort_order?: number
}): Promise<LeagueFile> {
  const payload = {
    league_id: input.league_id,
    title: input.title.trim(),
    file_url: input.file_url.trim(),
    file_kind: input.file_kind || 'other',
    sort_order: input.sort_order ?? 0,
  }
  if (input.id) {
    const { data, error } = await supabase
      .from('league_files')
      .update(payload)
      .eq('id', input.id)
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    return data as LeagueFile
  }
  const { data, error } = await supabase.from('league_files').insert(payload).select('*').single()
  if (error) throw new Error(error.message)
  return data as LeagueFile
}

export async function deleteLeagueFile(id: string): Promise<void> {
  const { error } = await supabase.from('league_files').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function fetchLeaguePeople(leagueId: string): Promise<LeaguePerson[]> {
  const { data, error } = await supabase
    .from('league_people')
    .select('*')
    .eq('league_id', leagueId)
    .order('sort_order')
  if (error) throw new Error(error.message)
  return (data ?? []) as LeaguePerson[]
}

export async function upsertLeaguePerson(input: {
  id?: string
  league_id: string
  full_name: string
  photo_url?: string | null
  specialty?: string | null
  bio?: string | null
  role_kind?: string
  sort_order?: number
}): Promise<LeaguePerson> {
  const payload = {
    league_id: input.league_id,
    full_name: input.full_name.trim(),
    photo_url: input.photo_url || null,
    specialty: input.specialty || null,
    bio: input.bio || null,
    role_kind: input.role_kind || 'judge',
    sort_order: input.sort_order ?? 0,
  }
  if (input.id) {
    const { data, error } = await supabase
      .from('league_people')
      .update(payload)
      .eq('id', input.id)
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    return data as LeaguePerson
  }
  const { data, error } = await supabase.from('league_people').insert(payload).select('*').single()
  if (error) throw new Error(error.message)
  return data as LeaguePerson
}

export async function deleteLeaguePerson(id: string): Promise<void> {
  const { error } = await supabase.from('league_people').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function fetchLeagueSponsors(leagueId: string): Promise<LeagueSponsor[]> {
  const { data, error } = await supabase
    .from('league_sponsors')
    .select('*')
    .eq('league_id', leagueId)
    .order('sort_order')
  if (error) throw new Error(error.message)
  return (data ?? []) as LeagueSponsor[]
}

export async function upsertLeagueSponsor(input: {
  id?: string
  league_id: string
  name: string
  logo_url?: string | null
  website_url?: string | null
  sort_order?: number
}): Promise<LeagueSponsor> {
  const payload = {
    league_id: input.league_id,
    name: input.name.trim(),
    logo_url: input.logo_url || null,
    website_url: input.website_url || null,
    sort_order: input.sort_order ?? 0,
  }
  if (input.id) {
    const { data, error } = await supabase
      .from('league_sponsors')
      .update(payload)
      .eq('id', input.id)
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    return data as LeagueSponsor
  }
  const { data, error } = await supabase.from('league_sponsors').insert(payload).select('*').single()
  if (error) throw new Error(error.message)
  return data as LeagueSponsor
}

export async function deleteLeagueSponsor(id: string): Promise<void> {
  const { error } = await supabase.from('league_sponsors').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function fetchLeagueFaqs(leagueId: string): Promise<LeagueFaq[]> {
  const { data, error } = await supabase
    .from('league_faqs')
    .select('*')
    .eq('league_id', leagueId)
    .order('sort_order')
  if (error) throw new Error(error.message)
  return (data ?? []) as LeagueFaq[]
}

export async function upsertLeagueFaq(input: {
  id?: string
  league_id: string
  question: string
  answer: string
  sort_order?: number
}): Promise<LeagueFaq> {
  const payload = {
    league_id: input.league_id,
    question: input.question.trim(),
    answer: input.answer.trim(),
    sort_order: input.sort_order ?? 0,
  }
  if (input.id) {
    const { data, error } = await supabase
      .from('league_faqs')
      .update(payload)
      .eq('id', input.id)
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    return data as LeagueFaq
  }
  const { data, error } = await supabase.from('league_faqs').insert(payload).select('*').single()
  if (error) throw new Error(error.message)
  return data as LeagueFaq
}

export async function deleteLeagueFaq(id: string): Promise<void> {
  const { error } = await supabase.from('league_faqs').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function fetchLeaguePastResults(leagueId: string): Promise<LeaguePastResult[]> {
  const { data, error } = await supabase
    .from('league_past_results')
    .select('*')
    .eq('league_id', leagueId)
    .order('season_year', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as LeaguePastResult[]
}

export async function upsertLeaguePastResult(input: {
  id?: string
  league_id: string
  season_year: number
  first_place?: string | null
  second_place?: string | null
  third_place?: string | null
}): Promise<LeaguePastResult> {
  const payload = {
    league_id: input.league_id,
    season_year: input.season_year,
    first_place: input.first_place || null,
    second_place: input.second_place || null,
    third_place: input.third_place || null,
  }
  if (input.id) {
    const { data, error } = await supabase
      .from('league_past_results')
      .update(payload)
      .eq('id', input.id)
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    return data as LeaguePastResult
  }
  const { data, error } = await supabase
    .from('league_past_results')
    .insert(payload)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data as LeaguePastResult
}

export async function deleteLeaguePastResult(id: string): Promise<void> {
  const { error } = await supabase.from('league_past_results').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function fetchAllProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase.from('profiles').select('*').order('created_at', {
    ascending: false,
  })
  if (error) throw new Error(error.message)
  return (data ?? []) as Profile[]
}

export async function setUserRole(userId: string, role: UserRole): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .update({ role })
    .eq('id', userId)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data as Profile
}

export async function adminUpdateProfile(input: {
  userId: string
  fullName?: string
  phone?: string
  nationalId?: string | null
  address?: string | null
  companyName?: string | null
  companyNationalId?: string | null
  economicCode?: string | null
  email?: string | null
}): Promise<Profile> {
  const { data, error } = await supabase.rpc('admin_update_profile', {
    p_user_id: input.userId,
    p_full_name: input.fullName ?? null,
    p_phone: input.phone ?? null,
    p_national_id: input.nationalId ?? null,
    p_address: input.address ?? null,
    p_company_name: input.companyName ?? null,
    p_company_national_id: input.companyNationalId ?? null,
    p_economic_code: input.economicCode ?? null,
    p_email: input.email ?? null,
  })
  if (error) throw new Error(error.message)
  return data as Profile
}

export async function fetchLeagueAdmins(leagueId?: string): Promise<LeagueAdminRow[]> {
  let query = supabase.from('league_admins').select('*')
  if (leagueId) query = query.eq('league_id', leagueId)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []) as LeagueAdminRow[]
}

export async function assignLeagueAdmin(leagueId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('league_admins')
    .upsert({ league_id: leagueId, user_id: userId })
  if (error) throw new Error(error.message)
}

export async function removeLeagueAdmin(leagueId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('league_admins')
    .delete()
    .eq('league_id', leagueId)
    .eq('user_id', userId)
  if (error) throw new Error(error.message)
}

export async function fetchStaticPages(): Promise<StaticPage[]> {
  const { data, error } = await supabase.from('static_pages').select('*').order('slug')
  if (error) throw new Error(error.message)
  return (data ?? []) as StaticPage[]
}

export async function fetchStaticPage(slug: string): Promise<StaticPage | null> {
  const { data, error } = await supabase
    .from('static_pages')
    .select('*')
    .eq('slug', slug)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data as StaticPage | null
}

export async function upsertStaticPage(input: {
  slug: string
  title: string
  body: string
  excerpt?: string | null
  seo_title?: string | null
  meta_description?: string | null
  og_image?: string | null
  cover_image?: string | null
}): Promise<StaticPage> {
  const { data, error } = await supabase
    .from('static_pages')
    .upsert({
      slug: input.slug,
      title: input.title.trim(),
      body: input.body,
      excerpt: input.excerpt?.trim() || null,
      seo_title: input.seo_title?.trim() || null,
      meta_description: input.meta_description?.trim() || null,
      og_image: input.og_image ?? null,
      cover_image: input.cover_image ?? null,
      updated_at: new Date().toISOString(),
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data as StaticPage
}

export function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fromDatetimeLocalValue(value: string): string | null {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

export function listToLines(list: string[] | null | undefined): string {
  return (list ?? []).join('\n')
}

export function linesToList(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean)
}

export function scoringToText(rows: LeagueScoringRow[] | null | undefined): string {
  return (rows ?? []).map((r) => `${r.label} | ${r.points}`).join('\n')
}

export function textToScoring(text: string): LeagueScoringRow[] {
  return linesToList(text).map((line) => {
    const [label, ...rest] = line.split('|')
    return { label: (label ?? '').trim(), points: rest.join('|').trim() || '0' }
  })
}

export function timelineToText(rows: LeagueTimelineStep[] | null | undefined): string {
  return (rows ?? [])
    .map((r) => [r.title, r.date, r.description].filter(Boolean).join(' | '))
    .join('\n')
}

export function textToTimeline(text: string): LeagueTimelineStep[] {
  return linesToList(text).map((line) => {
    const [title, date, ...rest] = line.split('|').map((x) => x.trim())
    return { title: title || '', date: date || undefined, description: rest.join(' | ') || undefined }
  })
}

export function scheduleToText(rows: LeagueDaySlot[] | null | undefined): string {
  return (rows ?? [])
    .map((r) => [r.time, r.title, r.description].filter(Boolean).join(' | '))
    .join('\n')
}

export function textToSchedule(text: string): LeagueDaySlot[] {
  return linesToList(text).map((line) => {
    const [time, title, ...rest] = line.split('|').map((x) => x.trim())
    return { time: time || '', title: title || '', description: rest.join(' | ') || undefined }
  })
}
