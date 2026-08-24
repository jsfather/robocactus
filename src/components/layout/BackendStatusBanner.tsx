import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getPublicEnv } from '@/lib/env'
import { isBackendConfigured } from '@/lib/backend'

type Status = 'checking' | 'ok' | 'missing' | 'unreachable'

/**
 * Surfaces backend connectivity failures (DNS / network / deleted project)
 * instead of silent empty pages and opaque "Failed to fetch" errors.
 */
export function BackendStatusBanner() {
  const { t } = useTranslation()
  const [status, setStatus] = useState<Status>(() =>
    isBackendConfigured() ? 'checking' : 'missing',
  )
  const [host, setHost] = useState('')

  useEffect(() => {
    if (!isBackendConfigured()) {
      setStatus('missing')
      return
    }

    const base = getPublicEnv('VITE_API_URL')?.trim() ?? ''
    let hostname = base
    try {
      hostname = new URL(base).host
    } catch {
      /* keep raw */
    }
    setHost(hostname)

    const ctrl = new AbortController()
    const timer = window.setTimeout(() => ctrl.abort(), 8000)

    void fetch(`${base.replace(/\/$/, '')}/api/health`, {
      method: 'HEAD',
      signal: ctrl.signal,
    })
      .then((res) => {
        setStatus(res.ok ? 'ok' : 'unreachable')
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
        {status === 'missing' ? t('app.backendMissing') : t('app.backendUnreachable')}
      </p>
      {status === 'unreachable' && host ? (
        <p className="mt-1 font-mono text-xs text-amber-100/70" dir="ltr">
          {host}
        </p>
      ) : null}
      <p className="mt-1 text-xs text-amber-100/80">{t('app.backendFixHint')}</p>
    </div>
  )
}
