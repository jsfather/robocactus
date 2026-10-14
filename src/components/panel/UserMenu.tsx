import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/hooks/useAuth'
import type { UserRole } from '@/types/database'
import { ProfileAvatar } from '@/components/panel/ProfileAvatar'
import { backend } from '@/lib/backend'
import { useToast } from '@/components/ui/Toast'

export function UserMenu({ role }: { role: UserRole }) {
  const { t, i18n } = useTranslation()
  const { profile, user, signOut } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [revoking, setRevoking] = useState(false)
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
  const isEn = i18n.language.startsWith('en')
  const revokeOthers = async () => {
    if (revoking) return
    setRevoking(true)
    try {
      const { error } = await backend.auth.revokeOtherSessions()
      if (error) throw new Error(error.message)
      toast.success(isEn ? 'Other sessions signed out. This session remains active.' : 'سایر نشست‌های حساب شما خارج شدند. نشست فعلی فعال است.')
    } catch {
      toast.error(isEn ? 'Could not sign out other sessions. Please try again.' : 'خروج سایر نشست‌ها انجام نشد. دوباره تلاش کنید.')
    } finally {
      setRevoking(false)
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-expanded={open}
        aria-label={isEn ? 'Account menu' : 'منوی حساب کاربری'}
        onClick={() => setOpen((v) => !v)}
        className="panel-header-action flex items-center gap-2 rounded-xl border border-slate-200 bg-white py-1.5 pe-3 ps-1.5 font-semibold text-slate-800 hover:bg-slate-50"
      >
        <span className="flex size-8 items-center justify-center overflow-hidden rounded-lg border border-sky-200 bg-sky-50 font-mono text-[11px] font-black text-sky-800">
          <ProfileAvatar src={profile?.avatar_url} name={profile?.full_name} fallback={user?.email} />
        </span>
        <span className="hidden max-w-28 truncate text-xs sm:inline">{name}</span>
      </button>
      {open ? (
        <div className="absolute end-0 top-full z-50 mt-2 w-64 max-w-[calc(100vw-2rem)] border border-rc-line bg-rc-navy p-3 shadow-xl">
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
            {role === 'super_admin' || role === 'league_admin' ? <button
              type="button"
              disabled={revoking}
              onClick={() => void revokeOthers()}
              className="flex min-h-11 w-full items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-start text-amber-950 hover:bg-amber-100 disabled:cursor-wait disabled:opacity-60"
            >
              <svg viewBox="0 0 24 24" className="mt-0.5 size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="3" width="18" height="12" rx="2" /><path d="M8 21h8m-4-6v6m-4-9 8-6m-8 0 8 6" /></svg>
              <span><span className="block text-sm font-bold">{revoking ? (isEn ? 'Signing out…' : 'در حال خروج…') : (isEn ? 'Sign out other sessions' : 'خروج سایر نشست‌ها')}</span><span className="mt-1 block text-xs leading-5">{isEn ? 'Keep this session active' : 'نشست فعلی فعال می‌ماند'}</span></span>
            </button> : null}
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
