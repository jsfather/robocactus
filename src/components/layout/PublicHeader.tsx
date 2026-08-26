import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/hooks/useAuth'
import { useSiteSettings } from '@/hooks/useSiteSettings'
import { sortedNavItems, ensureLiveResultsNavItem } from '@/features/settings/api'
import { HeaderSearch } from '@/components/layout/HeaderSearch'
import type { AppLocale } from '@/i18n'

const navClass = ({ isActive }: { isActive: boolean }) =>
  [
    'relative rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-all duration-200',
    isActive ? 'bg-white text-rc-blue shadow-sm ring-1 ring-sky-100' : 'text-slate-500 hover:bg-white/70 hover:text-slate-800',
  ].join(' ')

export function PublicHeader() {
  const { t, i18n } = useTranslation()
  const { user, signOut } = useAuth()
  const { settings, loading: settingsLoading } = useSiteSettings()
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const headerRef = useRef<HTMLElement>(null)
  const location = useLocation()
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

  useEffect(() => setMobileOpen(false), [location.pathname])

  useEffect(() => {
    if (!mobileOpen) return
    const closeOutside = (event: PointerEvent) => {
      if (headerRef.current && !headerRef.current.contains(event.target as Node)) setMobileOpen(false)
    }
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeWithEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeWithEscape)
    }
  }, [mobileOpen])

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
        ref={headerRef}
        className={[
          'pointer-events-auto relative mx-auto max-w-7xl overflow-hidden rounded-[2rem] border ring-1 ring-white/70 transition-all duration-300',
          scrolled
            ? 'border-white bg-white/95 shadow-[0_18px_60px_rgb(16_75_96/0.14)] backdrop-blur-xl'
            : 'border-white/80 bg-white/88 shadow-[0_14px_50px_rgb(16_75_96/0.10)] backdrop-blur-xl',
        ].join(' ')}
      >
        <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400 to-transparent" />
        <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link to="/" className="group flex items-center gap-2.5">
            {settings?.logo_url ? (
              <img src={settings.logo_url} alt="" className="size-9 object-contain sm:size-10" />
            ) : (
              <span className="relative flex size-12 items-center justify-center rounded-[1.15rem] bg-gradient-to-br from-rc-blue via-sky-500 to-rc-accent text-sm font-black text-white shadow-[0_10px_28px_rgb(8_126_184/0.26)] ring-4 ring-sky-50">
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

          <nav className="hidden items-center gap-0.5 rounded-2xl border border-sky-100/80 bg-sky-50/70 p-1 lg:flex">
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
            <div className="hidden sm:block"><HeaderSearch /></div>
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
                  className="hidden rounded-xl bg-gradient-to-l from-emerald-500 to-green-500 px-4 py-2 text-sm font-bold text-white shadow-[0_8px_22px_rgb(19_169_77/0.22)] transition hover:-translate-y-0.5 sm:inline-flex"
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
          <div className="border-t border-sky-100 bg-gradient-to-b from-white to-sky-50/70 px-4 py-4 lg:hidden">
            <nav className="flex flex-col gap-1">
              {links.map((item) => (
                <NavLink
                  key={item.key}
                  to={item.href}
                  end={item.end}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    `rounded-xl px-4 py-3 text-sm font-semibold transition ${isActive ? 'bg-white text-rc-blue shadow-sm ring-1 ring-sky-100' : 'text-slate-600 hover:bg-white'}`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
              <div className="mt-3 grid grid-cols-2 gap-2 border-t border-sky-100 pt-3">{user ? <Link to="/dashboard" onClick={() => setMobileOpen(false)} className="col-span-2 rounded-xl bg-rc-blue px-4 py-3 text-center text-sm font-bold text-white">{t('nav.dashboard')}</Link> : <><Link to="/login" onClick={() => setMobileOpen(false)} className="rounded-xl border border-sky-100 bg-white px-4 py-3 text-center text-sm font-bold text-slate-600">{t('nav.login')}</Link><Link to="/signup" onClick={() => setMobileOpen(false)} className="rounded-xl bg-emerald-500 px-4 py-3 text-center text-sm font-bold text-white">{t('nav.signup')}</Link></>}</div>
            </nav>
          </div>
        ) : null}
      </header>
    </div>
  )
}
