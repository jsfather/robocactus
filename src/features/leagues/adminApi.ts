import { backend } from '@/lib/backend'
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
  name_en?: string | null
  slug?: string
  description?: string | null
  description_en?: string | null
  category?: string | null
  category_en?: string | null
  capacity?: number | null
  registration_fee?: number
  captain_fee?: number
  member_fee?: number
  team_edit_deadline?: string | null
  min_age?: number | null
  max_age?: number | null
  current_season_year?: number
  registration_cycle_status?: string
  registration_open_at?: string | null
  registration_close_at?: string | null
  contact_email?: string | null
  is_active?: boolean
  short_description?: string | null
  short_description_en?: string | null
  full_description?: string | null
  full_description_en?: string | null
  cover_image_url?: string | null
  hero_image_url?: string | null
  hero_video_url?: string | null
  intro_video_url?: string | null
  regulation_pdf_url?: string | null
  rules_summary?: string | null
  rules_summary_en?: string | null
  rules_pdf_url?: string | null
  age_range?: string | null
  age_range_en?: string | null
  participation_mode?: string | null
  team_size_min?: number | null
  team_size_max?: number | null
  event_starts_at?: string | null
  event_ends_at?: string | null
  venue_name?: string | null
  venue_name_en?: string | null
  venue_address?: string | null
  venue_address_en?: string | null
  venue_map_embed_url?: string | null
  difficulty_level?: string | null
  difficulty_level_en?: string | null
  competition_language?: string | null
  competition_language_en?: string | null
  scoring_rows?: LeagueScoringRow[]
  scoring_rows_en?: LeagueScoringRow[]
  timeline_steps?: LeagueTimelineStep[]
  timeline_steps_en?: LeagueTimelineStep[]
  day_schedule?: LeagueDaySlot[]
  day_schedule_en?: LeagueDaySlot[]
  allowed_equipment?: string[]
  allowed_equipment_en?: string[]
  forbidden_equipment?: string[]
  forbidden_equipment_en?: string[]
  discount_info?: string | null
  discount_info_en?: string | null
  refund_policy?: string | null
  refund_policy_en?: string | null
  show_registered_count?: boolean
  period_override?: string | null
  secretary_name?: string | null
  secretary_name_en?: string | null
  secretary_phone?: string | null
  secretary_telegram?: string | null
  related_league_ids?: string[]
  judging_path?: string | null
  judging_path_en?: string | null
  technical_committee_notes?: string | null
  technical_committee_notes_en?: string | null
  results_status?: 'auto' | 'hidden' | 'live' | 'final' | string | null
}

function leaguePayloadBasic(input: LeagueInput) {
  return {
    name: input.name.trim(),
    name_en: input.name_en?.trim() || null,
    slug: slugify(input.slug || input.name),
    description: input.description ?? null,
    description_en: input.description_en ?? null,
    category: input.category ?? null,
    category_en: input.category_en ?? null,
    capacity: input.capacity ?? null,
    registration_fee: input.registration_fee ?? 0,
    captain_fee: input.captain_fee ?? 0,
    member_fee: input.member_fee ?? 0,
    team_edit_deadline: input.team_edit_deadline || null,
    min_age: input.min_age ?? null,
    max_age: input.max_age ?? null,
    current_season_year: input.current_season_year ?? new Date().getFullYear(),
    registration_cycle_status: input.registration_cycle_status ?? 'open',
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
    short_description_en: input.short_description_en ?? null,
    full_description: input.full_description ?? null,
    full_description_en: input.full_description_en ?? null,
    cover_image_url: input.cover_image_url || null,
    hero_image_url: input.hero_image_url || null,
    hero_video_url: input.hero_video_url || null,
    intro_video_url: input.intro_video_url || null,
    regulation_pdf_url: input.regulation_pdf_url || null,
    rules_summary: input.rules_summary ?? null,
    rules_summary_en: input.rules_summary_en ?? null,
    rules_pdf_url: input.rules_pdf_url || null,
    age_range: input.age_range || null,
    age_range_en: input.age_range_en || null,
    participation_mode: input.participation_mode || 'team',
    team_size_min: input.team_size_min ?? null,
    team_size_max: input.team_size_max ?? null,
    event_starts_at: input.event_starts_at || null,
    event_ends_at: input.event_ends_at || null,
    venue_name: input.venue_name || null,
    venue_name_en: input.venue_name_en || null,
    venue_address: input.venue_address || null,
    venue_address_en: input.venue_address_en || null,
    venue_map_embed_url: input.venue_map_embed_url || null,
    difficulty_level: input.difficulty_level || null,
    difficulty_level_en: input.difficulty_level_en || null,
    competition_language: input.competition_language || null,
    competition_language_en: input.competition_language_en || null,
    scoring_rows: input.scoring_rows ?? [],
    scoring_rows_en: input.scoring_rows_en ?? [],
    timeline_steps: input.timeline_steps ?? [],
    timeline_steps_en: input.timeline_steps_en ?? [],
    day_schedule: input.day_schedule ?? [],
    day_schedule_en: input.day_schedule_en ?? [],
    allowed_equipment: input.allowed_equipment ?? [],
    allowed_equipment_en: input.allowed_equipment_en ?? [],
    forbidden_equipment: input.forbidden_equipment ?? [],
    forbidden_equipment_en: input.forbidden_equipment_en ?? [],
    discount_info: input.discount_info ?? null,
    discount_info_en: input.discount_info_en ?? null,
    refund_policy: input.refund_policy ?? null,
    refund_policy_en: input.refund_policy_en ?? null,
    show_registered_count: input.show_registered_count ?? true,
    period_override: input.period_override || null,
    secretary_name: input.secretary_name || null,
    secretary_name_en: input.secretary_name_en || null,
    secretary_phone: input.secretary_phone || null,
    secretary_telegram: input.secretary_telegram || null,
    related_league_ids: input.related_league_ids ?? [],
    judging_path: input.judging_path ?? null,
    judging_path_en: input.judging_path_en ?? null,
    technical_committee_notes: input.technical_committee_notes ?? null,
    technical_committee_notes_en: input.technical_committee_notes_en ?? null,
    results_status: (input.results_status as string) || 'auto',
  }
}

