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
}): boolean {
  if (!profile.full_name?.trim()) return true
  if (profile.account_type === 'legal') {
    return !profile.company_name?.trim() || !profile.company_national_id?.trim()
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
    <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-4">
      {groups.map((group) => (
        <div key={group.id}>
          <p className="mb-2 px-3 font-mono text-[10px] tracking-[0.22em] text-rc-muted uppercase">
            {t(group.titleKey)}
          </p>
          <ul className="space-y-0.5">
            {group.items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    [
                      'flex items-center justify-between gap-2 border border-transparent px-3 py-2.5 text-sm transition',
                      isActive
                        ? 'border-rc-blue/30 bg-rc-blue/15 font-medium text-rc-blue'
                        : 'text-rc-muted hover:border-rc-line hover:bg-rc-hover hover:text-rc-text',
                    ].join(' ')
                  }
                >
                  <span>{t(item.labelKey)}</span>
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
  const home = roleHomePath(role)
  const active = activePanelGroup(location.pathname, role)
  const activeItem = activePanelItem(location.pathname, role)

  const redirectTo = canonicalizePanelPath(location.pathname, profile.role)

  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

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
    <div className="relative flex min-h-dvh bg-rc-bg text-rc-text">
      <div
        className="pointer-events-none fixed inset-0 opacity-40"
        style={{
          background:
            'radial-gradient(ellipse 50% 40% at 80% 0%, var(--rc-glow-blue), transparent), radial-gradient(ellipse 40% 30% at 10% 100%, var(--rc-glow-orange), transparent)',
        }}
      />

      <aside className="fixed inset-y-0 right-0 z-30 hidden w-64 flex-col border-l border-rc-line bg-rc-navy/95 backdrop-blur-md lg:flex">
        <div className="border-b border-rc-line px-4 py-4">
          <Link to={home} className="block">
            <p className="font-mono text-[10px] tracking-[0.3em] text-rc-blue uppercase">RoboCup · Tabarestan</p>
            <p className="mt-1 text-sm font-semibold">{t('panel.shellTitle')}</p>
            <p className="mt-1 font-mono text-[9px] tracking-[0.18em] text-rc-muted uppercase">
              مدیریت مسابقات تبرستان
            </p>
          </Link>
        </div>
        <SidebarNav role={role} />
        <div className="border-t border-rc-line p-3">
          <p className="truncate px-2 text-xs text-rc-muted">{profile?.full_name ?? user?.email}</p>
          <p className="mt-0.5 px-2 font-mono text-[10px] text-rc-blue">{t(`dashboard.roles.${role}`)}</p>
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
          <aside className="absolute inset-y-0 right-0 flex w-[min(18rem,88vw)] flex-col border-l border-rc-line bg-rc-navy shadow-xl">
            <div className="flex items-center justify-between border-b border-rc-line px-4 py-3">
              <p className="text-sm font-semibold">{t('panel.shellTitle')}</p>
              <button
                type="button"
                className="rounded-lg p-2 text-rc-muted hover:bg-rc-hover"
                onClick={() => setMobileOpen(false)}
              >
                <MenuIcon open />
              </button>
            </div>
            <SidebarNav role={role} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      ) : null}

      <div className="relative flex min-h-dvh w-full flex-1 flex-col lg:pr-64">
        <header className="sticky top-0 z-20 border-b border-rc-line bg-rc-bg/85 backdrop-blur-md">
          <div className="flex h-16 items-center gap-3 px-4 md:px-6">
            <button
              type="button"
              className="border border-rc-line p-2 text-rc-muted hover:bg-rc-hover lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="menu"
            >
              <MenuIcon open={false} />
            </button>

            <div className="min-w-0 flex-1">
              <p className="font-mono text-[9px] tracking-[0.24em] text-rc-blue uppercase">
                {active ? t(active.titleKey) : 'SYS'}
              </p>
              <p className="truncate text-sm font-semibold md:text-base">{title}</p>
              {activeItem?.helpKey ? (
                <p className="mt-0.5 line-clamp-2 text-xs text-rc-muted">{t(activeItem.helpKey)}</p>
              ) : null}
            </div>

            <div className="hidden items-center border border-rc-line bg-rc-surface/60 px-2.5 py-1.5 md:flex">
              <span className="font-mono text-[10px] tracking-wide text-rc-muted tabular-nums">
                {dateLabel}
              </span>
            </div>

            <NotificationBell role={role} />
            <UserMenu role={role} />
          </div>
        </header>

        <main className="relative flex-1 px-4 py-6 md:px-6 md:py-8">
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
    <div className="mx-auto max-w-6xl space-y-6">
      {(title || actions) && (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            {index ? (
              <p className="mb-1 font-mono text-[10px] tracking-[0.28em] text-rc-blue uppercase">
                {index}
              </p>
            ) : null}
            {title ? <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1> : null}
            {description ? <p className="mt-1 text-sm text-rc-muted">{description}</p> : null}
            <div className="mt-3 h-1 w-14 rounded-full bg-gradient-to-l from-rc-accent to-rc-blue" />
          </div>
          {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
        </div>
      )}
      {children}
    </div>
  )
}
