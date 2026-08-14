import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, Input, PanelCard, Select } from '@/components/ui/FormControls'
import { fetchActiveLeagues } from '@/features/companies/api'
import {
  fetchPublishedRankings,
  fetchRankingYears,
  type RankingsRow,
} from '@/features/rankings/api'
import type { League } from '@/types/database'

export function RankingsPage() {
  const { t } = useTranslation()
  const [rows, setRows] = useState<RankingsRow[]>([])
  const [leagues, setLeagues] = useState<League[]>([])
  const [years, setYears] = useState<number[]>([])
  const [year, setYear] = useState('')
  const [leagueId, setLeagueId] = useState('')
  const [q, setQ] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = async (filters?: { year?: string; leagueId?: string; q?: string }) => {
    setLoading(true)
    setError(null)
    try {
      const [data, leagueList, yearList] = await Promise.all([
        fetchPublishedRankings({
          year: filters?.year ? Number(filters.year) : undefined,
          leagueId: filters?.leagueId || undefined,
          q: filters?.q || undefined,
        }),
        fetchActiveLeagues().catch(() => [] as League[]),
        fetchRankingYears(),
      ])
      setRows(data)
      setLeagues(leagueList)
      setYears(yearList)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onFilter = (event: FormEvent) => {
    event.preventDefault()
    void load({ year, leagueId, q })
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-12">
      <div>
        <h1 className="text-3xl font-semibold">{t('rankings.title')}</h1>
        <p className="mt-1 text-rc-muted">{t('rankings.subtitle')}</p>
      </div>

      <PanelCard title={t('rankings.filters')}>
        <form
          className="grid gap-3 md:grid-cols-[1fr_1fr_1.2fr_auto] md:items-end"
          onSubmit={onFilter}
        >
          <Select label={t('rankings.year')} value={year} onChange={(e) => setYear(e.target.value)}>
            <option value="">{t('rankings.allYears')}</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
          <Select
            label={t('team.league')}
            value={leagueId}
            onChange={(e) => setLeagueId(e.target.value)}
          >
            <option value="">{t('rankings.allLeagues')}</option>
            {leagues.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
          <Input
            label={t('rankings.search')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('rankings.searchPlaceholder')}
          />
          <Button type="submit" disabled={loading}>
            {loading ? t('app.loading') : t('rankings.apply')}
          </Button>
        </form>
      </PanelCard>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      {loading ? (
        <p className="text-rc-muted">{t('app.loading')}</p>
      ) : rows.length === 0 ? (
        <p className="text-rc-muted">{t('rankings.empty')}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.03] text-rc-muted">
                <th className="px-3 py-3 text-start font-medium">{t('rankings.year')}</th>
                <th className="px-3 py-3 text-start font-medium">{t('judging.rank')}</th>
                <th className="px-3 py-3 text-start font-medium">{t('team.name')}</th>
                <th className="px-3 py-3 text-start font-medium">{t('rankings.company')}</th>
                <th className="px-3 py-3 text-start font-medium">{t('team.league')}</th>
                <th className="px-3 py-3 text-start font-medium">{t('judging.score')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-white/5">
                  <td className="px-3 py-3 font-mono text-rc-blue">{row.season_year}</td>
                  <td className="px-3 py-3 font-mono text-rc-accent">
                    {row.rank != null ? `#${row.rank}` : '—'}
                  </td>
                  <td className="px-3 py-3">{row.team_name}</td>
                  <td className="px-3 py-3">
                    {row.company_slug ? (
                      <Link
                        to={`/companies/${row.company_slug}`}
                        className="text-rc-blue hover:underline"
                      >
                        {row.company_name}
                      </Link>
                    ) : (
                      row.company_name
                    )}
                  </td>
                  <td className="px-3 py-3 text-rc-muted">{row.league_name}</td>
                  <td className="px-3 py-3 font-mono">
                    {row.score != null ? row.score : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
