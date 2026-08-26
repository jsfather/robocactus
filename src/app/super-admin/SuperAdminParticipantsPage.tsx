import { useEffect, useMemo, useState } from 'react'
import { Button, Input, PanelCard, Select, StatusBadge } from '@/components/ui/FormControls'
import { PanelPage } from '@/components/layout/PanelShell'
import { backend } from '@/lib/backend'
import { fetchAllLeagues } from '@/features/leagues/adminApi'
import type { League, Team, TeamMember } from '@/types/database'

export function SuperAdminParticipantsPage() {
  const [leagues, setLeagues] = useState<League[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [members, setMembers] = useState<TeamMember[]>([])
  const [leagueId, setLeagueId] = useState('')
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      let teamQuery = backend.from('teams').select('*').order('created_at', { ascending: false })
      if (leagueId) teamQuery = teamQuery.eq('league_id', leagueId)
      const [leagueRows, teamResponse] = await Promise.all([fetchAllLeagues(), teamQuery])
      if (teamResponse.error) throw new Error(teamResponse.error.message)
      const teamRows = (teamResponse.data ?? []) as Team[]
      setLeagues(leagueRows)
      setTeams(teamRows)
      if (!teamRows.length) { setMembers([]); return }
      const memberResponse = await backend.from('team_members').select('*').in('team_id', teamRows.map((team) => team.id))
      if (memberResponse.error) throw new Error(memberResponse.error.message)
      setMembers((memberResponse.data ?? []) as TeamMember[])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'دریافت شرکت‌کنندگان ناموفق بود.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [leagueId])

  const visibleTeams = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return teams
    return teams.filter((team) => team.name.toLowerCase().includes(needle) || (team.name_en ?? '').toLowerCase().includes(needle))
  }, [query, teams])
  const selectedLeague = leagues.find((league) => league.id === leagueId)
  const paidTeams = teams.filter((team) => team.status !== 'draft').length

  return (
    <PanelPage index="REG.06" title="شرکت‌کنندگان لیگ‌ها" description="نمای آماری تیم‌ها، اعضا و دوره فعال هر لیگ">
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ['تعداد تیم‌ها', teams.length],
          ['ثبت‌نام قطعی', paidTeams],
          ['کل افراد', members.length],
          ['دوره فعال', selectedLeague?.current_season_year ?? 'همه'],
        ].map(([label, value]) => <div key={label} className="rounded-2xl border border-rc-line bg-rc-surface p-4"><p className="text-xs text-rc-muted">{label}</p><p className="mt-2 text-2xl font-black text-rc-blue">{value}</p></div>)}
      </div>
      <PanelCard title="فیلتر و جست‌وجو">
        <div className="grid gap-3 md:grid-cols-2">
          <Select label="لیگ" value={leagueId} onChange={(event) => setLeagueId(event.target.value)}><option value="">همه لیگ‌ها</option>{leagues.map((league) => <option key={league.id} value={league.id}>{league.name} · {league.current_season_year}</option>)}</Select>
          <Input label="جست‌وجوی نام تیم" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
      </PanelCard>
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      <PanelCard title="تیم‌ها و اعضا">
        {loading ? <p className="text-rc-muted">در حال بارگذاری…</p> : <div className="space-y-3">
          {visibleTeams.map((team) => {
            const teamMembers = members.filter((member) => member.team_id === team.id)
            return <article key={team.id} className="overflow-hidden rounded-2xl border border-rc-line bg-rc-surface/60">
              <button type="button" className="flex w-full items-center justify-between gap-4 p-4 text-start" onClick={() => setExpanded(expanded === team.id ? null : team.id)}>
                <span><strong className="block">{team.name} <span className="text-rc-muted">/ {team.name_en}</span></strong><span className="mt-1 block text-xs text-rc-muted">{teamMembers.length} نفر · دوره {team.season_year ?? '—'}</span></span>
                <StatusBadge status={team.status} label={team.status} />
              </button>
              {expanded === team.id ? <div className="border-t border-rc-line p-4"><div className="overflow-x-auto"><table className="w-full min-w-[680px] text-sm"><thead><tr className="text-rc-muted"><th className="p-2 text-start">نقش</th><th className="p-2 text-start">نام فارسی</th><th className="p-2 text-start">نام انگلیسی</th><th className="p-2 text-start">کد ملی</th><th className="p-2 text-start">تولد</th><th className="p-2 text-start">بررسی</th></tr></thead><tbody>{teamMembers.map((member) => <tr key={member.id} className="border-t border-rc-line/60"><td className="p-2">{member.role}</td><td className="p-2">{member.first_name_fa ?? member.first_name} {member.last_name_fa ?? member.last_name}</td><td className="p-2" dir="ltr">{member.first_name_en} {member.last_name_en}</td><td className="p-2 font-mono">{member.national_id}</td><td className="p-2 font-mono">{member.birth_date}</td><td className="p-2">{member.review_status}</td></tr>)}</tbody></table></div><Button type="button" variant="secondary" className="mt-3" onClick={() => window.location.assign(`/team/${team.id}`)}>مشاهده و ویرایش کامل</Button></div> : null}
            </article>
          })}
          {!visibleTeams.length ? <p className="text-rc-muted">شرکت‌کننده‌ای یافت نشد.</p> : null}
        </div>}
      </PanelCard>
    </PanelPage>
  )
}
