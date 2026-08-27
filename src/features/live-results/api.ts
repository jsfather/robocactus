import { backend } from '@/lib/backend'
import { computeLeaguePeriod } from '@/features/leagues/period'
import type { League, ResultRow } from '@/types/database'
import type { RankingsRow } from '@/features/rankings/api'

export type ResultsBoardMode = 'live' | 'final'

export type LiveLeagueBoard = {
  league: League
  mode: ResultsBoardMode
  rows: RankingsRow[]
}

function mapResultRow(row: Record<string, unknown>): RankingsRow {
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
  }
}

async function hydrateResultRows(resultRows: ResultRow[]): Promise<RankingsRow[]> {
  if (!resultRows.length) return []
  const teamIds = [...new Set(resultRows.map((row) => row.team_id))]
  const companyIds = [...new Set(resultRows.map((row) => row.company_id))]
  const leagueIds = [...new Set(resultRows.map((row) => row.league_id))]
  const [teamsResponse, companiesResponse, leaguesResponse] = await Promise.all([
    backend.from('teams').select('id, name').in('id', teamIds),
    backend.from('companies').select('id, name, slug, logo_url').in('id', companyIds),
    backend.from('leagues').select('id, name, slug').in('id', leagueIds),
  ])
  const relatedError = teamsResponse.error ?? companiesResponse.error ?? leaguesResponse.error
  if (relatedError) throw new Error(relatedError.message)

  const teams = new Map(((teamsResponse.data ?? []) as Array<{ id: string; name: string }>).map((row) => [row.id, row]))
  const companies = new Map(((companiesResponse.data ?? []) as Array<{ id: string; name: string; slug: string; logo_url: string | null }>).map((row) => [row.id, row]))
  const leagues = new Map(((leaguesResponse.data ?? []) as Array<{ id: string; name: string; slug: string }>).map((row) => [row.id, row]))

  return resultRows.map((row) => mapResultRow({
    ...row,
    teams: teams.get(row.team_id) ?? null,
    companies: companies.get(row.company_id) ?? null,
    leagues: leagues.get(row.league_id) ?? null,
  }))
}

/** Resolve public board mode from explicit status or competition period. */
export function resolveResultsBoardMode(league: League): ResultsBoardMode | null {
  const status = league.results_status ?? 'auto'
  if (status === 'hidden') return null
  if (status === 'live') return 'live'
  if (status === 'final') return 'final'

  const period = computeLeaguePeriod(league)
  if (period === 'ongoing') return 'live'
  if (period === 'ended') return 'final'
  return null
}

export async function fetchLiveResultsBoards(): Promise<LiveLeagueBoard[]> {
  const { data: leaguesRaw, error: leaguesError } = await backend
    .from('leagues')
    .select('*')
    .eq('is_active', true)
    .order('name')
  if (leaguesError) throw new Error(leaguesError.message)

  const leagues = (leaguesRaw ?? []) as League[]
  const candidates = leagues
    .map((league) => ({ league, mode: resolveResultsBoardMode(league) }))
    .filter((x): x is { league: League; mode: ResultsBoardMode } => x.mode != null)

  if (!candidates.length) return []

  const leagueIds = candidates.map((c) => c.league.id)
  const { data: resultsRaw, error: resultsError } = await backend
    .from('results')
    .select('id, league_id, team_id, company_id, season_year, rank, score, notes, published_at')
    .in('league_id', leagueIds)
    .eq('notes', 'official_multi_judge_engine')
    .order('rank', { ascending: true })
    .order('score', { ascending: false })

  if (resultsError) throw new Error(resultsError.message)

  const allRows = await hydrateResultRows((resultsRaw ?? []) as ResultRow[])

  const boards: LiveLeagueBoard[] = []
  for (const { league, mode } of candidates) {
    let rows = allRows.filter((r) => r.league_id === league.id)

    // Final boards prefer published rows; fall back to any if all unpublished
    if (mode === 'final') {
      const published = rows.filter((r) => r.published_at)
      if (published.length) rows = published
    }

    rows = [...rows].sort((a, b) => {
      const ra = a.rank ?? 9999
      const rb = b.rank ?? 9999
      if (ra !== rb) return ra - rb
      return (b.score ?? 0) - (a.score ?? 0)
    })

    // Skip empty final boards that were only auto-ended with no data
    if (mode === 'final' && rows.length === 0 && (league.results_status ?? 'auto') === 'auto') {
      continue
    }

    boards.push({ league, mode, rows })
  }

  // Live first, then final
  return boards.sort((a, b) => {
    if (a.mode !== b.mode) return a.mode === 'live' ? -1 : 1
    return a.league.name.localeCompare(b.league.name, 'fa')
  })
}

export async function setLeagueResultsStatus(
  leagueId: string,
  status: 'auto' | 'hidden' | 'live' | 'final',
): Promise<League> {
  const { data, error } = await backend.rpc('set_league_results_status', {
    p_league_id: leagueId,
    p_status: status,
  })
  if (error) throw new Error(error.message)
  return data as League
}

export async function fetchTeamPublishedResult(teamId: string): Promise<ResultRow | null> {
  const { data, error } = await backend
    .from('results')
    .select('*')
    .eq('team_id', teamId)
    .not('published_at', 'is', null)
    .order('season_year', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data as ResultRow | null
}

export async function fetchCompanyPublishedResults(companyId: string): Promise<RankingsRow[]> {
  const { data, error } = await backend
    .from('results')
    .select('id, league_id, team_id, company_id, season_year, rank, score, notes, published_at')
    .eq('company_id', companyId)
    .not('published_at', 'is', null)
    .order('season_year', { ascending: false })
    .order('rank', { ascending: true })
    .limit(30)
  if (error) throw new Error(error.message)
  return hydrateResultRows((data ?? []) as ResultRow[])
}
