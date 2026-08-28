import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
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
import type { Company, Invoice, League, Team } from '@/types/database'
import { backend } from '@/lib/backend'
import type { RankingsRow } from '@/features/rankings/api'

const entityLabels: Record<string, string> = { individual: 'شخص حقیقی', company: 'شرکت', institute: 'مؤسسه', school: 'مدرسه', university: 'دانشگاه', academy: 'آموزشگاه', club: 'باشگاه', other: 'سایر' }

export function CompanyPanelPage({
  section = 'overview',
}: {
  section?: 'overview' | 'teams'
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user, profile, loading: authLoading } = useAuth()
  const [companies, setCompanies] = useState<Company[]>([])
  const [activeCompanyId, setActiveCompanyId] = useState<string | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [leagues, setLeagues] = useState<League[]>([])
  const [companyResults, setCompanyResults] = useState<RankingsRow[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [memberCount, setMemberCount] = useState(0)
  const [showWizard, setShowWizard] = useState(section === 'teams')
  const [resumeTeamId, setResumeTeamId] = useState<string | null>(null)
  const [editingProfile, setEditingProfile] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const profileEditorRef = useRef<HTMLDivElement | null>(null)

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
      setInvoices([])
      setMemberCount(0)
      return
    }
    void fetchCompanyTeams(activeCompanyId)
      .then(setTeams)
      .catch((err: Error) => setError(err.message))
    void fetchCompanyPublishedResults(activeCompanyId)
      .then(setCompanyResults)
      .catch(() => setCompanyResults([]))
    void backend.from('invoices').select('*').eq('company_id', activeCompanyId).is('archived_at', null).order('created_at', { ascending: false })
      .then((result) => setInvoices((result.data ?? []) as Invoice[]))
      .catch(() => setInvoices([]))
  }, [activeCompanyId])

  useEffect(() => {
    if (!teams.length) { setMemberCount(0); return }
    void backend.from('team_members').select('id').in('team_id', teams.map((team) => team.id))
      .then((result) => setMemberCount(result.data?.length ?? 0))
      .catch(() => setMemberCount(0))
  }, [teams])

  useEffect(() => {
    if (!editingProfile) return
    window.requestAnimationFrame(() => profileEditorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }, [editingProfile])

  const leagueName = (leagueId: string) =>
    leagues.find((l) => l.id === leagueId)?.name ?? leagueId.slice(0, 8)

  if (authLoading || loading) {
    return <div className="px-4 py-12 text-center text-rc-muted">{t('app.loading')}</div>
  }

  if (!companies.length) {
    return (
      <PanelPage title="پروفایل مجموعه" description={profile?.account_type === 'individual' ? 'مجموعه شخصی شما برای مدیریت تیم‌ها و حضور در لیگ‌ها با نام خودتان ساخته می‌شود.' : 'اطلاعات مجموعه خود را برای مدیریت تیم‌ها و حضور در لیگ‌ها تکمیل کنید.'} index="ORG.00">
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
      title={section === 'teams' ? 'تیم‌های ما' : 'داشبورد مجموعه'}
      description={`مدیریت مجموعه ${activeCompany?.name ?? profile?.full_name ?? ''}`}
      index="ORG"
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
            <Button type="button" onClick={() => { setResumeTeamId(null); setShowWizard(true) }} disabled={!activeCompany}>
              {t('team.addTeam')}
            </Button>
          )}
        </div>
      }
    >
      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      {section === 'overview' && activeCompany ? <div className="role-welcome relative overflow-hidden rounded-[1.75rem] bg-gradient-to-l from-[#0a4964] to-[#0b9365] p-6 text-white shadow-[0_22px_60px_rgb(8_126_184/0.18)] sm:p-8"><p className="text-sm font-black text-emerald-200">داشبورد مدیریت مجموعه</p><h2 className="mt-2 text-2xl font-black text-white">مجموعه: {activeCompany.name}{activeCompany.entity_type === 'individual' ? ' (شخص حقیقی)' : ''}</h2><p className="mt-3 max-w-2xl text-sm font-medium leading-7 text-slate-100">تیم‌ها، ثبت‌نام لیگ‌ها، پرداخت‌ها و افتخارات مجموعه را از این فضای یکپارچه دنبال کنید.</p><div className="mt-5 flex flex-wrap gap-2"><span className="rounded-xl bg-[#ffffff16] px-3 py-2 text-xs font-bold text-white">{teams.length} تیم</span><span className="rounded-xl bg-[#ffffff16] px-3 py-2 text-xs font-bold text-white">{memberCount} عضو</span><span className="rounded-xl bg-[#ffffff16] px-3 py-2 text-xs font-bold text-white">{companyResults.filter((result) => result.rank != null && result.rank <= 3).length} مقام</span></div></div> : null}

      {section === 'overview' ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <DashboardMetric label="ثبت‌نام‌های ناقص" value={teams.filter((team) => !['completed', 'cancelled'].includes(team.lifecycle_status ?? '')).length} tone="amber" />
            <DashboardMetric label="در انتظار پرداخت" value={invoices.filter((invoice) => invoice.status === 'pending').length} tone="sky" />
            <DashboardMetric label="پرداخت موفق" value={invoices.filter((invoice) => invoice.status === 'paid').length} tone="emerald" />
            <DashboardMetric label="نتیجه منتشرشده" value={companyResults.length} tone="violet" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <PanelCard title="لیگ‌های پیش رو" description="لیگ‌های فعال و آماده ثبت‌نام برای مجموعه شما">
              {leagues.length ? <div className="space-y-2">{leagues.slice(0, 4).map((league) => <div key={league.id} className="flex items-center justify-between gap-3 border-b border-rc-line/60 py-3 last:border-0"><div><p className="font-bold text-slate-800">{league.name}</p><p className="mt-1 text-xs text-rc-muted">{league.registration_close_at ? `مهلت ثبت‌نام: ${new Date(league.registration_close_at).toLocaleDateString('fa-IR')}` : 'ثبت‌نام فعال'}</p></div><Link to="/company/competitions" className="shrink-0 text-sm font-bold text-rc-blue">مشاهده و ثبت‌نام</Link></div>)}</div> : <p className="text-sm text-rc-muted">در حال حاضر لیگ فعالی برای ثبت‌نام وجود ندارد.</p>}
            </PanelCard>
            <PanelCard title="راهنمای شروع" description="مسیر پیشنهادی برای تکمیل حضور در مسابقات">
              <ol className="space-y-3 text-sm text-slate-700"><li><b>۱. پروفایل مجموعه:</b> اطلاعات هویتی و مدارک را کامل کنید.</li><li><b>۲. تیم‌های ما:</b> تیم، سرپرست و اعضا را تعریف کنید.</li><li><b>۳. انتخاب لیگ:</b> شرایط لیگ را بررسی و ثبت‌نام را آغاز کنید.</li><li><b>۴. پرداخت و پیگیری:</b> صورتحساب و وضعیت تأیید را از پنل دنبال کنید.</li></ol>
            </PanelCard>
          </div>
          {(teams.some((team) => !['completed', 'cancelled', 'awaiting_payment'].includes(team.lifecycle_status ?? '')) || invoices.some((invoice) => invoice.status === 'pending')) ? <div className="rounded-2xl border border-amber-200 bg-gradient-to-l from-amber-50 to-white p-5"><h3 className="font-black text-amber-900">اقدام‌های باز شما</h3><div className="mt-3 flex flex-wrap gap-3">{teams.some((team) => !['completed', 'cancelled', 'awaiting_payment'].includes(team.lifecycle_status ?? '')) ? <Link to="/company/teams" className="rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-bold text-white">ادامه ثبت‌نام تیم</Link> : null}{invoices.some((invoice) => invoice.status === 'pending') ? <Link to="/account/invoices" className="rounded-xl border border-amber-300 bg-white px-4 py-2.5 text-sm font-bold text-amber-800">مشاهده صورتحساب‌های باز</Link> : null}</div></div> : null}
          {editingProfile && activeCompany ? (
            <div ref={profileEditorRef} className="scroll-mt-28"><CompanyForm
              company={activeCompany}
              onSaved={(company) => {
                setCompanies((prev) => prev.map((c) => (c.id === company.id ? company : c)))
                setEditingProfile(false)
              }}
            /></div>
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
                    <span className="font-bold text-slate-700">نوع مجموعه: {entityLabels[activeCompany.entity_type ?? 'company']}</span>
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
              key={resumeTeamId ?? 'new-registration'}
              companyId={activeCompanyId}
              initialTeamId={resumeTeamId ?? undefined}
              initialLeagueId={teams.find((team) => team.id === resumeTeamId)?.league_id}
              onCancel={() => setShowWizard(false)}
              onCompleted={(team) => {
                setTeams((prev) => [team, ...prev.filter((x) => x.id !== team.id)])
                setShowWizard(false)
                void navigate(`/payments/teams/${team.id}`)
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
                      <div className="flex flex-wrap items-center gap-2"><p className="font-black text-slate-800">{team.name}</p>{!['completed', 'cancelled'].includes(team.lifecycle_status ?? (team.status === 'draft' ? 'incomplete' : 'completed')) ? <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-black text-amber-700">ثبت‌نام ناقص · {Number(team.registration_progress ?? 25).toLocaleString('fa-IR')}٪</span> : null}</div>
                      <p className="text-sm text-rc-muted">
                        {leagueName(team.league_id)}
                        {team.city ? ` · ${team.city}` : ''}
                      </p>
                      {!['completed', 'cancelled'].includes(team.lifecycle_status ?? '') ? <div className="mt-3 w-full max-w-xs"><div className="mb-1 flex justify-between text-[10px] font-bold text-slate-400"><span>پیشرفت ثبت‌نام</span><span>{Number(team.registration_progress ?? 10).toLocaleString('fa-IR')}٪</span></div><div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-l from-sky-500 to-emerald-500 transition-all" style={{ width: `${team.registration_progress ?? 10}%` }} /></div></div> : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge
                        status={team.status}
                        label={t(`team.statuses.${team.status}`, { defaultValue: team.status })}
                      />
                      {(team.lifecycle_status ?? '') === 'awaiting_payment' ? (
                        <Link
                          to={`/payments/teams/${team.id}`}
                          className="bg-rc-accent px-3 py-1.5 text-sm font-medium text-white hover:brightness-110"
                        >
                          {t('payment.payCta')}
                        </Link>
                      ) : null}
                      {!['completed', 'cancelled', 'awaiting_payment'].includes(team.lifecycle_status ?? (team.status === 'draft' ? 'incomplete' : 'completed')) ? <Button type="button" onClick={() => { setResumeTeamId(team.id); setShowWizard(true); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>ادامه ثبت‌نام</Button> : null}
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

function DashboardMetric({ label, value, tone }: { label: string; value: number; tone: 'amber' | 'sky' | 'emerald' | 'violet' }) {
  const colors = { amber: 'from-amber-50 text-amber-700', sky: 'from-sky-50 text-sky-700', emerald: 'from-emerald-50 text-emerald-700', violet: 'from-violet-50 text-violet-700' }
  return <div className={`rounded-2xl border border-white bg-gradient-to-l ${colors[tone]} to-white p-5 shadow-sm`}><p className="text-xs font-bold opacity-70">{label}</p><p className="mt-2 text-3xl font-black">{value.toLocaleString('fa-IR')}</p></div>
}
