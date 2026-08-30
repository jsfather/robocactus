import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PanelPage } from '@/components/layout/PanelShell'
import { HudFrame, QuickAction, SectionLabel, StatCard } from '@/components/panel/HudKit'
import { PanelCard, StatusBadge } from '@/components/ui/FormControls'
import { fetchAnalyticsSnapshot, type AnalyticsSnapshot } from '@/features/analytics/api'
import { fetchTicketStatusCounts } from '@/features/tickets/api'
import { backend } from '@/lib/backend'
import { formatAppDate } from '@/lib/dates'
import { useAuth } from '@/hooks/useAuth'
import { useUnreadTicketCount } from '@/hooks/useUnreadTickets'
import { roleHomePath } from '@/features/panel/nav'
import { isSignupIncomplete } from '@/features/auth/signupProgress'
import { Navigate } from 'react-router-dom'

type FeedUser = { id: string; full_name: string; phone: string; role: string; created_at: string }
type FeedCompany = { id: string; name: string; slug: string; created_at: string }
type FeedTeam = { id: string; name: string; status: string; created_at: string }

const QUICK: Array<{
  to: string
  titleKey: string
  descKey: string
  accent?: 'blue' | 'orange'
  index: string
}> = [
  {
    to: '/super-admin/leagues',
    titleKey: 'admin.leagues.title',
    descKey: 'admin.leagues.subtitle',
    accent: 'blue',
    index: 'QA.01',
  },
  {
    to: '/super-admin/tickets',
    titleKey: 'staff.tabTickets',
    descKey: 'tickets.generalHint',
    accent: 'orange',
    index: 'QA.02',
  },
  {
    to: '/super-admin/triage',
    titleKey: 'staff.tabTriage',
    descKey: 'staff.triageHint',
    index: 'QA.03',
  },
  {
    to: '/super-admin/users',
    titleKey: 'admin.users.title',
    descKey: 'admin.users.subtitle',
    index: 'QA.04',
  },
  {
    to: '/super-admin/content',
    titleKey: 'content.cmsTitle',
    descKey: 'content.cmsSubtitle',
    index: 'QA.05',
  },
  {
    to: '/super-admin/companies',
    titleKey: 'admin.companies.title',
    descKey: 'admin.companies.subtitle',
    accent: 'blue',
    index: 'QA.06',
  },
]

function formatMoney(n: number, lang: string): string {
  return new Intl.NumberFormat(lang.startsWith('fa') ? 'fa-IR' : 'en-US').format(n)
}

