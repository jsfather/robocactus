import { useEffect, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/hooks/useAuth'
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
    <div className="pointer-events-none fixed inset-x-0 top-0 z-40 px-3 pt-3 sm:px-6 sm:pt-5">
      <header
        className={[
          'pointer-events-auto relative mx-auto max-w-7xl overflow-hidden rounded-[1.75rem] border transition-all duration-300',
          scrolled
            ? 'border-white bg-white/95 shadow-[0_18px_60px_rgb(16_75_96/0.14)] backdrop-blur-xl'
            : 'border-white/80 bg-white/88 shadow-[0_14px_50px_rgb(16_75_96/0.10)] backdrop-blur-xl',
        ].join(' ')}
      >
        <div className="pointer-events-none absolute inset-y-0 start-0 w-1.5 bg-gradient-to-b from-rc-blue to-rc-accent" />
        <div className="flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
          <Link to="/" className="group flex items-center gap-2.5">
            {settings?.logo_url ? (
              <img src={settings.logo_url} alt="" className="size-9 object-contain sm:size-10" />
            ) : (
              <span className="relative flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-rc-blue to-rc-accent text-sm font-black text-white shadow-[0_8px_24px_rgb(8_126_184/0.22)]">
                <span className="relative">RT</span>
              </span>
            )}
            <span className="flex flex-col">
              <span className="text-base font-black tracking-tight text-slate-800 transition group-hover:text-rc-blue sm:text-lg">
                {brand}
              </span>
              <span className="hidden text-[10px] font-semibold text-emerald-600 sm:block">
                آمل · مازندران
              </span>
            </span>
          </Link>

          <nav className="hidden items-center gap-0.5 rounded-2xl bg-sky-50/80 p-1.5 lg:flex">
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
                  className="rounded-xl bg-gradient-to-l from-emerald-500 to-green-500 px-4 py-2 text-sm font-bold text-white shadow-[0_8px_22px_rgb(19_169_77/0.22)] transition hover:-translate-y-0.5"
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
          <div className="border-t border-sky-100 bg-white px-4 py-4 lg:hidden">
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
