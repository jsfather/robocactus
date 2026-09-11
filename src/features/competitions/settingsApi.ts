import { backend } from '@/lib/backend'
import { slugify } from '@/lib/validation'
import type {
  CompetitionPerson,
  CompetitionPersonLeague,
  CompetitionSponsor,
  CompetitionSponsorLeague,
  League,
} from '@/types/database'

export type CompetitionPersonInput = Omit<CompetitionPerson, 'id' | 'created_at' | 'updated_at' | 'league_id' | 'assignment_sort_order'> & {
  id?: string
}

export type CompetitionSponsorInput = Omit<CompetitionSponsor, 'id' | 'created_at' | 'league_id' | 'assignment_sort_order'> & {
  id?: string
}

export async function fetchCompetitionSettings() {
  const [leagues, people, personLeagues, sponsors, sponsorLeagues] = await Promise.all([
    backend.from('leagues').select('id,name,name_en,judging_enabled,is_active').order('name'),
    backend.from('competition_people').select('*').order('sort_order').order('full_name'),
    backend.from('competition_people_leagues').select('person_id,league_id,sort_order'),
    backend.from('competition_sponsors').select('*').order('sort_order').order('name'),
    backend.from('competition_sponsor_leagues').select('sponsor_id,league_id,sort_order'),
  ])
  const failed = [leagues, people, personLeagues, sponsors, sponsorLeagues].find((result) => result.error)
  if (failed?.error) throw new Error(failed.error.message)
  return {
    leagues: (leagues.data ?? []) as League[],
    people: (people.data ?? []) as CompetitionPerson[],
    personLeagues: (personLeagues.data ?? []) as CompetitionPersonLeague[],
    sponsors: (sponsors.data ?? []) as CompetitionSponsor[],
    sponsorLeagues: (sponsorLeagues.data ?? []) as CompetitionSponsorLeague[],
  }
}

function personPayload(input: CompetitionPersonInput) {
  return {
    slug: slugify(input.slug || input.full_name_en || input.full_name) || `person-${Date.now()}`,
    full_name: input.full_name.trim(),
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
    is_profile_published: input.is_profile_published !== false,
    role_kind: input.role_kind === 'committee' ? 'committee' : 'judge',
    sort_order: input.sort_order ?? 0,
    updated_at: new Date().toISOString(),
  }
}

export async function upsertCompetitionPerson(input: CompetitionPersonInput): Promise<CompetitionPerson> {
  const payload = personPayload(input)
  const query = input.id
    ? backend.from('competition_people').update(payload).eq('id', input.id)
    : backend.from('competition_people').insert(payload)
  const { data, error } = await query.select('*').single()
  if (error) throw new Error(error.message)
  return data as CompetitionPerson
}

export async function deleteCompetitionPerson(id: string): Promise<void> {
  const { error } = await backend.from('competition_people').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function setCompetitionPersonLeagues(personId: string, leagueIds: string[]): Promise<void> {
  const { error } = await backend.rpc('set_competition_person_leagues', { p_person_id: personId, p_league_ids: leagueIds })
  if (error) throw new Error(error.message)
}

function sponsorPayload(input: CompetitionSponsorInput) {
  return {
    name: input.name.trim(),
    name_en: input.name_en?.trim() || null,
    logo_url: input.logo_url || null,
    website_url: input.website_url || null,
    sort_order: input.sort_order ?? 0,
    updated_at: new Date().toISOString(),
  }
}

export async function upsertCompetitionSponsor(input: CompetitionSponsorInput): Promise<CompetitionSponsor> {
  const payload = sponsorPayload(input)
  const query = input.id
    ? backend.from('competition_sponsors').update(payload).eq('id', input.id)
    : backend.from('competition_sponsors').insert(payload)
  const { data, error } = await query.select('*').single()
  if (error) throw new Error(error.message)
  return data as CompetitionSponsor
}

export async function deleteCompetitionSponsor(id: string): Promise<void> {
  const { error } = await backend.from('competition_sponsors').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function setCompetitionSponsorLeagues(sponsorId: string, leagueIds: string[]): Promise<void> {
  const { error } = await backend.rpc('set_competition_sponsor_leagues', { p_sponsor_id: sponsorId, p_league_ids: leagueIds })
  if (error) throw new Error(error.message)
}

export async function setLeagueJudgingEnabled(leagueId: string, enabled: boolean): Promise<void> {
  const { error } = await backend.from('leagues').update({ judging_enabled: enabled }).eq('id', leagueId)
  if (error) throw new Error(error.message)
}