export function SuperAdminHomePage() {
  const { t, i18n } = useTranslation()
  const { profile, user } = useAuth()
  const { count: unread } = useUnreadTicketCount()
  const [snap, setSnap] = useState<AnalyticsSnapshot | null>(null)
  const [ticketCounts, setTicketCounts] = useState({ open: 0, answered: 0, closed: 0, total: 0 })
  const [users, setUsers] = useState<FeedUser[]>([])
  const [companies, setCompanies] = useState<FeedCompany[]>([])
  const [teams, setTeams] = useState<FeedTeam[]>([])
  const [pendingReview, setPendingReview] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [s, tc, u, c, tm, pr] = await Promise.all([
          fetchAnalyticsSnapshot(),
          fetchTicketStatusCounts(),
          backend
            .from('profiles')
            .select('id, full_name, phone, role, created_at')
            .order('created_at', { ascending: false })
            .limit(6),
          backend.from('companies').select('id, name, slug, created_at').order('created_at', { ascending: false }).limit(6),
          backend.from('teams').select('id, name, status, created_at').order('created_at', { ascending: false }).limit(6),
          backend
            .from('teams')
            .select('id', { count: 'exact', head: true })
            .in('status', ['submitted', 'under_review']),
        ])
        if (cancelled) return
        setSnap(s)
        setTicketCounts(tc)
        setUsers((u.data ?? []) as FeedUser[])
        setCompanies((c.data ?? []) as FeedCompany[])
        setTeams((tm.data ?? []) as FeedTeam[])
        setPendingReview(pr.count ?? 0)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : t('common.error'))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [t])

  return (
    <PanelPage
      index="SYS.00"
      title={t('panel.dashboardTitle')}
      description={t('admin.home.subtitle')}
    >
      <div className="role-welcome dashboard-welcome relative overflow-hidden rounded-[1.75rem] bg-gradient-to-l from-[#07374d] via-[#087eb8] to-[#087a58] p-6 text-white shadow-[0_24px_70px_rgb(8_126_184/0.24)] sm:p-8">
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-5"><div><p className="text-sm font-black text-emerald-200">مرکز عملیات جام تبرستان</p><h2 className="mt-2 text-2xl font-black text-white sm:text-3xl">خوش آمدید، {profile?.full_name ?? user?.email}</h2><p className="mt-3 max-w-2xl text-sm font-medium leading-7 text-slate-100">وضعیت ثبت‌نام‌ها، امور مالی، پشتیبانی و محتوای سایت را از یک نمای یکپارچه مدیریت کنید.</p></div><Link to="/super-admin/analytics" className="rounded-2xl border border-white/25 bg-[#ffffff18] px-5 py-3 text-sm font-black text-white backdrop-blur hover:bg-[#ffffff2b]">مشاهده گزارش تحلیلی</Link></div>
        <span className="absolute -start-12 -top-20 size-64 rounded-full border-[35px] border-white/5" /><span className="absolute -bottom-24 end-10 size-60 rounded-full bg-white/5" />
      </div>
      {error ? <p className="mb-4 text-sm text-red-400">{error}</p> : null}

      <SectionLabel index="KPI.01" title={t('panel.liveStats')} hint={t('panel.liveStatsHint')} />
      <div className="mb-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          index="A01"
          label={t('analytics.totalTeams')}
          value={snap?.totals?.teams ?? '—'}
          accent="blue"
        />
        <StatCard
          index="A02"
          label={t('analytics.totalCompanies')}
          value={snap?.totals?.companies ?? '—'}
          accent="blue"
        />
        <StatCard
          index="A03"
          label={t('analytics.paidInvoices')}
          value={snap?.totals?.paid_invoices ?? '—'}
          accent="orange"
        />
        <StatCard
          index="A04"
          label={t('analytics.paidAmount')}
          value={
            snap?.totals ? formatMoney(snap.totals.paid_amount, i18n.language) : '—'
          }
          accent="orange"
        />
      </div>

      <SectionLabel index="OPS.02" title={t('panel.opsPulse')} hint={t('panel.opsPulseHint')} />
      <div className="mb-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard index="T01" label={t('tickets.statusOpen')} value={ticketCounts.open} accent="orange" />
        <StatCard index="T02" label={t('tickets.statusAnswered')} value={ticketCounts.answered} accent="blue" />
        <StatCard index="T03" label={t('tickets.statusClosed')} value={ticketCounts.closed} accent="green" />
        <StatCard index="T04" label={t('panel.unreadTicketsShort')} value={unread} accent="red" />
        <StatCard index="T05" label={t('staff.tabTriage')} value={pendingReview} accent="orange" />
      </div>

      <SectionLabel index="QA.03" title={t('panel.quickActions')} />
      <div className="mb-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {QUICK.map((q) => (
          <QuickAction
            key={q.to}
            to={q.to}
            index={q.index}
            title={t(q.titleKey)}
            description={t(q.descKey)}
            accent={q.accent}
            cta={t('panel.enter')}
          />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <HudFrame className="p-4">
          <SectionLabel index="FD.01" title={t('panel.latestUsers')} />
          <ul className="divide-y divide-rc-line">
            {users.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{u.full_name}</p>
                  <p className="font-mono text-[10px] text-rc-muted">{u.role}</p>
                </div>
                <span className="shrink-0 font-mono text-[10px] text-rc-muted">
                  {formatAppDate(u.created_at, i18n.language)}
                </span>
              </li>
            ))}
            {!users.length ? <li className="py-3 text-sm text-rc-muted">—</li> : null}
          </ul>
          <Link to="/super-admin/users" className="mt-2 inline-block text-xs text-rc-blue hover:underline">
            {t('panel.viewAll')} →
          </Link>
        </HudFrame>

        <HudFrame className="p-4">
          <SectionLabel index="FD.02" title={t('panel.latestCompanies')} />
          <ul className="divide-y divide-rc-line">
            {companies.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{c.name}</p>
                  <p className="font-mono text-[10px] text-rc-muted">{c.slug}</p>
                </div>
                <Link to={`/companies/${c.slug}`} className="text-xs text-rc-blue hover:underline">
                  {t('admin.pages.preview')}
                </Link>
              </li>
            ))}
            {!companies.length ? <li className="py-3 text-sm text-rc-muted">—</li> : null}
          </ul>
          <Link
            to="/super-admin/companies"
            className="mt-2 inline-block text-xs text-rc-blue hover:underline"
          >
            {t('panel.viewAll')} →
          </Link>
        </HudFrame>

        <HudFrame className="p-4">
          <SectionLabel index="FD.03" title={t('panel.latestTeams')} />
          <ul className="divide-y divide-rc-line">
            {teams.map((tm) => (
              <li key={tm.id} className="flex items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{tm.name}</p>
                  <p className="font-mono text-[10px] text-rc-muted">{tm.status}</p>
                </div>
                <span className="shrink-0 font-mono text-[10px] text-rc-muted">
                  {formatAppDate(tm.created_at, i18n.language)}
                </span>
              </li>
            ))}
            {!teams.length ? <li className="py-3 text-sm text-rc-muted">—</li> : null}
          </ul>
          <Link to="/super-admin/review" className="mt-2 inline-block text-xs text-rc-blue hover:underline">
            {t('judging.tabReview')} →
          </Link>
        </HudFrame>
      </div>
    </PanelPage>
  )
}

