import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Input, PanelCard, Select, StatusBadge } from '@/components/ui/FormControls'
import { PanelPage } from '@/components/layout/PanelShell'
import { StatCard } from '@/components/panel/HudKit'
import { backend } from '@/lib/backend'
import { fetchAllLeagues } from '@/features/leagues/adminApi'
import type { Company, League, Profile, Team, TeamMember } from '@/types/database'

const statusLabel: Record<string, string> = { draft: 'پیش‌نویس', submitted: 'ارسال‌شده', under_review: 'در حال بررسی', approved: 'تأییدشده', rejected: 'ردشده', waitlisted: 'فهرست انتظار' }

export function SuperAdminParticipantsPage() {
  const [leagues, setLeagues] = useState<League[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [members, setMembers] = useState<TeamMember[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [owners, setOwners] = useState<Profile[]>([])
  const [leagueId, setLeagueId] = useState('')
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true); setError(null)
    try {
      let teamQuery = backend.from('teams').select('*').order('created_at', { ascending: false })
      if (leagueId) teamQuery = teamQuery.eq('league_id', leagueId)
      const [leagueRows, teamResponse] = await Promise.all([fetchAllLeagues(), teamQuery])
      if (teamResponse.error) throw new Error(teamResponse.error.message)
      const teamRows = (teamResponse.data ?? []) as Team[]
      setLeagues(leagueRows); setTeams(teamRows)
      if (!teamRows.length) { setMembers([]); setCompanies([]); setOwners([]); return }
      const companyIds = [...new Set(teamRows.map((team) => team.company_id).filter(Boolean))]
      const ownerIds = [...new Set(teamRows.map((team) => team.captain_id).filter(Boolean))]
      const [memberResponse, companyResponse, ownerResponse] = await Promise.all([
        backend.from('team_members').select('*').in('team_id', teamRows.map((team) => team.id)),
        backend.from('companies').select('*').in('id', companyIds),
        backend.from('profiles').select('*').in('id', ownerIds),
      ])
      if (memberResponse.error || companyResponse.error || ownerResponse.error) throw new Error(memberResponse.error?.message ?? companyResponse.error?.message ?? ownerResponse.error?.message)
      setMembers((memberResponse.data ?? []) as TeamMember[])
      setCompanies((companyResponse.data ?? []) as Company[])
      setOwners((ownerResponse.data ?? []) as Profile[])
    } catch (err) { setError(err instanceof Error ? err.message : 'دریافت اطلاعات مجموعه‌ها ناموفق بود.') }
    finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [leagueId])
  const companyById = useMemo(() => new Map(companies.map((company) => [company.id, company])), [companies])
  const ownerById = useMemo(() => new Map(owners.map((owner) => [owner.id, owner])), [owners])
  const visibleTeams = useMemo(() => { const needle = query.trim().toLocaleLowerCase('fa'); if (!needle) return teams; return teams.filter((team) => { const company = companyById.get(team.company_id); const owner = ownerById.get(team.captain_id); return [team.name, team.name_en, company?.name, owner?.full_name, owner?.phone].some((value) => value?.toLocaleLowerCase('fa').includes(needle)) }) }, [companyById, ownerById, query, teams])
  const selectedLeague = leagues.find((league) => league.id === leagueId)

  return <PanelPage index="REG.06" title="اطلاعات مجموعه‌ها" description="مجموعه ثبت‌نام‌کننده، مالک حساب، تیم‌ها و اعضای هر ثبت‌نام را یکجا ببینید.">
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><StatCard index="01" label="مجموعه‌ها" value={new Set(teams.map((team) => team.company_id)).size} hint="اشخاص حقیقی و حقوقی" /><StatCard index="02" label="تیم‌ها" value={teams.length} hint="تیم‌های وابسته به مجموعه‌ها" accent="green" /><StatCard index="03" label="افراد تیم" value={members.length} hint="سرپرست، مربی و اعضا" accent="orange" /><StatCard index="04" label="دوره" value={selectedLeague?.current_season_year ?? 'همه'} hint="دوره انتخاب‌شده" /></div>
    <PanelCard title="جست‌وجو و فیلتر" description="با نام مجموعه، مالک حساب، موبایل یا نام تیم جست‌وجو کنید."><div className="grid gap-3 md:grid-cols-2"><Select label="لیگ" value={leagueId} onChange={(event) => setLeagueId(event.target.value)}><option value="">همه لیگ‌ها</option>{leagues.map((league) => <option key={league.id} value={league.id}>{league.name} · {league.current_season_year}</option>)}</Select><Input label="نام مجموعه، مالک یا تیم" value={query} onChange={(event) => setQuery(event.target.value)} /></div></PanelCard>
    {error ? <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p> : null}
    <PanelCard title="مجموعه‌ها و تیم‌های ثبت‌شده">{loading ? <p className="text-rc-muted">در حال بارگذاری…</p> : <div className="space-y-3">{visibleTeams.map((team) => { const teamMembers = members.filter((member) => member.team_id === team.id); const company = companyById.get(team.company_id); const owner = ownerById.get(team.captain_id); return <article key={team.id} className={`overflow-hidden rounded-2xl border bg-white ${expanded === team.id ? 'border-sky-300 ring-4 ring-sky-50' : 'border-slate-200'}`}>
      <button type="button" className="grid w-full gap-4 p-5 text-start md:grid-cols-[minmax(0,1fr)_minmax(15rem,.7fr)_auto] md:items-center" onClick={() => setExpanded(expanded === team.id ? null : team.id)} aria-expanded={expanded === team.id}><span className="min-w-0"><small className="font-bold text-sky-700">مجموعه</small><strong className="mt-1 block truncate text-base text-slate-900">{company?.name ?? 'مجموعه بدون نام'}</strong><span className="mt-1 block text-xs text-slate-500">تیم: {team.name}{team.name_en ? ` / ${team.name_en}` : ''}</span></span><span className="min-w-0 rounded-xl bg-slate-50 px-4 py-3"><small className="block text-slate-500">مالک و مدیر حساب</small><strong className="mt-1 block truncate text-sm text-slate-800">{owner?.full_name ?? 'پروفایل یافت نشد'}</strong><span className="mt-1 block text-xs text-slate-500" dir="ltr">{owner?.phone ?? owner?.email ?? '—'}</span></span><StatusBadge status={team.status} label={statusLabel[team.status] ?? team.status} /></button>
      {expanded === team.id ? <div className="border-t border-slate-200 p-4"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><p className="text-sm font-bold text-slate-700">{teamMembers.length.toLocaleString('fa-IR')} نفر · دوره {team.season_year ?? '—'}</p><div className="flex gap-2"><Link to={`/super-admin/users?user=${team.captain_id}`} className="inline-flex min-h-10 items-center rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-700">حساب مالک</Link><Link to={`/team/${team.id}`} className="inline-flex min-h-10 items-center rounded-xl bg-sky-700 px-3 text-xs font-bold text-white">مشاهده و ویرایش تیم</Link></div></div><div className="overflow-x-auto"><table className="w-full min-w-[680px] text-sm"><thead><tr><th>نقش</th><th>نام فارسی</th><th>نام انگلیسی</th><th>کد ملی</th><th>تولد</th><th>بررسی</th></tr></thead><tbody>{teamMembers.map((member) => <tr key={member.id}><td>{member.role === 'captain' ? 'سرپرست' : member.role === 'coach' ? 'مربی' : 'عضو'}</td><td>{member.first_name_fa ?? member.first_name} {member.last_name_fa ?? member.last_name}</td><td dir="ltr">{member.first_name_en} {member.last_name_en}</td><td className="font-mono">{member.national_id}</td><td className="font-mono">{member.birth_date}</td><td>{member.review_status === 'approved' ? 'تأییدشده' : member.review_status === 'rejected' ? 'ردشده' : 'در انتظار'}</td></tr>)}</tbody></table></div></div> : null}
    </article> })}{!visibleTeams.length ? <p className="rounded-xl border border-dashed border-slate-200 p-10 text-center text-slate-500">مجموعه‌ای یافت نشد.</p> : null}</div>}</PanelCard>
  </PanelPage>
}
