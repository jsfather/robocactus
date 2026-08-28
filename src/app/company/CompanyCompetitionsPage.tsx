import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, PanelCard, StatusBadge } from '@/components/ui/FormControls'
import { PanelPage } from '@/components/layout/PanelShell'
import { useAuth } from '@/hooks/useAuth'
import { fetchActiveLeagues, fetchCompanyTeams, fetchMyCompanies } from '@/features/companies/api'
import { TeamRegistrationWizard } from '@/features/registration/TeamRegistrationWizard'
import { computeLeaguePeriod, periodBadgeClass } from '@/features/leagues/period'
import type { Company, League, Team } from '@/types/database'

export function CompanyCompetitionsPage() {
  const { t } = useTranslation()
  const { user, loading: authLoading } = useAuth()
  const [companies, setCompanies] = useState<Company[]>([])
  const [activeCompanyId, setActiveCompanyId] = useState<string | null>(null)
  const [leagues, setLeagues] = useState<League[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [registerLeagueId, setRegisterLeagueId] = useState<string | null>(null)
  const [resumeTeamId, setResumeTeamId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const activeCompany = companies.find((c) => c.id === activeCompanyId) ?? null

  const reload = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setError(null)
    try {
      const myCompanies = await fetchMyCompanies(user.id)
      setCompanies(myCompanies)
      const cid =
        activeCompanyId && myCompanies.some((c) => c.id === activeCompanyId)
          ? activeCompanyId
          : myCompanies[0]?.id ?? null
      setActiveCompanyId(cid)
      const [allLeagues, companyTeams] = await Promise.all([
        fetchActiveLeagues(),
        cid ? fetchCompanyTeams(cid) : Promise.resolve([] as Team[]),
      ])
      setLeagues(allLeagues)
      setTeams(companyTeams)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setLoading(false)
    }
  }, [user, activeCompanyId, t])

  useEffect(() => {
    if (authLoading || !user) return
    void reload()
  }, [user, authLoading, reload])

  useEffect(() => {
    if (!activeCompanyId) {
      setTeams([])
      return
    }
    void fetchCompanyTeams(activeCompanyId)
      .then(setTeams)
      .catch((err: Error) => setError(err.message))
  }, [activeCompanyId])

  const teamForLeague = (league: League) => teams.find(
    (team) => team.league_id === league.id && (team.season_year ?? league.current_season_year) === league.current_season_year,
  )

  if (authLoading || loading) {
    return <div className="px-4 py-12 text-center text-rc-muted">{t('app.loading')}</div>
  }

  if (!companies.length) {
    return (
      <PanelPage title={t('competitions.title')} description={t('competitions.needCompany')} index="CMP">
        <Link to="/company" className="text-sm text-rc-blue hover:underline">
          {t('company.panelTitle')} →
        </Link>
      </PanelPage>
    )
  }

  return (
    <PanelPage
      title={t('competitions.title')}
      description={t('competitions.subtitle')}
      index="CMP"
      actions={
        companies.length > 1 ? (
          <select
            className="border border-rc-line bg-rc-navy px-3 py-2 text-sm"
            value={activeCompanyId ?? ''}
            onChange={(e) => setActiveCompanyId(e.target.value)}
          >
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        ) : undefined
      }
    >
      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      {registerLeagueId && activeCompanyId ? (
        <TeamRegistrationWizard
          key={resumeTeamId ?? registerLeagueId}
          companyId={activeCompanyId}
          initialLeagueId={registerLeagueId}
          initialTeamId={resumeTeamId ?? undefined}
          onCancel={() => { setRegisterLeagueId(null); setResumeTeamId(null) }}
          onCompleted={(team) => {
            setTeams((prev) => [team, ...prev.filter((x) => x.id !== team.id)])
            setRegisterLeagueId(null)
            setResumeTeamId(null)
          }}
        />
      ) : (
        <div className="space-y-3">
          <PanelCard title={t('competitions.myLeagues')} description={activeCompany?.name}>
            {leagues.length === 0 ? (
              <p className="text-sm text-rc-muted">{t('competitions.noLeagues')}</p>
            ) : (
              <ul className="divide-y divide-rc-line/70">
                {leagues.map((league) => {
                  const team = teamForLeague(league)
                  const period = computeLeaguePeriod(league)
                  return (
                    <li
                      key={league.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-3"
                    >
                      <div>
                        <p className="font-medium">{league.name}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded border px-2 py-0.5 font-mono text-[10px] ${periodBadgeClass(period)}`}
                          >
                            {t(`leaguePage.period.${period}`)}
                          </span>
                          {team ? (
                            <StatusBadge
                              status={team.status}
                              label={t(`team.statuses.${team.status}`, {
                                defaultValue: team.status,
                              })}
                            />
                          ) : (
                            <span className="text-xs text-rc-muted">
                              {t('competitions.noTeamYet')}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {team ? (
                          team.lifecycle_status === 'awaiting_payment' || ['invoice', 'payment'].includes(team.registration_stage ?? '') ? (
                            <Link to={`/payments/teams/${team.id}`} className="rounded-xl bg-rc-accent px-4 py-2 text-sm font-bold text-white">پرداخت و ویرایش</Link>
                          ) : !['completed', 'cancelled'].includes(team.lifecycle_status ?? '') || team.status === 'draft' ? (
                            <Button type="button" onClick={() => { setResumeTeamId(team.id); setRegisterLeagueId(league.id) }}>تکمیل ثبت‌نام</Button>
                          ) : (
                            <Link to={`/team/${team.id}`} className="rounded-xl border border-rc-line px-4 py-2 text-sm font-bold hover:bg-rc-hover">{t('team.view')}</Link>
                          )
                        ) : period === 'open' && (league.registration_cycle_status ?? 'open') === 'open' ? (
                          <Button type="button" onClick={() => { setResumeTeamId(null); setRegisterLeagueId(league.id) }}>
                            {t('competitions.registerTeam')}
                          </Button>
                        ) : <span className="rounded-xl border border-rc-line px-3 py-2 text-xs text-rc-muted">ثبت‌نام این دوره بسته است</span>}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </PanelCard>
        </div>
      )}
    </PanelPage>
  )
}
