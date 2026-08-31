import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/hooks/useAuth'
import type { UserRole } from '@/types/database'

function initials(name: string | null | undefined, email: string | null | undefined): string {
  const n = (name || email || '?').trim()
  const parts = n.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase()
  return n.slice(0, 2).toUpperCase()
}

export function UserMenu({ role }: { role: UserRole }) {
  const { t, i18n } = useTranslation()
  const { profile, user, signOut } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const name = profile?.full_name ?? user?.email ?? '—'

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="panel-header-action flex items-center gap-2 rounded-xl border border-slate-200 bg-white py-1.5 pe-3 ps-1.5 font-semibold text-slate-800 hover:bg-slate-50"
      >
        <span className="flex size-8 items-center justify-center overflow-hidden rounded-lg border border-sky-200 bg-sky-50 font-mono text-[11px] font-black text-sky-800">
          {profile?.avatar_url ? <img src={profile.avatar_url} alt="" className="size-full object-cover" /> : initials(profile?.full_name, user?.email)}
        </span>
        <span className="hidden max-w-28 truncate text-xs sm:inline">{name}</span>
      </button>
      {open ? (
        <div className="absolute end-0 top-full z-50 mt-2 w-64 border border-rc-line bg-rc-navy p-3 shadow-xl">
          <p className="truncate text-sm font-medium">{name}</p>
          <p className="mt-0.5 font-mono text-[10px] text-rc-blue">{t(`dashboard.roles.${role}`)}</p>
          <div className="mt-3 space-y-2 border-t border-rc-line pt-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-rc-muted">{t('common.theme')}</span>
            </div>
            <button
              type="button"
              onClick={() => void i18n.changeLanguage(i18n.language.startsWith('fa') ? 'en' : 'fa')}
              className="flex w-full items-center justify-between rounded-md border border-rc-line px-2.5 py-2 text-sm hover:bg-rc-hover"
            >
              <span>{t('common.language')}</span>
              <span className="font-mono text-xs text-rc-blue">
                {i18n.language.startsWith('fa') ? 'EN' : 'FA'}
              </span>
            </button>
            <Link
              to="/"
              onClick={() => setOpen(false)}
              className="block rounded-md border border-rc-line px-2.5 py-2 text-sm hover:bg-rc-hover"
            >
              {t('panel.site')}
            </Link>
            {role === 'super_admin' ? (
              <Link
                to="/super-admin/settings"
                onClick={() => setOpen(false)}
                className="block rounded-md border border-rc-line px-2.5 py-2 text-sm hover:bg-rc-hover"
              >
                {t('settings.title')}
              </Link>
            ) : null}
            <button
              type="button"
              onClick={() => void (async () => {
                setOpen(false)
                const revokeSession = signOut()
                navigate('/login', { replace: true, state: null })
                await revokeSession
              })()}
              className="w-full rounded-md bg-rc-surface px-2.5 py-2 text-start text-sm text-rc-muted hover:bg-rc-hover hover:text-rc-text"
            >
              {t('nav.logout')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
