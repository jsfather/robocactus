import { useEffect, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/hooks/useAuth'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { useSiteSettings } from '@/hooks/useSiteSettings'
import { sortedNavItems, ensureLiveResultsNavItem } from '@/features/settings/api'
import { HeaderSearch } from '@/components/layout/HeaderSearch'
import type { AppLocale } from '@/i18n'

const navClass = ({ isActive }: { isActive: boolean }) =>
  [
    'relative px-3 py-2 text-sm transition',
    isActive ? 'text-rc-blue' : 'text-rc-muted hover:text-rc-text',
  ].join(' ')

export function PublicHeader() {
  const { t, i18n } = useTranslation()
  const { user, signOut } = useAuth()
  const { settings, loading: settingsLoading } = useSiteSettings()
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const locale = (i18n.language === 'en' ? 'en' : 'fa') as AppLocale

  const brand =
    locale === 'en'
      ? settings?.site_name_en || t('app.name')
      : settings?.site_name_fa || t('app.name')

  const cmsNav = sortedNavItems(settings?.nav_items)
  // While settings load (or CMS nav is empty), use the built-in menu.
  // ensureLiveResultsNavItem alone would turn [] into a 1-item [/live] menu and hide the fallback.
  const navSource =
    !settingsLoading && cmsNav.length > 0
      ? ensureLiveResultsNavItem(cmsNav, {
          fa: t('nav.liveResults'),
          en: t('nav.liveResults'),
        })
      : null
  const fallbackNav = [
    { href: '/', label: t('nav.home'), end: true },
    { href: '/live', label: t('nav.liveResults') },
    { href: '/leagues', label: t('nav.leagues') },
    { href: '/rankings', label: t('nav.rankings') },
    { href: '/companies', label: t('nav.companies') },
    { href: '/blog', label: t('nav.blog') },
    { href: '/gallery', label: t('nav.gallery') },
    { href: '/about', label: t('nav.about') },
  ]

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const toggleLocale = () => {
    void i18n.changeLanguage(locale === 'fa' ? 'en' : 'fa')
  }

  const links = navSource
    ? navSource.map((item) => ({
        href: item.href,
        label: locale === 'en' ? item.label_en : item.label_fa,
        end: item.href === '/',
        key: item.id,
      }))
    : fallbackNav.map((item) => ({
        href: item.href,
        label: item.label,
        end: Boolean(item.end),
        key: item.href,
      }))

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-40 px-3 pt-3 sm:px-5 sm:pt-4">
      <header
        className={[
          'pointer-events-auto mx-auto max-w-6xl overflow-hidden rounded-2xl border transition-all duration-300',
          scrolled
            ? 'border-rc-line/70 bg-rc-bg/90 shadow-[0_18px_50px_rgb(0_0_0/0.35)] backdrop-blur-xl'
            : 'border-white/10 bg-rc-navy/55 shadow-[0_12px_40px_rgb(0_0_0/0.22)] backdrop-blur-md',
        ].join(' ')}
      >
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-l from-transparent via-rc-blue/45 to-transparent opacity-80" />
        <div className="flex items-center justify-between gap-3 px-3.5 py-3 sm:px-4 sm:py-3.5">
          <Link to="/" className="group flex items-center gap-2.5">
            {settings?.logo_url ? (
              <img src={settings.logo_url} alt="" className="size-9 object-contain sm:size-10" />
            ) : (
              <span className="relative flex size-9 items-center justify-center rounded-xl border border-rc-blue/40 bg-rc-blue/10 font-mono text-sm text-rc-blue sm:size-10">
                <span className="pointer-events-none absolute inset-0 animate-rc-soft-pulse rounded-xl bg-rc-blue/20" />
                <span className="relative">RC</span>
              </span>
            )}
            <span className="flex flex-col">
              <span className="text-base font-semibold tracking-tight transition group-hover:text-rc-blue sm:text-lg">
                {brand}
              </span>
              <span className="hidden font-mono text-[9px] tracking-[0.22em] text-rc-muted uppercase sm:block">
                Robotics Arena
              </span>
            </span>
          </Link>

          <nav className="hidden items-center gap-0.5 lg:flex">
            {links.map((item) => (
              <NavLink key={item.key} to={item.href} end={item.end} className={navClass}>
                {({ isActive }) => (
                  <>
                    {item.label}
                    <span
                      className={[
                        'absolute inset-x-3 -bottom-0.5 h-px origin-center bg-rc-blue transition duration-300',
                        isActive ? 'scale-x-100' : 'scale-x-0',
                      ].join(' ')}
                    />
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <HeaderSearch />
            <ThemeToggle />
            <button
              type="button"
              onClick={toggleLocale}
              className="rounded-lg border border-rc-line px-2.5 py-1.5 font-mono text-xs text-rc-muted transition hover:border-rc-blue/40 hover:text-rc-text"
              aria-label={t('common.language')}
            >
              {locale === 'fa' ? 'EN' : 'FA'}
            </button>

            {user ? (
              <>
                <Link
                  to="/dashboard"
                  className="hidden rounded-lg border border-rc-blue/40 bg-rc-blue/10 px-3 py-1.5 text-sm text-rc-blue transition hover:bg-rc-blue/20 sm:inline-flex"
                >
                  {t('nav.dashboard')}
                </Link>
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className="hidden rounded-lg px-2.5 py-1.5 text-sm text-rc-muted hover:text-rc-text md:inline"
                >
                  {t('nav.logout')}
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="hidden rounded-lg px-2.5 py-1.5 text-sm text-rc-muted hover:text-rc-text sm:inline"
                >
                  {t('nav.login')}
                </Link>
                <Link
                  to="/signup"
                  className="rounded-lg bg-rc-accent px-3 py-1.5 text-sm font-medium text-white transition hover:brightness-110"
                >
                  {t('nav.signup')}
                </Link>
              </>
            )}

            <button
              type="button"
              className="rounded-lg border border-rc-line p-2 text-rc-muted lg:hidden"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label="menu"
            >
              <svg viewBox="0 0 24 24" className="size-5" fill="none">
                {mobileOpen ? (
                  <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                ) : (
                  <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {mobileOpen ? (
          <div className="border-t border-rc-line/70 bg-rc-navy/80 px-3 py-3 lg:hidden">
            <nav className="flex flex-col gap-1">
              {links.map((item) => (
                <NavLink
                  key={item.key}
                  to={item.href}
                  end={item.end}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    `rounded-lg px-3 py-2.5 text-sm ${isActive ? 'bg-rc-blue/15 text-rc-blue' : 'text-rc-muted'}`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
        ) : null}
      </header>
    </div>
  )
}
