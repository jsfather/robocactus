import { backend } from '@/lib/backend'
import type {
  Announcement,
  GalleryItem,
  League,
  LeagueFaq,
  LeagueFile,
  LeaguePastResult,
  LeaguePerson,
  LeagueSponsor,
} from '@/types/database'
import type { AttendanceSettings } from '@/features/attendance/api'

export type LeagueDetailBundle = {
  league: League
  files: LeagueFile[]
  judges: LeaguePerson[]
  committee: LeaguePerson[]
  sponsors: LeagueSponsor[]
  faqs: LeagueFaq[]
  pastResults: LeaguePastResult[]
  gallery: GalleryItem[]
  news: Announcement[]
  related: League[]
  registeredCount: number
  attendanceSettings: AttendanceSettings | null
  participants: PublicLeagueParticipant[]
}

export type PublicLeagueParticipant = {
  team_id: string; league_id: string; season_year: number; season_month: number
  team_name: string; team_name_en: string | null; organization_name: string | null; organization_name_en: string | null
  captain_name_fa: string | null; captain_name_en: string | null; country_code: string; member_count: number
  public_status: 'confirmed' | 'pending' | 'withdrawn'
}

export async function fetchLeagueBySlug(slug: string): Promise<League | null> {
  const { data, error } = await backend
    .from('leagues')
    .select('*')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data as League | null
}

export async function fetchLeagueDetailBundle(slug: string): Promise<LeagueDetailBundle | null> {
  const league = await fetchLeagueBySlug(slug)
  if (!league) return null

  const [
    filesRes,
    peopleRes,
    sponsorsRes,
    faqsRes,
    pastRes,
    galleryRes,
    newsRes,
    countRes,
    attendanceRes,
    participantsRes,
  ] = await Promise.all([
    backend.from('league_files').select('*').eq('league_id', league.id).order('sort_order'),
    backend.from('league_people').select('*').eq('league_id', league.id).order('sort_order'),
    backend.from('league_sponsors').select('*').eq('league_id', league.id).order('sort_order'),
    backend.from('league_faqs').select('*').eq('league_id', league.id).order('sort_order'),
    backend
      .from('league_past_results')
      .select('*')
      .eq('league_id', league.id)
      .order('season_year', { ascending: false }),
    backend
      .from('gallery_items')
      .select('*')
      .eq('league_id', league.id)
      .order('created_at', { ascending: false })
      .limit(12),
    backend
      .from('announcements')
      .select('*')
      .eq('league_id', league.id)
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(5),
    backend.rpc('league_registered_count', { p_league_id: league.id }),
    backend.from('league_attendance_settings').select('*').eq('league_id', league.id).maybeSingle(),
    backend.from('public_league_participants').select('*').eq('league_id', league.id).order('team_name'),
  ])

  for (const res of [filesRes, peopleRes, sponsorsRes, faqsRes, pastRes, galleryRes, newsRes, attendanceRes, participantsRes]) {
    if (res.error) throw new Error(res.error.message)
  }
  if (countRes.error) throw new Error(countRes.error.message)

  const people = (peopleRes.data ?? []) as LeaguePerson[]
  const relatedIds = (league.related_league_ids ?? []) as string[]
  let related: League[] = []
  if (relatedIds.length) {
    const { data, error } = await backend
      .from('leagues')
      .select('*')
      .in('id', relatedIds)
      .eq('is_active', true)
    if (error) throw new Error(error.message)
    related = (data ?? []) as League[]
  }

  return {
    league,
    files: (filesRes.data ?? []) as LeagueFile[],
    judges: people.filter((p) => p.role_kind === 'judge'),
    committee: people.filter((p) => p.role_kind === 'committee'),
    sponsors: (sponsorsRes.data ?? []) as LeagueSponsor[],
    faqs: (faqsRes.data ?? []) as LeagueFaq[],
    pastResults: (pastRes.data ?? []) as LeaguePastResult[],
    gallery: (galleryRes.data ?? []) as GalleryItem[],
    news: (newsRes.data ?? []) as Announcement[],
    related,
    registeredCount: Number(countRes.data ?? 0),
    attendanceSettings: (attendanceRes.data as AttendanceSettings | null) ?? null,
    participants: (participantsRes.data ?? []) as PublicLeagueParticipant[],
  }
}
