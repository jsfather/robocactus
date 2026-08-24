import { backend } from '@/lib/backend'
import type { Company, CompanyAchievement, League, ResultRow, Team } from '@/types/database'

export type RankingsRow = ResultRow & {
  team_name: string
  company_name: string
  company_slug: string
  company_logo_url: string | null
  league_name: string
  league_slug: string
}

export type CompanyProfileBundle = {
  company: Company
  achievements: CompanyAchievement[]
  results: RankingsRow[]
  activeTeams: Array<Team & { league_name: string }>
}

export async function fetchPublishedRankings(filters?: {
  year?: number
  leagueId?: string
  q?: string
}): Promise<RankingsRow[]> {
  let query = backend
    .from('results')
    .select(
      `
      id,
      league_id,
      team_id,
      company_id,
      season_year,
      rank,
      score,
      notes,
      published_at,
      teams ( name ),
      companies ( name, slug, logo_url ),
      leagues ( name, slug )
    `,
    )
    .not('published_at', 'is', null)
    .order('season_year', { ascending: false })
    .order('rank', { ascending: true })

  if (filters?.year) query = query.eq('season_year', filters.year)
  if (filters?.leagueId) query = query.eq('league_id', filters.leagueId)

  const { data, error } = await query
  if (error) throw new Error(error.message)

  const rows = ((data ?? []) as Array<Record<string, unknown>>).map((row) => {
    const team = row.teams as { name?: string } | null
    const company = row.companies as {
      name?: string
      slug?: string
      logo_url?: string | null
    } | null
    const league = row.leagues as { name?: string; slug?: string } | null

    return {
      id: String(row.id),
      league_id: String(row.league_id),
      team_id: String(row.team_id),
      company_id: String(row.company_id),
      season_year: Number(row.season_year),
      rank: row.rank == null ? null : Number(row.rank),
      score: row.score == null ? null : Number(row.score),
      notes: (row.notes as string | null) ?? null,
      published_at: (row.published_at as string | null) ?? null,
      team_name: team?.name ?? '—',
      company_name: company?.name ?? '—',
      company_slug: company?.slug ?? '',
      company_logo_url: company?.logo_url ?? null,
      league_name: league?.name ?? '—',
      league_slug: league?.slug ?? '',
    } satisfies RankingsRow
  })

  const q = filters?.q?.trim().toLowerCase()
  if (!q) return rows

  return rows.filter(
    (r) =>
      r.team_name.toLowerCase().includes(q) ||
      r.company_name.toLowerCase().includes(q) ||
      r.league_name.toLowerCase().includes(q),
  )
}

export async function fetchRankingYears(): Promise<number[]> {
  const { data, error } = await backend
    .from('results')
    .select('season_year')
    .not('published_at', 'is', null)

  if (error) throw new Error(error.message)
  const years = new Set<number>()
  for (const row of data ?? []) {
    years.add(Number((row as { season_year: number }).season_year))
  }
  return [...years].sort((a, b) => b - a)
}

export async function fetchPublicCompanies(q?: string): Promise<Company[]> {
  let query = backend.from('companies').select('*').order('name')
  const { data, error } = await query
  if (error) throw new Error(error.message)

  const list = (data ?? []) as Company[]
  const needle = q?.trim().toLowerCase()
  if (!needle) return list
  return list.filter(
    (c) =>
      c.name.toLowerCase().includes(needle) ||
      c.slug.toLowerCase().includes(needle) ||
      (c.bio ?? '').toLowerCase().includes(needle),
  )
}

export async function fetchCompanyBySlug(slug: string): Promise<Company | null> {
  const { data, error } = await backend
    .from('companies')
    .select('*')
    .eq('slug', slug)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data as Company | null
}

export async function fetchCompanyProfile(slug: string): Promise<CompanyProfileBundle | null> {
  const company = await fetchCompanyBySlug(slug)
  if (!company) return null

  const [achievementsRes, results, teamsRes, leagues] = await Promise.all([
    backend
      .from('company_achievements')
      .select('*')
      .eq('company_id', company.id)
      .order('year', { ascending: false }),
    fetchPublishedRankings({}),
    backend
      .from('teams')
      .select('*')
      .eq('company_id', company.id)
      .in('status', ['submitted', 'under_review', 'approved', 'waitlisted'])
      .order('created_at', { ascending: false }),
    backend.from('leagues').select('id, name'),
  ])

  if (achievementsRes.error) throw new Error(achievementsRes.error.message)

  const leagueMap = new Map(
    ((leagues.data ?? []) as Array<{ id: string; name: string }>).map((l) => [l.id, l.name]),
  )

  const companyResults = results.filter((r) => r.company_id === company.id)
  const teamRows = teamsRes.error ? [] : ((teamsRes.data ?? []) as Team[])
  const activeTeams = teamRows.map((team) => ({
    ...team,
    league_name: leagueMap.get(team.league_id) ?? team.league_id.slice(0, 8),
  }))

  return {
    company,
    achievements: (achievementsRes.data ?? []) as CompanyAchievement[],
    results: companyResults,
    activeTeams,
  }
}

export function championshipsFromResults(results: RankingsRow[]): RankingsRow[] {
  return results
    .filter((r) => r.rank != null && r.rank >= 1 && r.rank <= 3)
    .sort((a, b) => {
      if (b.season_year !== a.season_year) return b.season_year - a.season_year
      return (a.rank ?? 99) - (b.rank ?? 99)
    })
}

export async function fetchLeaguesForFilter(): Promise<League[]> {
  const { data, error } = await backend.from('leagues').select('*').order('name')
  if (error) throw new Error(error.message)
  return (data ?? []) as League[]
}
