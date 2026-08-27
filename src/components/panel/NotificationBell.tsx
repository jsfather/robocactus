import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  fetchMySystemNotifications,
  markSystemNotificationRead,
  type SystemNotification,
} from '@/features/notifications/api'
import type { UserRole } from '@/types/database'

export function NotificationBell({ role }: { role: UserRole }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [notes, setNotes] = useState<SystemNotification[]>([])
  const [readIds, setReadIds] = useState<Set<string>>(new Set())
  const ref = useRef<HTMLDivElement>(null)
  const isSa = role === 'super_admin'

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  useEffect(() => {
    void fetchMySystemNotifications()
      .then(setNotes)
      .catch(() => setNotes([]))
  }, [])

  const unreadNotes = notes.filter((n) => !readIds.has(n.id)).slice(0, 5)
  const badge = unreadNotes.length

  const onOpenNote = (note: SystemNotification) => {
    setReadIds((prev) => new Set(prev).add(note.id))
    void markSystemNotificationRead(note.id).catch(() => undefined)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="panel-header-action relative rounded-xl border border-slate-200 bg-white p-2.5 text-slate-700 hover:bg-slate-50 hover:text-sky-800"
        aria-label={t('panel.notifications')}
      >
        <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden>
          <path
            d="M6 9a6 6 0 0 1 12 0c0 7 3 7 3 7H3s3 0 3-7Zm6 11a2 2 0 0 0 2-2h-4a2 2 0 0 0 2 2Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
        {badge > 0 ? (
          <span className="absolute -top-1 -end-1 inline-flex min-w-4 justify-center rounded-full bg-rc-accent px-1 font-mono text-[9px] text-white">
            {badge > 99 ? '99+' : badge}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="absolute end-0 top-full z-50 mt-2 w-80 border border-rc-line bg-rc-navy p-3 shadow-xl">
          <p className="font-mono text-[10px] tracking-[0.2em] text-rc-blue uppercase">
            {t('panel.notifications')}
          </p>

          {unreadNotes.length > 0 ? (
            <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto">
              {unreadNotes.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => onOpenNote(n)}
                    className="w-full rounded-md border border-rc-line/80 bg-rc-surface/40 px-2.5 py-2 text-start hover:bg-rc-hover"
                  >
                    <p className="text-sm font-medium text-rc-text">{n.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-rc-muted">{n.body}</p>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-rc-muted">{t('panel.noSystemNotifications')}</p>
          )}

          {isSa ? (
            <div className="mt-3">
              <Link
                to="/super-admin/kavenegar"
                onClick={() => setOpen(false)}
                className="block rounded-md border border-rc-line px-2.5 py-2 text-sm hover:bg-rc-hover"
              >
                مرکز پیامک کاوه‌نگار
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