export async function fetchAllLeagues(): Promise<League[]> {
  const { data, error } = await backend.from('leagues').select('*').order('created_at', {
    ascending: false,
  })
  if (error) throw new Error(error.message)
  return (data ?? []) as League[]
}

export async function fetchLeagueById(id: string): Promise<League | null> {
  const { data, error } = await backend.from('leagues').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  return data as League | null
}

export async function createLeague(input: LeagueInput): Promise<League> {
  const { data, error } = await backend
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
  const { data, error } = await backend
    .from('leagues')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data as League
}

export async function deleteLeague(id: string): Promise<void> {
  const { error } = await backend.from('leagues').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function fetchLeagueFiles(leagueId: string): Promise<LeagueFile[]> {
  const { data, error } = await backend
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
  title_en?: string | null
  file_url: string
  file_kind?: string
  sort_order?: number
}): Promise<LeagueFile> {
  const payload = {
    league_id: input.league_id,
    title: input.title.trim(),
    title_en: input.title_en?.trim() || null,
    file_url: input.file_url.trim(),
    file_kind: input.file_kind || 'other',
    sort_order: input.sort_order ?? 0,
  }
  if (input.id) {
    const { data, error } = await backend
      .from('league_files')
      .update(payload)
      .eq('id', input.id)
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    return data as LeagueFile
  }
  const { data, error } = await backend.from('league_files').insert(payload).select('*').single()
  if (error) throw new Error(error.message)
  return data as LeagueFile
}

export async function deleteLeagueFile(id: string): Promise<void> {
  const { error } = await backend.from('league_files').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function fetchLeaguePeople(leagueId: string): Promise<LeaguePerson[]> {
  const { data, error } = await backend
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
  slug?: string
  full_name_en?: string | null
  photo_url?: string | null
  specialty?: string | null
  specialty_en?: string | null
  bio?: string | null
  bio_en?: string | null
  identity_summary_fa?: string | null
  identity_summary_en?: string | null
  education_fa?: string | null
  education_en?: string | null
  honors_fa?: string | null
  honors_en?: string | null
  awards_fa?: string | null
  awards_en?: string | null
  courses_fa?: string | null
  courses_en?: string | null
  company_info_fa?: string | null
  company_info_en?: string | null
  birth_date?: string | null
  nationality_fa?: string | null
  nationality_en?: string | null
  city_fa?: string | null
  city_en?: string | null
  email?: string | null
  phone?: string | null
  website_url?: string | null
  linkedin_url?: string | null
  is_profile_published?: boolean
  role_kind?: string
  sort_order?: number
}): Promise<LeaguePerson> {
  const payload = {
    league_id: input.league_id,
    full_name: input.full_name.trim(),
    slug: slugify(input.slug || input.full_name_en || input.full_name) || `person-${Date.now()}`,
    full_name_en: input.full_name_en?.trim() || null,
    photo_url: input.photo_url || null,
    specialty: input.specialty || null,
    specialty_en: input.specialty_en || null,
    bio: input.bio || null,
    bio_en: input.bio_en || null,
    identity_summary_fa: input.identity_summary_fa || null,
    identity_summary_en: input.identity_summary_en || null,
    education_fa: input.education_fa || null,
    education_en: input.education_en || null,
    honors_fa: input.honors_fa || null,
    honors_en: input.honors_en || null,
    awards_fa: input.awards_fa || null,
    awards_en: input.awards_en || null,
    courses_fa: input.courses_fa || null,
    courses_en: input.courses_en || null,
    company_info_fa: input.company_info_fa || null,
    company_info_en: input.company_info_en || null,
    birth_date: input.birth_date || null,
    nationality_fa: input.nationality_fa || null,
    nationality_en: input.nationality_en || null,
    city_fa: input.city_fa || null,
    city_en: input.city_en || null,
    email: input.email || null,
    phone: input.phone || null,
    website_url: input.website_url || null,
    linkedin_url: input.linkedin_url || null,
    is_profile_published: input.is_profile_published ?? true,
    role_kind: input.role_kind || 'judge',
    sort_order: input.sort_order ?? 0,
    updated_at: new Date().toISOString(),
  }
  if (input.id) {
    const { data, error } = await backend
      .from('league_people')
      .update(payload)
      .eq('id', input.id)
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    return data as LeaguePerson
  }
  const { data, error } = await backend.from('league_people').insert(payload).select('*').single()
  if (error) throw new Error(error.message)
  return data as LeaguePerson
}

