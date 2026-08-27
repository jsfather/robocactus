import { NavLink, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/hooks/useAuth'
import type { ReactNode } from 'react'

type IconName = 'home' | 'league' | 'blog' | 'about' | 'account'

function NavIcon({ name, prominent = false }: { name: IconName; prominent?: boolean }) {
  const paths: Record<IconName, ReactNode> = {
    home: <><path d="m3.5 10.5 8.5-7 8.5 7" /><path d="M5.5 9v11h13V9M9.5 20v-6h5v6" /></>,
    league: <><path d="M8 4h8v4a4 4 0 0 1-8 0V4Z" /><path d="M8 6H4v1a4 4 0 0 0 4 4M16 6h4v1a4 4 0 0 1-4 4M12 12v4M8 20h8M9 16h6" /></>,
    blog: <><path d="M5 4h14v16H5z" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
    about: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" /></>,
    account: <><circle cx="12" cy="8" r="4" /><path d="M4.5 20a7.5 7.5 0 0 1 15 0" /></>,
  }
  return <svg viewBox="0 0 24 24" className={prominent ? 'size-7' : 'size-5'} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

export function MobileBottomNavigation() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { pathname } = useLocation()
  const items: Array<{ to: string; label: string; icon: IconName; end?: boolean }> = [
    { to: '/leagues', label: t('nav.leagues'), icon: 'league' },
    { to: '/blog', label: t('nav.blog'), icon: 'blog' },
    { to: '/', label: t('nav.home'), icon: 'home', end: true },
    { to: '/about', label: t('nav.about'), icon: 'about' },
    { to: user ? '/dashboard' : '/login', label: user ? t('nav.dashboardShort') : t('nav.login'), icon: 'account' },
  ]

  return (
    <nav className="fixed inset-x-0 bottom-0 z-[70] border-t border-sky-100/80 bg-white/92 pb-[env(safe-area-inset-bottom)] shadow-[0_-14px_40px_rgb(15_23_42/0.11)] backdrop-blur-xl md:hidden" aria-label={t('nav.mobileNavigation')}>
      <div className="mx-auto grid h-[5.25rem] max-w-lg grid-cols-5 items-stretch px-1.5">
        {items.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className={`group relative flex min-w-0 flex-col items-center justify-center px-1 text-[10px] font-bold outline-none transition-colors duration-300 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500 ${item.icon === 'home' ? 'z-10 gap-1' : 'gap-1.5 pt-1 text-slate-400'}`}>
            {({ isActive }) => {
              const accountActive = item.icon === 'account' && ['/login', '/signup', '/forgot-password', '/reset-password'].some((path) => pathname.startsWith(path))
              const active = isActive || accountActive
              if (item.icon === 'home') return <>
                <span className={`grid size-15 -translate-y-3 place-items-center rounded-full border-4 border-white bg-gradient-to-br from-sky-500 to-emerald-500 text-white shadow-[0_12px_30px_rgb(8_126_184/0.32)] transition-all duration-300 ${active ? 'scale-105 shadow-[0_14px_34px_rgb(8_126_184/0.42)]' : 'group-hover:-translate-y-4 group-active:scale-95'}`}><NavIcon name="home" prominent /></span>
                <span className={`-mt-2 max-w-full truncate font-black transition-colors ${active ? 'text-sky-800' : 'text-slate-600'}`}>{item.label}</span>
              </>
              return <>
                <span className={`grid size-9 place-items-center rounded-2xl transition-all duration-300 ease-out ${active ? '-translate-y-0.5 bg-sky-50 text-sky-700 shadow-sm' : 'text-slate-400 group-hover:bg-slate-50 group-hover:text-slate-600'}`}><NavIcon name={item.icon} /></span>
                <span className={`max-w-full truncate transition-all duration-300 ${active ? 'font-black text-sky-800' : ''}`}>{item.label}</span>
                <span className={`absolute bottom-1 h-1 rounded-full bg-gradient-to-r from-sky-500 to-emerald-500 transition-all duration-300 ${active ? 'w-5 opacity-100' : 'w-0 opacity-0'}`} />
              </>
            }}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
