import { useEffect, useState } from 'react'
import { ArcaptchaWidget } from 'arcaptcha-react'

export type CaptchaContext = 'login' | 'signup' | 'password_reset' | 'contact' | 'live_chat'
type CaptchaConfig = { enabled: boolean; siteKey: string | null; contexts: Record<CaptchaContext, boolean> }

let configPromise: Promise<CaptchaConfig> | null = null
export function fetchCaptchaConfig(): Promise<CaptchaConfig> {
  configPromise ??= fetch('/api/captcha/config', { credentials: 'include', cache: 'no-store' })
    .then(async (response) => {
      if (!response.ok) throw new Error(`captcha_config_${response.status}`)
      return response.json() as Promise<CaptchaConfig>
    })
    .catch((error) => {
      configPromise = null
      throw error
    })
  return configPromise
}

export function ArcaptchaField({ context, onToken, resetKey = 0 }: { context: CaptchaContext; onToken: (token: string) => void; resetKey?: number }) {
  const [config, setConfig] = useState<CaptchaConfig | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => { void fetchCaptchaConfig().then(setConfig).catch(() => setFailed(true)) }, [])
  useEffect(() => { onToken('') }, [resetKey, onToken])
  if (failed) return <div className="rounded-2xl border border-red-100 bg-red-50 p-3 text-xs font-semibold text-red-700">بارگذاری سامانه امنیتی ناموفق بود؛ اتصال اینترنت را بررسی و صفحه را تازه‌سازی کنید.</div>
  if (!config) return <div className="h-16 animate-pulse rounded-2xl bg-slate-100" />
  if (!config.enabled || !config.contexts[context] || !config.siteKey) return null
  return <div className="overflow-hidden rounded-2xl border border-sky-100 bg-sky-50/50 p-3">
    <p className="mb-2 text-xs font-bold text-slate-600">تأیید امنیتی</p>
    <ArcaptchaWidget
      key={`${context}-${resetKey}`}
      site-key={config.siteKey}
      callback={(token?: string) => onToken(token ?? '')}
      expired_callback={() => onToken('')}
      error_callback={() => onToken('')}
      script_loading_failed_callback={() => setFailed(true)}
      lang="fa"
      theme="light"
    />
  </div>
}

export function captchaErrorMessage(error: string): string {
  if (error === 'captcha_required') return 'لطفاً ابتدا کپچای امنیتی را تکمیل کنید.'
  if (error === 'captcha_invalid') return 'اعتبار کپچا پایان یافته یا نامعتبر است؛ دوباره تلاش کنید.'
  if (error === 'captcha_unavailable') return 'سرویس کپچا موقتاً در دسترس نیست؛ کمی بعد دوباره تلاش کنید.'
  if (error === 'captcha_not_configured') return 'کپچا فعال است اما کلیدهای آن در پنل مدیریت کامل نشده‌اند.'
  return error
}
