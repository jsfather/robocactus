import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PanelPage } from '@/components/layout/PanelShell'
import { Input, Select } from '@/components/ui/FormControls'
import { backend } from '@/lib/backend'
import { formatAppDateTime, formatCompetitionCycle, formatSeasonYear } from '@/lib/dates'
import type { League } from '@/types/database'

type ArchiveRow = { id: string; league_id: string; season_year: number; season_month: number; label_fa: string; archived_at: string; teams_snapshot: unknown[]; results_snapshot: unknown[] }
const monthsFa = Array.from({ length: 12 }, (_, index) => new Intl.DateTimeFormat('fa-IR', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, index, 15))))

export function SuperAdminLeagueArchivesPage() {
  const [rows, setRows] = useState<ArchiveRow[]>([])
  const [leagues, setLeagues] = useState<League[]>([])
  const [q, setQ] = useState('')
  const [year, setYear] = useState('')
  const [month, setMonth] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    void Promise.all([
      backend.from('league_cycle_archives').select('*').order('archived_at', { ascending: false }),
      backend.from('leagues').select('*').order('name'),
    ]).then(([archives, leagueRows]) => {
      const failure = archives.error ?? leagueRows.error
      if (failure) setError(failure.message)
      else {
        setRows((archives.data ?? []) as ArchiveRow[])
        setLeagues((leagueRows.data ?? []) as League[])
      }
    }).finally(() => setLoading(false))
  }, [])

  const leagueMap = useMemo(() => new Map(leagues.map((item) => [item.id, item])), [leagues])
  const years = useMemo(() => [...new Set(rows.map((row) => row.season_year))].sort((a, b) => b - a), [rows])
  const visible = rows.filter((row) => {
    const league = leagueMap.get(row.league_id)
    return (!year || row.season_year === Number(year))
      && (!month || row.season_month === Number(month))
      && (!q.trim() || `${league?.name ?? ''} ${league?.name_en ?? ''} ${row.label_fa}`.toLocaleLowerCase().includes(q.trim().toLocaleLowerCase()))
  })

  return <PanelPage index="REG.02" title="آرشیو دوره‌های مسابقات" description="دوره‌های پایان‌یافته هر لیگ، مقام‌ها و ثبت‌نام‌های قفل‌شده را مشاهده کنید.">
    <div className="grid gap-3 border border-slate-200 bg-white p-4 md:grid-cols-3">
      <Input label="جست‌وجوی نام لیگ" value={q} onChange={(event) => setQ(event.target.value)} />
      <Select label="سال" value={year} onChange={(event) => setYear(event.target.value)}><option value="">همه سال‌ها</option>{years.map((value) => <option key={value} value={value}>{formatSeasonYear(value, 'fa')}</option>)}</Select>
      <Select label="ماه میلادی دوره" value={month} onChange={(event) => setMonth(event.target.value)}><option value="">همه ماه‌ها</option>{monthsFa.map((label, index) => <option key={label} value={index + 1}>{label}</option>)}</Select>
    </div>
    {error ? <p className="mt-4 text-sm text-red-700">{error}</p> : null}
    {loading ? <p className="mt-8 text-slate-500">در حال بارگذاری…</p> : <div className="mt-5 overflow-x-auto border border-slate-200 bg-white"><table className="w-full min-w-[760px] text-sm">
      <thead className="bg-slate-900 text-white"><tr><th className="p-4 text-start">لیگ</th><th className="p-4 text-start">دوره</th><th className="p-4 text-start">تیم‌ها</th><th className="p-4 text-start">نتایج</th><th className="p-4 text-start">تاریخ بایگانی</th><th className="p-4 text-start">عملیات</th></tr></thead>
      <tbody>{visible.map((row) => {
        const league = leagueMap.get(row.league_id)
        return <tr key={row.id} className="border-t border-slate-100"><td className="p-4 font-black">{league?.name ?? 'لیگ حذف‌شده'}</td><td className="p-4">{formatCompetitionCycle(row.season_year, row.season_month, 'fa')}</td><td className="p-4">{Array.isArray(row.teams_snapshot) ? row.teams_snapshot.length : 0}</td><td className="p-4">{Array.isArray(row.results_snapshot) ? row.results_snapshot.length : 0}</td><td className="p-4">{formatAppDateTime(row.archived_at, 'fa')}</td><td className="p-4">{league ? <Link to={`/super-admin/leagues/${league.id}`} className="font-black text-sky-700 hover:underline">ویرایش لیگ</Link> : null}</td></tr>
      })}{!visible.length ? <tr><td colSpan={6} className="p-10 text-center text-slate-500">دوره بایگانی‌شده‌ای با این فیلتر پیدا نشد.</td></tr> : null}</tbody>
    </table></div>}
  </PanelPage>
}