export function LeagueAdminHomePage() {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const [judgeStats, setJudgeStats] = useState({ assigned: 0, pending: 0, submitted: 0, incomplete: 0, today: 0, upcoming: 0, finished: 0 })
  const [assignedLeagues, setAssignedLeagues] = useState<Array<{ id: string; name: string; event_starts_at: string | null; event_ends_at: string | null }>>([])
  useEffect(() => { if (!profile?.id) return; void (async () => {
    const assignments = await backend.from('league_admins').select('league_id').eq('user_id', profile.id)
    const ids = (assignments.data ?? []).map((row: { league_id: string }) => row.league_id)
    if (!ids.length) return
    const [teamsResponse, scoresResponse, leaguesResponse] = await Promise.all([backend.from('teams').select('id').in('league_id', ids).in('status', ['submitted', 'under_review', 'approved']), backend.from('judge_scores').select('team_id,status').eq('judge_id', profile.id), backend.from('leagues').select('id,name,event_starts_at,event_ends_at').in('id', ids).order('event_starts_at', { ascending: true })])
    const teamIds = new Set((teamsResponse.data ?? []).map((row: { id: string }) => row.id)); const scores = (scoresResponse.data ?? []).filter((row: { team_id: string }) => teamIds.has(row.team_id)) as Array<{ team_id: string; status: string }>
    const submitted = scores.filter((row) => row.status === 'submitted').length
    const leagueRows = (leaguesResponse.data ?? []) as Array<{ id: string; name: string; event_starts_at: string | null; event_ends_at: string | null }>; setAssignedLeagues(leagueRows)
    const now = Date.now(); const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0); const dayEnd = dayStart.getTime() + 86_400_000
    const today = leagueRows.filter((row) => { const start = row.event_starts_at ? new Date(row.event_starts_at).getTime() : 0; const end = row.event_ends_at ? new Date(row.event_ends_at).getTime() : start; return start < dayEnd && end >= dayStart.getTime() }).length
    setJudgeStats({ assigned: teamIds.size, pending: Math.max(0, teamIds.size - submitted), submitted, incomplete: scores.filter((row) => row.status === 'draft').length, today, upcoming: leagueRows.filter((row) => row.event_starts_at && new Date(row.event_starts_at).getTime() >= dayEnd).length, finished: leagueRows.filter((row) => row.event_ends_at && new Date(row.event_ends_at).getTime() < now).length })
  })().catch(() => undefined) }, [profile?.id])
  return (
    <PanelPage index="LA.00" title={t('judging.title')} description={t('judging.subtitle')}>
      <div className="role-welcome relative overflow-hidden rounded-[1.75rem] bg-gradient-to-l from-[#123d55] via-[#087eb8] to-[#087a58] p-6 text-white shadow-[0_22px_60px_rgb(8_126_184/0.18)] sm:p-8"><div className="relative z-10 flex flex-wrap items-center justify-between gap-5"><div><p className="text-sm font-black text-cyan-200">میز کار داور</p><h2 className="mt-2 text-2xl font-black text-white">{profile?.full_name ?? 'داور'}، کارهای امروز آماده است</h2><p className="mt-3 max-w-2xl text-sm font-medium leading-7 text-white/80">مسابقه امروز و تیم‌های بدون امتیاز در اولویت‌اند. با دکمه شروع داوری مستقیماً وارد صف بررسی شوید.</p></div><Link to="/league-admin/review" className="rounded-2xl bg-white px-5 py-3 text-sm font-black text-sky-800 shadow-lg transition hover:-translate-y-0.5">شروع داوری ←</Link></div><span className="absolute -bottom-24 -start-16 size-64 rounded-full border-[36px] border-white/5" /></div>
      <SectionLabel index="TODAY.01" title="نمای سریع وظایف" hint="آمار زنده بر اساس لیگ‌های تخصیص‌یافته به شما" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><StatCard index="J01" label="مسابقات امروز" value={judgeStats.today} hint="نیازمند حضور و اقدام" accent="blue" /><StatCard index="J02" label="تیم‌های در انتظار بررسی" value={judgeStats.pending} hint={`از ${judgeStats.assigned.toLocaleString('fa-IR')} تیم تخصیص‌یافته`} accent="orange" /><StatCard index="J03" label="نتایج ثبت‌شده" value={judgeStats.submitted} hint="ثبت نهایی توسط شما" accent="green" /><StatCard index="J04" label="پیش‌نویس‌های باقی‌مانده" value={judgeStats.incomplete} hint="نیازمند تکمیل یا ثبت نهایی" accent="red" /></div>
      <div className="grid gap-4 lg:grid-cols-[1.15fr_.85fr]"><PanelCard title="تقویم مسابقات من" description="رویدادهای پیش رو، امروز و پایان‌یافته"><div className="grid gap-2">{assignedLeagues.slice(0, 5).map((league) => { const start = league.event_starts_at ? new Date(league.event_starts_at).getTime() : null; const end = league.event_ends_at ? new Date(league.event_ends_at).getTime() : start; const now = Date.now(); const state = start && start > now ? 'upcoming' : end && end < now ? 'finished' : 'today'; return <div key={league.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-4"><div><p className="font-black text-slate-800">{league.name}</p><p className="mt-1 text-xs text-slate-400">{league.event_starts_at ? formatAppDate(league.event_starts_at, 'fa') : 'زمان مسابقه هنوز تعیین نشده'}</p></div><StatusBadge status={state === 'today' ? 'under_review' : state === 'finished' ? 'approved' : 'submitted'} label={state === 'today' ? 'امروز' : state === 'finished' ? 'برگزارشده' : 'پیش رو'} /></div>})}{!assignedLeagues.length ? <p className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">هنوز لیگی به شما تخصیص داده نشده است.</p> : null}</div></PanelCard><PanelCard title="وضعیت دوره‌ها" description="دید کلی برنامه داوری"><div className="grid grid-cols-2 gap-3"><div className="rounded-2xl bg-sky-50 p-4"><strong className="text-2xl text-sky-800">{judgeStats.upcoming}</strong><p className="mt-1 text-xs font-bold text-sky-600">مسابقه پیش رو</p></div><div className="rounded-2xl bg-emerald-50 p-4"><strong className="text-2xl text-emerald-800">{judgeStats.finished}</strong><p className="mt-1 text-xs font-bold text-emerald-600">مسابقه برگزارشده</p></div></div><Link to="/league-admin/review" className="mt-4 flex items-center justify-between rounded-2xl border border-sky-100 bg-white p-4 text-sm font-black text-sky-700 shadow-sm"><span>مشاهده تیم‌ها و نتایج</span><span>←</span></Link></PanelCard></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <QuickAction
          to="/league-admin/review"
          index="QA.01"
          title={t('judging.tabReview')}
          description={t('judging.subtitle')}
          accent="blue"
          cta={t('panel.enter')}
        />
        <QuickAction
          to="/league-admin/tickets"
          index="QA.02"
          title={t('judging.tabTickets')}
          description={t('tickets.generalHint')}
          accent="orange"
          cta={t('panel.enter')}
        />
      </div>
    </PanelPage>
  )
}

export function StaffHomePage() {
  const { t } = useTranslation()
  const { profile } = useAuth()
  return (
    <PanelPage index="ST.00" title={t('staff.title')} description={t('staff.subtitle')}>
      <div className="role-welcome relative overflow-hidden rounded-[1.75rem] bg-gradient-to-l from-[#0b4964] to-[#0b9365] p-6 text-white shadow-[0_22px_60px_rgb(11_147_101/0.18)] sm:p-8"><p className="text-sm font-black text-emerald-200">میز کار کارشناسان</p><h2 className="mt-2 text-2xl font-black text-white">روز بخیر، {profile?.full_name ?? 'کارشناس'}</h2><p className="mt-3 max-w-2xl text-sm font-medium leading-7 text-slate-100">گفتگوهای آنلاین، درخواست‌های پشتیبانی و موارد نیازمند پیگیری در دسترس شما هستند.</p></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <QuickAction
          to="/staff/tickets"
          index="QA.01"
          title={t('staff.tabTickets')}
          description={t('tickets.generalHint')}
          accent="blue"
          cta={t('panel.enter')}
        />
        <QuickAction
          to="/staff/triage"
          index="QA.02"
          title={t('staff.tabTriage')}
          description={t('staff.triageHint')}
          accent="orange"
          cta={t('panel.enter')}
        />
      </div>
    </PanelPage>
  )
}

export function DashboardRedirectPage() {
  const { t } = useTranslation()
  const { user, profile, loading, profileLoading, profileError, refreshProfile } = useAuth()

  if (loading || (user && !profile && profileLoading)) {
    return <div className="py-16 text-center text-rc-muted">…</div>
  }
  if (!user) return <Navigate to="/login" replace />
  if (!profile) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-sm text-rc-muted">{t('auth.profileLoadFailed')}</p>
        {profileError ? (
          <p className="max-w-md break-words font-mono text-xs text-red-400">{profileError}</p>
        ) : null}
        <button
          type="button"
          className="rounded-lg border border-rc-line px-3 py-2 text-sm text-rc-blue hover:bg-rc-hover"
          onClick={() => void refreshProfile()}
        >
          {t('common.retry')}
        </button>
      </div>
    )
  }
  if (isSignupIncomplete(profile)) {
    return <Navigate to="/signup" replace />
  }
  return <Navigate to={roleHomePath(profile.role)} replace />
}
