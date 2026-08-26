import { backend } from '@/lib/backend'
import type { League, LeaguePerson } from '@/types/database'

export type PublicPersonProfile = {
  person: LeaguePerson
  league: League
}

export async function fetchPersonProfile(slug: string): Promise<PublicPersonProfile | null> {
  const { data: person, error } = await backend
    .from('league_people')
    .select('*')
    .eq('slug', slug)
    .eq('is_profile_published', true)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!person) return null

  const { data: league, error: leagueError } = await backend
    .from('leagues')
    .select('*')
    .eq('id', person.league_id)
    .maybeSingle()
  if (leagueError) throw new Error(leagueError.message)
  if (!league) return null
  return { person: person as LeaguePerson, league: league as League }
}

