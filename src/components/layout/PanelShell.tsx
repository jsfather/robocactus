import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, NavLink, Navigate, Outlet, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/hooks/useAuth'
import { useUnreadTicketCount } from '@/hooks/useUnreadTickets'
import {
  activePanelGroup,
  activePanelItem,
  canonicalizePanelPath,
  panelsForRole,
  roleHomePath,
} from '@/features/panel/nav'
import { PanelErrorBoundary } from '@/components/layout/PanelErrorBoundary'
import { NotificationBell } from '@/components/panel/NotificationBell'
import { UserMenu } from '@/components/panel/UserMenu'
import { SmsBalancePill } from '@/components/panel/SmsBalancePill'
import { AccountPendingBanner } from '@/components/layout/AccountPendingBanner'
import { AccountIssuesPanel } from '@/features/account-issues/AccountIssuesPanel'
import { enqueueIncompleteProfileSms } from '@/features/notifications/api'
import { formatAppDate } from '@/lib/dates'
import type { UserRole } from '@/types/database'

function profileLooksIncomplete(profile: {
  account_type?: string
  national_id?: string | null
  company_name?: string | null
  company_national_id?: string | null
  full_name?: string
  email?: string | null
  first_name_fa?: string | null
  last_name_fa?: string | null
  first_name_en?: string | null
  last_name_en?: string | null
  birth_date?: string | null
  postal_code?: string | null
  address?: string | null
  legal_representative_national_id?: string | null
  identity_completed_at?: string | null
  phone_verified_at?: string | null
}): boolean {
  if (!profile.full_name?.trim() || !profile.email?.trim() || !profile.first_name_fa?.trim() || !profile.last_name_fa?.trim() || !profile.first_name_en?.trim() || !profile.last_name_en?.trim() || !profile.birth_date || !profile.postal_code?.trim() || !profile.address?.trim() || !profile.phone_verified_at || !profile.identity_completed_at) return true
  if (profile.account_type === 'legal') {
    return !profile.company_name?.trim() || !profile.company_national_id?.trim() || !profile.legal_representative_national_id?.trim()
  }
  return !profile.national_id?.trim()
}

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden>
      {open ? (
        <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      ) : (
        <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      )}
    </svg>
  )
}

