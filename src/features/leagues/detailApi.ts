import { supabase } from '@/lib/supabase'
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
}

export async function fetchLeagueBySlug(slug: string): Promise<League | null> {
  const { data, error } = await supabase
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
  ] = await Promise.all([
    supabase.from('league_files').select('*').eq('league_id', league.id).order('sort_order'),
    supabase.from('league_people').select('*').eq('league_id', league.id).order('sort_order'),
    supabase.from('league_sponsors').select('*').eq('league_id', league.id).order('sort_order'),
    supabase.from('league_faqs').select('*').eq('league_id', league.id).order('sort_order'),
    supabase
      .from('league_past_results')
      .select('*')
      .eq('league_id', league.id)
      .order('season_year', { ascending: false }),
    supabase
      .from('gallery_items')
      .select('*')
      .eq('league_id', league.id)
      .order('created_at', { ascending: false })
      .limit(12),
    supabase
      .from('announcements')
      .select('*')
      .eq('league_id', league.id)
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(5),
    supabase.rpc('league_registered_count', { p_league_id: league.id }),
  ])

  for (const res of [filesRes, peopleRes, sponsorsRes, faqsRes, pastRes, galleryRes, newsRes]) {
    if (res.error) throw new Error(res.error.message)
  }
  if (countRes.error) throw new Error(countRes.error.message)

  const people = (peopleRes.data ?? []) as LeaguePerson[]
  const relatedIds = (league.related_league_ids ?? []) as string[]
  let related: League[] = []
  if (relatedIds.length) {
    const { data, error } = await supabase
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
  }
}
