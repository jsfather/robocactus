import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PanelPage } from '@/components/layout/PanelShell'
import { HudFrame, QuickAction, SectionLabel, StatCard } from '@/components/panel/HudKit'
import { fetchAnalyticsSnapshot, type AnalyticsSnapshot } from '@/features/analytics/api'
import { fetchTicketStatusCounts } from '@/features/tickets/api'
import { backend } from '@/lib/backend'
import { formatAppDate } from '@/lib/dates'
import { useAuth } from '@/hooks/useAuth'
import { useUnreadTicketCount } from '@/hooks/useUnreadTickets'
import { roleHomePath } from '@/features/panel/nav'
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
      <p className="mb-4 font-mono text-xs text-rc-muted">
        {t('panel.signedInAs')}:{' '}
        <span className="text-rc-text">{profile?.full_name ?? user?.email}</span>
      </p>
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
  return (
    <PanelPage index="LA.00" title={t('judging.title')} description={t('judging.subtitle')}>
      <div className="grid gap-3 sm:grid-cols-2">
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
  return (
    <PanelPage index="ST.00" title={t('staff.title')} description={t('staff.subtitle')}>
      <div className="grid gap-3 sm:grid-cols-2">
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
  return <Navigate to={roleHomePath(profile.role)} replace />
}
