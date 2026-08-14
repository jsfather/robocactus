import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getPublicEnv } from '@/lib/env'
import { isSupabaseConfigured } from '@/lib/supabase'

type Status = 'checking' | 'ok' | 'missing' | 'unreachable'

/**
 * Surfaces backend connectivity failures (DNS / network / deleted project)
 * instead of silent empty pages and opaque "Failed to fetch" errors.
 */
export function SupabaseStatusBanner() {
  const { t } = useTranslation()
  const [status, setStatus] = useState<Status>(() =>
    isSupabaseConfigured() ? 'checking' : 'missing',
  )
  const [host, setHost] = useState('')

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setStatus('missing')
      return
    }

    const base = getPublicEnv('VITE_SUPABASE_URL')?.trim() ?? ''
    let hostname = base
    try {
      hostname = new URL(base).host
    } catch {
      /* keep raw */
    }
    setHost(hostname)

    const key = getPublicEnv('VITE_SUPABASE_ANON_KEY')?.trim() ?? ''
    const ctrl = new AbortController()
    const timer = window.setTimeout(() => ctrl.abort(), 8000)

    void fetch(`${base.replace(/\/$/, '')}/rest/v1/`, {
      method: 'HEAD',
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: ctrl.signal,
    })
      .then((res) => {
        // Any HTTP response means DNS/TLS/network reached the project.
        setStatus(res.status > 0 ? 'ok' : 'unreachable')
      })
      .catch(() => setStatus('unreachable'))
      .finally(() => window.clearTimeout(timer))

    return () => {
      ctrl.abort()
      window.clearTimeout(timer)
    }
  }, [])

  if (status === 'checking' || status === 'ok') return null

  return (
    <div
      role="alert"
      className="border-b border-amber-500/40 bg-amber-500/15 px-4 py-2.5 text-center text-sm text-amber-100"
    >
      <p className="font-medium">
        {status === 'missing' ? t('app.supabaseMissing') : t('app.supabaseUnreachable')}
      </p>
      {status === 'unreachable' && host ? (
        <p className="mt-1 font-mono text-xs text-amber-100/70" dir="ltr">
          {host}
        </p>
      ) : null}
      <p className="mt-1 text-xs text-amber-100/80">{t('app.supabaseFixHint')}</p>
    </div>
  )
}
