import { backend } from '@/lib/backend'
import type { League, LeaguePerson } from '@/types/database'

export type PublicPersonProfile = {
  person: LeaguePerson
  league: League
  leagues: League[]
}

export async function fetchPersonProfile(slug: string): Promise<PublicPersonProfile | null> {
  const { data: people, error } = await backend
    .from('public_league_people')
    .select('*')
    .eq('slug', slug)
    .eq('is_profile_published', true)
    .order('assignment_sort_order')
    .limit(100)
  if (error) throw new Error(error.message)
  const person = people?.[0]
  if (!person) return null

  const leagueIds = [...new Set((people as Array<{ league_id?: string }> ?? []).map((row) => row.league_id).filter((value): value is string => Boolean(value)))]
  const { data: leagues, error: leagueError } = await backend
    .from('leagues')
    .select('*')
    .in('id', leagueIds)
    .eq('is_active', true)
  if (leagueError) throw new Error(leagueError.message)
  const visibleLeagues = (leagues ?? []) as League[]
  const league = visibleLeagues.find((item) => item.id === person.league_id)
  if (!league) return null
  return { person: person as LeaguePerson, league, leagues: visibleLeagues }
}
