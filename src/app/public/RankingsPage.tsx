import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, Input, Select } from '@/components/ui/FormControls'
import { fetchLeaguesForFilter, fetchPodiumArchive, type PodiumArchiveRow } from '@/features/rankings/api'
import type { League } from '@/types/database'
import { formatCompetitionCycle, formatSeasonYear } from '@/lib/dates'

const monthsEn = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const monthsFa = monthsEn.map((_, index) => new Intl.DateTimeFormat('fa-IR', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, index, 15))))

export function RankingsPage() {
  const { t, i18n } = useTranslation()
  const en = i18n.language === 'en'
  const [rows, setRows] = useState<PodiumArchiveRow[]>([])
  const [leagues, setLeagues] = useState<League[]>([])
  const [availableYears, setAvailableYears] = useState<number[]>([])
  const [year, setYear] = useState('')
  const [month, setMonth] = useState('')
  const [leagueId, setLeagueId] = useState('')
  const [q, setQ] = useState('')
  const [nationalId, setNationalId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const years = useMemo(() => availableYears.length ? availableYears : [...new Set(rows.map((row) => row.season_year))].sort((a, b) => b - a), [availableYears, rows])

  const load = useCallback(async (filters: { year?: string; month?: string; leagueId?: string; q?: string; nationalId?: string } = {}) => {
    setLoading(true)
    setError(null)
    try {
      const [data, leagueRows, allRows] = await Promise.all([
        fetchPodiumArchive({ year: filters.year ? Number(filters.year) : undefined, month: filters.month ? Number(filters.month) : undefined, leagueId: filters.leagueId || undefined, q: filters.q || undefined, nationalId: filters.nationalId || undefined }),
        fetchLeaguesForFilter(),
        fetchPodiumArchive(),
      ])
      setRows(data)
      setLeagues(leagueRows)
      setAvailableYears([...new Set(allRows.map((row) => row.season_year))].sort((a, b) => b - a))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('common.error'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { void load() }, [load])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const clean = nationalId.replace(/\D/g, '')
    if (clean && clean.length !== 10) {
      setError(en ? 'National ID must contain exactly 10 digits.' : 'کد ملی باید دقیقاً ۱۰ رقم باشد.')
      return
    }
    void load({ year, month, leagueId, q, nationalId: clean })
  }

  const reset = () => {
    setYear(''); setMonth(''); setLeagueId(''); setQ(''); setNationalId('')
    void load()
  }

  return <main className="mx-auto max-w-7xl px-4 py-12 sm:px-8">
    <header className="border-b border-slate-200 pb-7">
      <p className="text-xs font-black tracking-[.16em] text-emerald-700">{en ? 'HALL OF HONOUR' : 'تالار افتخارات'}</p>
      <h1 className="mt-2 text-3xl font-black text-slate-950 sm:text-4xl">{t('rankings.title')}</h1>
      <p className="mt-2 text-slate-600">{t('rankings.subtitle')}</p>
    </header>
    <form onSubmit={submit} className="mt-7 grid gap-3 border-y border-slate-200 bg-slate-50/70 p-4 md:grid-cols-2 xl:grid-cols-[.8fr_.8fr_1fr_1.2fr_1.1fr_auto] xl:items-end">
      <Select label={t('rankings.year')} value={year} onChange={(event) => setYear(event.target.value)}><option value="">{t('rankings.allYears')}</option>{years.map((value) => <option key={value} value={value}>{formatSeasonYear(value, i18n.language)}</option>)}</Select>
      <Select label={en ? 'Month' : 'ماه'} value={month} onChange={(event) => setMonth(event.target.value)}><option value="">{en ? 'All months' : 'همه ماه‌ها'}</option>{(en ? monthsEn : monthsFa).map((label, index) => <option key={label} value={index + 1}>{label}</option>)}</Select>
      <Select label={t('team.league')} value={leagueId} onChange={(event) => setLeagueId(event.target.value)}><option value="">{t('rankings.allLeagues')}</option>{leagues.map((league) => <option key={league.id} value={league.id}>{en ? league.name_en || league.name : league.name}</option>)}</Select>
      <Input label={t('rankings.search')} value={q} onChange={(event) => setQ(event.target.value)} placeholder={en ? 'Team, participant or organization' : 'تیم، شرکت‌کننده یا مجموعه'} />
      <Input label={en ? 'National ID lookup' : 'جست‌وجو با کد ملی'} inputMode="numeric" maxLength={10} value={nationalId} onChange={(event) => setNationalId(event.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="0000000000" dir="ltr" />
      <div className="flex gap-2"><Button type="submit" disabled={loading}>{loading ? t('app.loading') : t('rankings.apply')}</Button><Button type="button" variant="ghost" onClick={reset}>{en ? 'Reset' : 'پاک‌کردن'}</Button></div>
    </form>
    {error ? <p className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p> : null}
    {!loading && !error && !rows.length ? <div className="py-20 text-center text-slate-500">{t('rankings.empty')}</div> : null}
    {!loading && rows.length ? <div className="mt-8 overflow-x-auto border border-slate-200 bg-white"><table className="w-full min-w-[900px] text-sm">
      <thead className="bg-slate-900 text-white"><tr><th className="p-4 text-start">{en ? 'Place' : 'مقام'}</th><th className="p-4 text-start">{en ? 'Participant' : 'نام و نام خانوادگی'}</th><th className="p-4 text-start">{en ? 'Team' : 'تیم'}</th><th className="p-4 text-start">{en ? 'League' : 'لیگ'}</th><th className="p-4 text-start">{en ? 'Organization' : 'مجموعه'}</th><th className="p-4 text-start">{en ? 'Cycle' : 'دوره برگزاری'}</th></tr></thead>
      <tbody>{rows.map((row) => <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50">
        <td className="p-4"><span className={`inline-grid size-9 place-items-center rounded-full font-black ${row.rank === 1 ? 'bg-amber-100 text-amber-800' : row.rank === 2 ? 'bg-slate-200 text-slate-700' : 'bg-orange-100 text-orange-800'}`}>{row.rank}</span></td>
        <td className="p-4 font-bold text-slate-900">{en ? row.participant_name_en || row.participant_name_fa : row.participant_name_fa || row.participant_name_en || '—'}</td>
        <td className="p-4">{en ? row.team_name_en || row.team_name : row.team_name}</td>
        <td className="p-4"><Link className="font-bold text-sky-700 hover:underline" to={`/leagues/${row.league_slug}`}>{en ? row.league_name_en || row.league_name : row.league_name}</Link></td>
        <td className="p-4 text-slate-600">{en ? row.organization_name_en || row.organization_name : row.organization_name || '—'}</td>
        <td className="p-4">{formatCompetitionCycle(row.season_year, row.season_month, i18n.language)}</td>
      </tr>)}</tbody>
    </table></div> : null}
  </main>
}
