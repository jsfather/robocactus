import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, PanelCard, StatusBadge } from '@/components/ui/FormControls'
import { PanelPage } from '@/components/layout/PanelShell'
import { useAuth } from '@/hooks/useAuth'
import { CompanyForm } from '@/features/companies/CompanyForm'
import {
  fetchActiveLeagues,
  fetchCompanyTeams,
  fetchMyCompanies,
} from '@/features/companies/api'
import { fetchCompanyPublishedResults } from '@/features/live-results/api'
import { PodiumCup } from '@/components/live-results/PodiumCup'
import { TeamRegistrationWizard } from '@/features/registration/TeamRegistrationWizard'
import type { Company, League, Team } from '@/types/database'
import type { RankingsRow } from '@/features/rankings/api'

export function CompanyPanelPage({
  section = 'overview',
}: {
  section?: 'overview' | 'teams'
}) {
  const { t } = useTranslation()
  const { user, profile, loading: authLoading } = useAuth()
  const [companies, setCompanies] = useState<Company[]>([])
  const [activeCompanyId, setActiveCompanyId] = useState<string | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [leagues, setLeagues] = useState<League[]>([])
  const [companyResults, setCompanyResults] = useState<RankingsRow[]>([])
  const [showWizard, setShowWizard] = useState(section === 'teams')
  const [editingProfile, setEditingProfile] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const activeCompany = companies.find((c) => c.id === activeCompanyId) ?? null

  const loadCompanies = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setError(null)
    try {
      const [myCompanies, allLeagues] = await Promise.all([
        fetchMyCompanies(user.id),
        fetchActiveLeagues(),
      ])
      setCompanies(myCompanies)
      setLeagues(allLeagues)
      setActiveCompanyId((prev) => {
        if (prev && myCompanies.some((c) => c.id === prev)) return prev
        return myCompanies[0]?.id ?? null
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setLoading(false)
    }
  }, [user, t])

  useEffect(() => {
    if (authLoading || !user) return
    void loadCompanies()
  }, [user, authLoading, loadCompanies])

  useEffect(() => {
    if (!activeCompanyId) {
      setTeams([])
      setCompanyResults([])
      return
    }
    void fetchCompanyTeams(activeCompanyId)
      .then(setTeams)
      .catch((err: Error) => setError(err.message))
    void fetchCompanyPublishedResults(activeCompanyId)
      .then(setCompanyResults)
      .catch(() => setCompanyResults([]))
  }, [activeCompanyId])

  const leagueName = (leagueId: string) =>
    leagues.find((l) => l.id === leagueId)?.name ?? leagueId.slice(0, 8)

  if (authLoading || loading) {
    return <div className="px-4 py-12 text-center text-rc-muted">{t('app.loading')}</div>
  }

  if (!companies.length) {
    return (
      <PanelPage title={t('company.panelTitle')} description="برای شروع حضور در لیگ‌ها، پروفایل مجموعه خود را تکمیل کنید." index="CO.00">
        <div className="mx-auto max-w-3xl">
        <CompanyForm
          onSaved={(company) => {
            setCompanies([company])
            setActiveCompanyId(company.id)
            void loadCompanies()
          }}
        />
        </div>
      </PanelPage>
    )
  }

  return (
    <PanelPage
      title={section === 'teams' ? t('team.listTitle') : t('company.panelTitle')}
      description={`${profile?.full_name ?? ''} · ${t(`dashboard.roles.${profile?.role ?? 'company_admin'}`)}`}
      index="CO"
      actions={
        <div className="flex flex-wrap gap-2">
          {companies.length > 1 ? (
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
          ) : null}
          {section === 'overview' ? (
            <Button type="button" variant="secondary" onClick={() => setEditingProfile((v) => !v)}>
              {editingProfile ? t('company.hideEdit') : t('company.editTitle')}
            </Button>
          ) : (
            <Button type="button" onClick={() => setShowWizard(true)} disabled={!activeCompany}>
              {t('team.addTeam')}
            </Button>
          )}
        </div>
      }
    >
      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      {section === 'overview' && activeCompany ? <div className="relative overflow-hidden rounded-[1.75rem] bg-gradient-to-l from-[#0a4964] to-[#0b9365] p-6 text-white shadow-[0_22px_60px_rgb(8_126_184/0.18)] sm:p-8"><p className="text-sm font-bold text-emerald-200">پرتال مجموعه</p><h2 className="mt-2 text-2xl font-black">{activeCompany.name}</h2><p className="mt-3 max-w-2xl text-sm leading-7 text-white/70">تیم‌ها، ثبت‌نام لیگ‌ها، پرداخت‌ها و افتخارات مجموعه را از این فضای یکپارچه دنبال کنید.</p><div className="mt-5 flex flex-wrap gap-2"><span className="rounded-xl bg-white/10 px-3 py-2 text-xs font-bold">{teams.length} تیم ثبت‌شده</span><span className="rounded-xl bg-white/10 px-3 py-2 text-xs font-bold">{companyResults.length} نتیجه منتشرشده</span></div></div> : null}

      {section === 'overview' ? (
        <>
          {editingProfile && activeCompany ? (
            <CompanyForm
              company={activeCompany}
              onSaved={(company) => {
                setCompanies((prev) => prev.map((c) => (c.id === company.id ? company : c)))
                setEditingProfile(false)
              }}
            />
          ) : activeCompany ? (
            <PanelCard title={activeCompany.name} description={activeCompany.bio ?? undefined}>
              <div className="flex flex-wrap items-center gap-4">
                {activeCompany.logo_url ? (
                  <img
                    src={activeCompany.logo_url}
                    alt=""
                    className="size-16 border border-rc-line object-cover"
                  />
                ) : (
                  <div className="flex size-16 items-center justify-center border border-rc-line font-mono text-rc-blue">
                    CO
                  </div>
                )}
                <div className="text-sm text-rc-muted">
                  <p>
                    <span className="font-mono text-rc-blue">{activeCompany.slug}</span>
                  </p>
                  {activeCompany.website ? (
                    <a href={activeCompany.website} className="text-rc-blue hover:underline" dir="ltr">
                      {activeCompany.website}
                    </a>
                  ) : null}
                </div>
              </div>
              <div className="mt-4">
                <Link
                  to="/company/teams"
                  className="inline-flex bg-rc-blue/15 px-4 py-2 text-sm text-rc-blue hover:bg-rc-blue/25"
                >
                  {t('team.listTitle')} →
                </Link>
              </div>
            </PanelCard>
          ) : null}

          <PanelCard title={t('liveResults.companyResults')}>
            {companyResults.length === 0 ? (
              <p className="text-sm text-rc-muted">{t('liveResults.noCompanyResults')}</p>
            ) : (
              <ul className="divide-y divide-rc-line/60">
                {companyResults.slice(0, 8).map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                    <div className="flex items-center gap-2">
                      <PodiumCup rank={r.rank} size={22} />
                      <div>
                        <p className="font-medium">{r.team_name}</p>
                        <p className="text-xs text-rc-muted">
                          {r.league_name} · {r.season_year}
                        </p>
                      </div>
                    </div>
                    <span className="font-mono text-rc-muted" dir="ltr">
                      #{r.rank ?? '—'} · {r.score ?? '—'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <Link to="/live" className="mt-3 inline-block text-sm text-rc-blue hover:underline">
              {t('nav.liveResults')}
            </Link>
          </PanelCard>
        </>
      ) : (
        <>
          {showWizard && activeCompanyId ? (
            <TeamRegistrationWizard
              companyId={activeCompanyId}
              onCancel={() => setShowWizard(false)}
              onCompleted={(team) => {
                setTeams((prev) => [team, ...prev.filter((x) => x.id !== team.id)])
                setShowWizard(false)
              }}
            />
          ) : null}

          <PanelCard title={t('team.listTitle')} description={t('team.listHint')}>
            {teams.length === 0 ? (
              <p className="text-sm text-rc-muted">{t('team.empty')}</p>
            ) : (
              <ul className="divide-y divide-rc-line">
                {teams.map((team) => (
                  <li key={team.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div>
                      <p className="font-medium">{team.name}</p>
                      <p className="text-sm text-rc-muted">
                        {leagueName(team.league_id)}
                        {team.city ? ` · ${team.city}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge
                        status={team.status}
                        label={t(`team.statuses.${team.status}`, { defaultValue: team.status })}
                      />
                      {team.status === 'draft' ? (
                        <Link
                          to={`/payments/teams/${team.id}`}
                          className="bg-rc-accent px-3 py-1.5 text-sm font-medium text-white hover:brightness-110"
                        >
                          {t('payment.payCta')}
                        </Link>
                      ) : null}
                      <Link
                        to={`/team/${team.id}`}
                        className="px-3 py-1.5 text-sm text-rc-blue hover:bg-rc-blue/10"
                      >
                        {t('team.view')}
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </PanelCard>
        </>
      )}
    </PanelPage>
  )
}
