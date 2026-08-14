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

  const teamForLeague = (leagueId: string) => teams.find((x) => x.league_id === leagueId)

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
          companyId={activeCompanyId}
          initialLeagueId={registerLeagueId}
          onCancel={() => setRegisterLeagueId(null)}
          onCompleted={(team) => {
            setTeams((prev) => [team, ...prev.filter((x) => x.id !== team.id)])
            setRegisterLeagueId(null)
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
                  const team = teamForLeague(league.id)
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
                          <>
                            <Link
                              to={`/team/${team.id}`}
                              className="border border-rc-line px-3 py-1.5 text-sm hover:bg-rc-hover"
                            >
                              {t('team.view')}
                            </Link>
                            {team.status === 'draft' ? (
                              <Link
                                to={`/payments/teams/${team.id}`}
                                className="bg-rc-accent px-3 py-1.5 text-sm font-medium text-white"
                              >
                                {t('payment.payCta')}
                              </Link>
                            ) : null}
                          </>
                        ) : (
                          <Button type="button" onClick={() => setRegisterLeagueId(league.id)}>
                            {t('competitions.registerTeam')}
                          </Button>
                        )}
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
