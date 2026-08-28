import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/hooks/useAuth'
import { useSiteSettings } from '@/hooks/useSiteSettings'
import { sortedNavItems, ensureLiveResultsNavItem } from '@/features/settings/api'
import { HeaderSearch } from './HeaderSearch'
import { fetchActiveLeagues } from '@/features/companies/api'
import type { AppLocale } from '@/i18n'
import type { League } from '@/types/database'

function LineIcon({ children, className = 'size-5' }: { children: ReactNode; className?: string }) {
  return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
}

const desktopNavClass = ({ isActive }: { isActive: boolean }) => `relative inline-flex min-h-11 items-center px-3 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rc-blue ${isActive ? 'text-rc-blue after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-rc-blue' : 'text-slate-600 hover:text-slate-950'}`

export function PublicHeader() {
  const { t, i18n } = useTranslation()
  const { user, signOut } = useAuth()
  const { settings, loading } = useSiteSettings()
  const location = useLocation()
  const locale = (i18n.language === 'en' ? 'en' : 'fa') as AppLocale
  const [mobileOpen, setMobileOpen] = useState(false)
  const [megaOpen, setMegaOpen] = useState(false)
  const [activeLeagues, setActiveLeagues] = useState<League[]>([])
  const [theme, setTheme] = useState<'light' | 'dark'>(() => typeof window !== 'undefined' && localStorage.getItem('public-theme') === 'dark' ? 'dark' : 'light')
  const headerRef = useRef<HTMLElement>(null)
  const megaTimer = useRef<number | null>(null)

  const brand = locale === 'en' ? settings?.site_name_en || t('app.name') : settings?.site_name_fa || t('app.name')
  const cmsNav = sortedNavItems(settings?.nav_items)
  const configured = !loading && cmsNav.length ? ensureLiveResultsNavItem(cmsNav, { fa: t('nav.liveResults'), en: t('nav.liveResults') }) : null
  const fallback = [
    ['/', t('nav.home')], ['/live', t('nav.liveResults')], ['/leagues', t('nav.leagues')],
    ['/rankings', t('nav.rankings')], ['/companies', t('nav.companies')], ['/blog', t('nav.blog')],
    ['/gallery', t('nav.gallery')], ['/about', t('nav.about')],
  ]
  const links = (configured ? configured.map((item) => ({ key: item.id, href: item.href, label: locale === 'en' ? item.label_en : item.label_fa })) : fallback.map(([href, label]) => ({ key: href, href, label }))).filter((item) => item.href !== '/terms' && item.href !== '/registration-guide')

  useEffect(() => { setMobileOpen(false); setMegaOpen(false) }, [location.pathname])
  useEffect(() => { void fetchActiveLeagues().then(setActiveLeagues).catch(() => setActiveLeagues([])) }, [])
  useEffect(() => { document.documentElement.classList.toggle('dark', theme === 'dark'); document.documentElement.classList.toggle('light', theme === 'light'); localStorage.setItem('public-theme', theme) }, [theme])
  useEffect(() => {
    if (!mobileOpen) return
    const close = (event: PointerEvent) => { if (headerRef.current && !headerRef.current.contains(event.target as Node)) setMobileOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMobileOpen(false) }
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape) }
  }, [mobileOpen])

  const openMega = () => { if (megaTimer.current) clearTimeout(megaTimer.current); setMegaOpen(true) }
  const closeMega = () => { megaTimer.current = window.setTimeout(() => setMegaOpen(false), 240) }
  const controlClass = 'grid size-11 place-items-center border-s border-slate-200 text-slate-600 transition-colors hover:bg-slate-50 hover:text-rc-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rc-blue'

  return <div className="pointer-events-none fixed inset-x-0 top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur-xl">
    {mobileOpen ? <button className="pointer-events-auto fixed inset-0 bg-slate-950/35 backdrop-blur-[2px] lg:hidden" aria-label={locale === 'en' ? 'Close menu' : 'بستن منو'} onClick={() => setMobileOpen(false)} /> : null}
    <span className="absolute inset-x-0 top-0 hidden h-11 bg-slate-100 lg:block" aria-hidden="true" />
    <header ref={headerRef} className="pointer-events-auto relative mx-auto max-w-7xl bg-transparent">
      <div className="hidden h-11 items-center justify-between px-5 lg:flex">
        <HeaderSearch expanded />
        <div className="flex h-full items-center gap-4 text-xs text-slate-600">
          <button type="button" onClick={() => setTheme((value) => value === 'light' ? 'dark' : 'light')} className="grid size-9 place-items-center rounded-full bg-white text-slate-700 transition hover:text-rc-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rc-blue" aria-label={theme === 'light' ? (locale === 'en' ? 'Enable dark mode' : 'فعال‌کردن حالت تاریک') : (locale === 'en' ? 'Enable light mode' : 'فعال‌کردن حالت روشن')} aria-pressed={theme === 'dark'}>{theme === 'light' ? <LineIcon className="size-4"><path d="M20 15.5A8 8 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z" /></LineIcon> : <LineIcon className="size-4"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2" /></LineIcon>}</button>
          <button type="button" onClick={() => void i18n.changeLanguage(locale === 'fa' ? 'en' : 'fa')} className="min-h-9 rounded-full bg-white px-3 font-mono font-black text-slate-700 transition hover:text-rc-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rc-blue" aria-label={t('common.language')}>{locale === 'fa' ? 'EN' : 'فا'}</button>
          <span className="h-5 w-px bg-slate-300" aria-hidden="true" />
          <span>{locale === 'en' ? 'Competition support' : 'پشتیبانی و پاسخ‌گویی دبیرخانه'}</span>
          {settings?.support_phone ? <a href={`tel:${settings.support_phone.replace(/[^\d+]/g, '')}`} dir="ltr" className="font-black text-slate-950 hover:text-rc-blue">{settings.support_phone}</a> : null}
          <span className="grid size-9 place-items-center rounded-full bg-rc-accent/10 text-rc-accent"><LineIcon className="size-4"><path d="M7 3H4.5A1.5 1.5 0 0 0 3 4.5C3 13.6 10.4 21 19.5 21a1.5 1.5 0 0 0 1.5-1.5V17l-4-1-1.2 2a13.8 13.8 0 0 1-9.8-9.8L8 7 7 3Z" /></LineIcon></span>
        </div>
      </div>
      <div className="flex h-[4.25rem] items-stretch">
        <Link to="/" className="flex min-w-0 items-center gap-3 px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rc-blue sm:px-5">
          <span className="grid size-10 shrink-0 place-items-center border border-slate-200 bg-white p-1.5">{settings?.logo_url ? <img src={settings.logo_url} alt={brand} className="size-full object-contain" /> : <span className="text-sm font-black text-rc-blue">TC</span>}</span>
          <span className="min-w-0"><strong className="block truncate text-sm font-black text-slate-950 sm:text-base">{brand}</strong><small className="hidden text-[10px] font-bold tracking-wide text-slate-500 sm:block">{locale === 'en' ? 'National Robotics Competition' : 'مسابقات ملی رباتیک'}</small></span>
        </Link>

        <nav className="ms-auto hidden items-stretch xl:flex" aria-label={locale === 'en' ? 'Main navigation' : 'منوی اصلی'}>
          {links.map((item) => item.href === '/leagues' ? <div key={item.key} className="flex" onMouseEnter={openMega} onMouseLeave={closeMega} onFocus={openMega} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) closeMega() }}><NavLink to={item.href} className={desktopNavClass}>{item.label}<LineIcon className="ms-1 size-3.5"><path d="m7 10 5 5 5-5" /></LineIcon></NavLink></div> : <NavLink key={item.key} to={item.href} end={item.href === '/'} className={desktopNavClass}>{item.label}</NavLink>)}
        </nav>

        <div className="ms-auto flex items-stretch xl:ms-0">
          <div className="hidden items-center sm:flex lg:hidden"><HeaderSearch /></div>
          <button type="button" className={`${controlClass} lg:hidden`} onClick={() => setTheme((value) => value === 'light' ? 'dark' : 'light')} aria-label={theme === 'light' ? (locale === 'en' ? 'Enable dark mode' : 'فعال‌کردن حالت تاریک') : (locale === 'en' ? 'Enable light mode' : 'فعال‌کردن حالت روشن')} aria-pressed={theme === 'dark'}>{theme === 'light' ? <LineIcon><path d="M20 15.5A8 8 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z" /></LineIcon> : <LineIcon><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></LineIcon>}</button>
          <button type="button" className={`${controlClass} w-14 font-mono text-xs font-black lg:hidden`} onClick={() => void i18n.changeLanguage(locale === 'fa' ? 'en' : 'fa')} aria-label={t('common.language')}><span>{locale === 'fa' ? 'EN' : 'فا'}</span></button>
          {user ? <Link to="/dashboard" className="hidden min-h-11 items-center bg-rc-blue px-5 text-sm font-black text-white transition-colors hover:bg-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white md:inline-flex">{t('nav.dashboard')}</Link> : <div className="hidden items-stretch md:flex"><Link to="/login" className="inline-flex items-center border-s border-slate-200 px-4 text-sm font-black text-slate-700 transition-colors hover:bg-slate-50 hover:text-rc-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rc-blue">{t('nav.login')}</Link><Link to="/signup" className="inline-flex items-center bg-rc-blue px-5 text-sm font-black text-white transition-colors hover:bg-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white">{t('nav.signup')}</Link></div>}
          <button type="button" className={`${controlClass} xl:hidden`} onClick={() => setMobileOpen((value) => !value)} aria-label={locale === 'en' ? 'Navigation menu' : 'منوی ناوبری'} aria-expanded={mobileOpen} aria-controls="public-mobile-menu"><LineIcon>{mobileOpen ? <path d="M5 5l14 14M19 5 5 19" /> : <><path d="M4 7h16M4 12h16M4 17h16" /></>}</LineIcon></button>
        </div>
      </div>

      <div onMouseEnter={openMega} onMouseLeave={closeMega} className={`absolute inset-x-0 top-full transition duration-200 motion-reduce:transition-none ${megaOpen ? 'visible translate-y-0 opacity-100' : 'invisible -translate-y-1 opacity-0'}`}>
        <section className="mx-auto grid max-w-4xl border border-slate-200 bg-white shadow-[0_16px_36px_rgb(15_23_42/0.10)] lg:grid-cols-[15rem_1fr]" aria-label={t('nav.leagues')}>
          <div className="border-b border-slate-200 bg-slate-950 p-6 text-white lg:border-b-0 lg:border-e"><p className="text-[10px] font-black tracking-[.16em] text-sky-300">{locale === 'en' ? 'COMPETITIONS' : 'رقابت‌ها'}</p><h2 className="mt-3 text-xl font-black leading-8">{locale === 'en' ? 'Active robotics leagues' : 'لیگ‌های فعال رباتیک'}</h2><p className="mt-3 text-xs leading-6 text-slate-300">{locale === 'en' ? 'Rules, schedules and registration status.' : 'قوانین، زمان‌بندی و وضعیت ثبت‌نام هر لیگ.'}</p><Link to="/leagues" onClick={() => setMegaOpen(false)} className="mt-5 inline-flex min-h-11 items-center border-b-2 border-sky-400 text-sm font-black text-white">{locale === 'en' ? 'View all leagues' : 'مشاهده همه لیگ‌ها'}<span className="ms-2" aria-hidden="true">←</span></Link></div>
          <div className="grid max-h-[24rem] overflow-y-auto sm:grid-cols-2">{activeLeagues.slice(0, 8).map((league) => <Link key={league.id} to={`/leagues/${league.slug}`} onClick={() => setMegaOpen(false)} className="group flex min-h-20 items-center gap-3 border-b border-slate-200 p-4 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rc-blue sm:border-e"><span className="grid size-11 shrink-0 place-items-center border border-slate-200 bg-white">{league.cover_image_url ? <img src={league.cover_image_url} alt="" className="size-full object-cover" /> : <LineIcon className="size-5 text-rc-blue"><path d="M8 4h8v4a4 4 0 0 1-8 0V4Z" /><path d="M8 6H4v1a4 4 0 0 0 4 4M16 6h4v1a4 4 0 0 1-4 4M12 12v4M8 20h8" /></LineIcon>}</span><span className="min-w-0"><strong className="block truncate text-sm text-slate-900 group-hover:text-rc-blue">{locale === 'en' ? league.name_en || league.name : league.name}</strong><small className="mt-1 block text-[11px] font-bold text-slate-500">{league.registration_cycle_status === 'open' ? (locale === 'en' ? 'Registration open' : 'ثبت‌نام فعال') : (locale === 'en' ? 'League details' : 'جزئیات لیگ')}</small></span></Link>)}{!activeLeagues.length ? <p className="p-8 text-center text-sm text-slate-500 sm:col-span-2">{locale === 'en' ? 'No active leagues.' : 'در حال حاضر لیگ فعالی وجود ندارد.'}</p> : null}</div>
        </section>
      </div>

      <div id="public-mobile-menu" className={`absolute inset-x-0 top-full max-h-[calc(100dvh-4.25rem)] overflow-y-auto border-b border-slate-200 bg-white shadow-[0_16px_36px_rgb(15_23_42/0.12)] transition duration-200 motion-reduce:transition-none xl:hidden ${mobileOpen ? 'visible translate-y-0 opacity-100' : 'invisible -translate-y-2 opacity-0'}`}>
        <div className="border-b border-slate-200 p-3 sm:hidden"><HeaderSearch /></div>
        <nav className="grid sm:grid-cols-2" aria-label={locale === 'en' ? 'Mobile navigation' : 'منوی موبایل'}>{links.map((item) => <NavLink key={item.key} to={item.href} end={item.href === '/'} onClick={() => setMobileOpen(false)} className={({ isActive }) => `flex min-h-12 items-center justify-between border-b border-slate-200 px-5 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rc-blue sm:border-e ${isActive ? 'bg-sky-50 text-rc-blue' : 'text-slate-700 hover:bg-slate-50'}`}><span>{item.label}</span><span aria-hidden="true">←</span></NavLink>)}</nav>
        {activeLeagues.length ? <div className="border-b border-slate-200 p-4"><p className="mb-3 text-xs font-black text-slate-500">{locale === 'en' ? 'Active leagues' : 'لیگ‌های فعال'}</p><div className="grid gap-2 sm:grid-cols-2">{activeLeagues.slice(0, 4).map((league) => <Link key={league.id} to={`/leagues/${league.slug}`} onClick={() => setMobileOpen(false)} className="min-h-11 border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700">{locale === 'en' ? league.name_en || league.name : league.name}</Link>)}</div></div> : null}
        <div className="grid grid-cols-2 gap-2 p-4">{user ? <><Link to="/dashboard" onClick={() => setMobileOpen(false)} className="min-h-12 bg-rc-blue px-4 py-3 text-center text-sm font-black text-white">{t('nav.dashboard')}</Link><button type="button" onClick={() => void signOut()} className="min-h-12 border border-slate-300 px-4 text-sm font-black text-slate-700">{t('nav.logout')}</button></> : <><Link to="/login" onClick={() => setMobileOpen(false)} className="min-h-12 border border-slate-300 px-4 py-3 text-center text-sm font-black text-slate-700">{t('nav.login')}</Link><Link to="/signup" onClick={() => setMobileOpen(false)} className="min-h-12 bg-rc-blue px-4 py-3 text-center text-sm font-black text-white">{t('nav.signup')}</Link></>}</div>
      </div>
    </header>
  </div>
}