function PanelNavIcon({ path }: { path: string }) {
  const common = { className: 'size-[1.15rem]', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24', 'aria-hidden': true }
  if (path.includes('kavenegar')) return <svg {...common}><path d="M4 6h16v12H4z"/><path d="m4 7 8 6 8-6"/><path d="M8 18v2m8-2v2"/></svg>
  if (path.includes('settings') || path.includes('access') || path.includes('registration')) return <svg {...common}><path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1m-8.6 8.6-2.1 2.1"/><circle cx="12" cy="12" r="3.2"/></svg>
  if (path.includes('ticket') || path.includes('chat')) return <svg {...common}><path d="M5 5h14v11H9l-4 3V5Z"/><path d="M8 9h8M8 12h5"/></svg>
  if (path.includes('league') || path.includes('competition')) return <svg {...common}><path d="M8 4h8v4a4 4 0 0 1-8 0V4Z"/><path d="M8 6H4v1a4 4 0 0 0 4 4m8-5h4v1a4 4 0 0 1-4 4M12 12v5m-4 3h8"/></svg>
  if (path.includes('user') || path.includes('participant') || path.includes('profile')) return <svg {...common}><circle cx="12" cy="8" r="3"/><path d="M5 20a7 7 0 0 1 14 0"/></svg>
  if (path.includes('finance') || path.includes('payment')) return <svg {...common}><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M16 15h2"/></svg>
  if (path.includes('analytics')) return <svg {...common}><path d="M5 20V10m7 10V4m7 16v-7"/></svg>
  if (path.includes('content') || path.includes('pages') || path.includes('home')) return <svg {...common}><path d="M6 3h9l3 3v15H6V3Z"/><path d="M9 9h6M9 13h6M9 17h4"/></svg>
  if (path.includes('compan')) return <svg {...common}><path d="M4 21V6l8-3v18m0-12 8-3v15M8 8v1m0 4v1m8-2v1m0 4v1"/></svg>
  if (path.includes('review') || path.includes('triage')) return <svg {...common}><path d="M7 3h10v4H7zM5 5H4v16h16V5h-1"/><path d="m8 14 2.5 2.5L16 11"/></svg>
  return <svg {...common}><path d="M4 13h6V4H4v9Zm10 7h6V11h-6v9ZM4 20h6v-3H4v3Zm10-13h6V4h-6v3Z"/></svg>
}

function SidebarNav({
  role,
  onNavigate,
}: {
  role: UserRole
  onNavigate?: () => void
}) {
  const { t } = useTranslation()
  const { count } = useUnreadTicketCount()
  const groups = useMemo(() => panelsForRole(role), [role])

  return (
    <nav className="panel-nav-scroll flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-5">
      {groups.map((group) => (
        <div key={group.id}>
          <p className="mb-2.5 px-3 text-[11px] font-black tracking-[0.08em] text-slate-500 uppercase">
            {t(group.titleKey)}
          </p>
          <ul className="space-y-1">
            {group.items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    [
                      'panel-nav-link group flex items-center justify-between gap-2 border border-transparent px-3 py-2.5 text-[13px] font-semibold transition',
                      isActive
                        ? 'is-active border-sky-200 bg-sky-50 text-sky-900 shadow-[0_8px_22px_rgb(8_126_184/0.10)]'
                        : 'text-slate-700 hover:border-sky-100 hover:bg-white hover:text-sky-800',
                    ].join(' ')
                  }
                >
                  <span className="flex min-w-0 items-center gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600 transition group-hover:bg-sky-100 group-hover:text-sky-700"><PanelNavIcon path={item.to} /></span><span className="truncate">{t(item.labelKey)}</span></span>
                  {item.badge === 'tickets' && count > 0 ? (
                    <span className="inline-flex min-w-5 justify-center rounded-full bg-rc-accent px-1.5 py-0.5 font-mono text-[10px] text-white">
                      {count > 99 ? '99+' : count}
                    </span>
                  ) : null}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}

export function PanelShell() {
  const { t, i18n } = useTranslation()
  const { profile, user, loading, profileLoading, profileError, refreshProfile } = useAuth()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!mobileOpen) return
    const close = (event: KeyboardEvent) => event.key === 'Escape' && setMobileOpen(false)
    document.addEventListener('keydown', close)
    return () => document.removeEventListener('keydown', close)
  }, [mobileOpen])

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (!profile?.id || profile.account_status === 'pending') return
    if (!profileLooksIncomplete(profile)) return
    const key = `rc-incomplete-sms:${profile.id}:${new Date().toISOString().slice(0, 10)}`
    if (sessionStorage.getItem(key)) return
    sessionStorage.setItem(key, '1')
    void enqueueIncompleteProfileSms(profile.id).catch(() => undefined)
  }, [profile])

  if (loading || (user && !profile && profileLoading)) {
    return (
      <div className="flex min-h-dvh items-center justify-center font-mono text-sm text-rc-muted">
        …
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (!profile) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
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

  const role = profile.role
  const identityRequired = role === 'company_admin' || role === 'team_captain'
  if (identityRequired && profileLooksIncomplete(profile) && location.pathname !== '/account/profile') {
    return <Navigate to="/account/profile" replace />
  }
  const home = roleHomePath(role)
  const active = activePanelGroup(location.pathname, role)
  const activeItem = activePanelItem(location.pathname, role)

  const redirectTo = canonicalizePanelPath(location.pathname, profile.role)

  if (redirectTo) {
    return <Navigate to={redirectTo} replace />
  }

  const title = activeItem
    ? t(activeItem.labelKey)
    : active
      ? t(active.titleKey)
      : t('nav.dashboard')

  const dateLabel = formatAppDate(now.toISOString(), i18n.language, { withTime: true })

  return (
    <div className="panel-shell panel-shell-v4 relative flex min-h-dvh text-rc-text">
      <div
        className="pointer-events-none fixed inset-0 opacity-40"
        style={{
          background:
            'radial-gradient(ellipse 50% 40% at 80% 0%, var(--rc-glow-blue), transparent), radial-gradient(ellipse 40% 30% at 10% 100%, var(--rc-glow-orange), transparent)',
        }}
      />

      <aside className="panel-sidebar panel-sidebar-v4 fixed inset-y-3 right-3 z-30 hidden w-[18.5rem] flex-col overflow-hidden rounded-[2rem] border border-slate-200 lg:flex">
        <div className="border-b border-slate-200 px-5 py-5">
          <Link to={home} className="flex items-center gap-3">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-white to-emerald-50 text-xl font-black text-[#087eb8] shadow-lg shadow-black/15">ت</span>
            <span><span className="block text-base font-black text-slate-900">جام تبرستان</span><span className="mt-0.5 block text-[10px] font-bold tracking-wide text-slate-500">TABARESTAN CONTROL CENTER</span></span>
          </Link>
        </div>
        <SidebarNav role={role} />
        <div className="panel-sidebar-profile m-3 rounded-2xl border border-slate-200 p-3.5">
          <div className="flex items-center gap-3"><span className="grid size-9 overflow-hidden place-items-center rounded-xl bg-emerald-100 text-sm font-black text-emerald-700">{profile.avatar_url ? <img src={profile.avatar_url} alt="" className="size-full object-cover" /> : (profile.full_name ?? 'U').slice(0, 1)}</span><span className="min-w-0"><p className="truncate text-xs font-bold text-slate-900">{profile?.full_name ?? user?.email}</p><p className="mt-0.5 text-[10px] font-medium text-slate-500">{t(`dashboard.roles.${role}`)}</p></span></div>
        </div>
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="close"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="panel-sidebar-v4 absolute inset-y-0 right-0 flex w-[min(19rem,88vw)] flex-col border-l border-slate-200 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4">
              <p className="text-sm font-bold text-slate-900">{t('panel.shellTitle')}</p>
              <button
                type="button"
                className="rounded-xl p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                onClick={() => setMobileOpen(false)}
              >
                <MenuIcon open />
              </button>
            </div>
            <SidebarNav role={role} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      ) : null}

      <div className="relative flex min-h-dvh w-full flex-1 flex-col lg:pr-[19.5rem]">
        <header className="panel-topbar panel-topbar-v5 sticky top-3 z-20 mx-3 mt-3 overflow-visible rounded-2xl border border-slate-200 lg:mx-5">
          <div className="flex min-h-[4.5rem] items-center gap-3 px-4 md:px-5">
            <button
              type="button"
              className="rounded-xl border border-rc-line bg-slate-50 p-2.5 text-slate-600 hover:bg-slate-100 lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="menu"
            >
              <MenuIcon open={false} />
            </button>

            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-extrabold tracking-[0.1em] text-emerald-700 uppercase">
                {active ? t(active.titleKey) : 'SYS'}
              </p>
              <p className="truncate text-base font-black text-slate-900 md:text-lg">{title}</p>
              {activeItem?.helpKey ? (
                <p className="mt-0.5 line-clamp-2 text-xs font-medium text-slate-600">{t(activeItem.helpKey)}</p>
              ) : null}
            </div>

            <Link to="/" className="hidden items-center rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-800 transition hover:bg-sky-100 md:flex">مشاهده سایت</Link>
            <div className="hidden items-center rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 md:flex">
              <span className="font-mono text-[10px] font-semibold tracking-wide text-slate-600 tabular-nums">
                {dateLabel}
              </span>
            </div>

            {role === 'super_admin' ? <SmsBalancePill /> : null}
            <NotificationBell role={role} />
            <UserMenu role={role} />
          </div>
        </header>

        <main data-panel-section={active?.id ?? 'account'} className="relative flex-1 px-3 py-6 sm:px-5 md:py-8 lg:px-7">
          <div className="relative">
            <AccountPendingBanner />
            <AccountIssuesPanel />
            <PanelErrorBoundary key={location.pathname}>
              <Outlet />
            </PanelErrorBoundary>
          </div>
        </main>
      </div>
    </div>
  )
}

export function PanelPage({
  title,
  description,
  actions,
  index,
  children,
}: {
  title?: string
  description?: string
  actions?: ReactNode
  index?: string
  children: ReactNode
}) {
  return (
    <div className="panel-page mx-auto max-w-[90rem] space-y-6">
      {(title || actions) && (
        <div className="panel-page-head relative overflow-hidden rounded-[1.75rem] border border-white/80 bg-white px-5 py-6 shadow-[0_18px_60px_rgb(18_76_98/0.08)] sm:px-7 sm:py-7">
          <div className="pointer-events-none absolute inset-y-0 start-0 w-1.5 bg-gradient-to-b from-rc-blue via-cyan-400 to-emerald-400" />
          <div className="flex flex-wrap items-center justify-between gap-5"><div>
            {index ? (
              <p className="mb-2 inline-flex rounded-lg bg-sky-50 px-2.5 py-1 text-[10px] font-black tracking-[0.08em] text-rc-blue uppercase">
                {index}
              </p>
            ) : null}
            {title ? <h1 className="text-2xl font-black tracking-tight text-slate-900 md:text-[2rem]">{title}</h1> : null}
            {description ? <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-500">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}</div>
        </div>
      )}
      <div className="panel-page-body space-y-6">{children}</div>
    </div>
  )
}