export async function deleteLeaguePerson(id: string): Promise<void> {
  const { error } = await backend.from('league_people').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function fetchLeagueSponsors(leagueId: string): Promise<LeagueSponsor[]> {
  const { data, error } = await backend
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
  name_en?: string | null
  logo_url?: string | null
  website_url?: string | null
  sort_order?: number
}): Promise<LeagueSponsor> {
  const payload = {
    league_id: input.league_id,
    name: input.name.trim(),
    name_en: input.name_en?.trim() || null,
    logo_url: input.logo_url || null,
    website_url: input.website_url || null,
    sort_order: input.sort_order ?? 0,
  }
  if (input.id) {
    const { data, error } = await backend
      .from('league_sponsors')
      .update(payload)
      .eq('id', input.id)
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    return data as LeagueSponsor
  }
  const { data, error } = await backend.from('league_sponsors').insert(payload).select('*').single()
  if (error) throw new Error(error.message)
  return data as LeagueSponsor
}

export async function deleteLeagueSponsor(id: string): Promise<void> {
  const { error } = await backend.from('league_sponsors').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function fetchLeagueFaqs(leagueId: string): Promise<LeagueFaq[]> {
  const { data, error } = await backend
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
  question_en?: string | null
  answer: string
  answer_en?: string | null
  sort_order?: number
}): Promise<LeagueFaq> {
  const payload = {
    league_id: input.league_id,
    question: input.question.trim(),
    question_en: input.question_en?.trim() || null,
    answer: input.answer.trim(),
    answer_en: input.answer_en?.trim() || null,
    sort_order: input.sort_order ?? 0,
  }
  if (input.id) {
    const { data, error } = await backend
      .from('league_faqs')
      .update(payload)
      .eq('id', input.id)
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    return data as LeagueFaq
  }
  const { data, error } = await backend.from('league_faqs').insert(payload).select('*').single()
  if (error) throw new Error(error.message)
  return data as LeagueFaq
}

export async function deleteLeagueFaq(id: string): Promise<void> {
  const { error } = await backend.from('league_faqs').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function fetchLeaguePastResults(leagueId: string): Promise<LeaguePastResult[]> {
  const { data, error } = await backend
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
    const { data, error } = await backend
      .from('league_past_results')
      .update(payload)
      .eq('id', input.id)
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    return data as LeaguePastResult
  }
  const { data, error } = await backend
    .from('league_past_results')
    .insert(payload)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data as LeaguePastResult
}

export async function deleteLeaguePastResult(id: string): Promise<void> {
  const { error } = await backend.from('league_past_results').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function fetchAllProfiles(): Promise<Profile[]> {
  const { data, error } = await backend.from('profiles').select('*').order('created_at', {
    ascending: false,
  })
  if (error) throw new Error(error.message)
  return (data ?? []) as Profile[]
}

export async function setUserRole(userId: string, role: UserRole): Promise<Profile> {
  const { data, error } = await backend
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
  const { data, error } = await backend.rpc('admin_update_profile', {
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
  let query = backend.from('league_admins').select('*')
  if (leagueId) query = query.eq('league_id', leagueId)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []) as LeagueAdminRow[]
}

export async function assignLeagueAdmin(leagueId: string, userId: string): Promise<void> {
  const { error } = await backend
    .from('league_admins')
    .upsert({ league_id: leagueId, user_id: userId })
  if (error) throw new Error(error.message)
}

export async function removeLeagueAdmin(leagueId: string, userId: string): Promise<void> {
  const { error } = await backend
    .from('league_admins')
    .delete()
    .eq('league_id', leagueId)
    .eq('user_id', userId)
  if (error) throw new Error(error.message)
}

export async function fetchStaticPages(): Promise<StaticPage[]> {
  const { data, error } = await backend.from('static_pages').select('*').order('slug')
  if (error) throw new Error(error.message)
  return (data ?? []) as StaticPage[]
}

export async function fetchStaticPage(slug: string): Promise<StaticPage | null> {
  const { data, error } = await backend
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
  const { data, error } = await backend
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
