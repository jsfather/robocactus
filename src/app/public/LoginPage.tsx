import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, Input } from '@/components/ui/FormControls'
import { useAuth } from '@/hooks/useAuth'
import { backend, type BackendAuthOptions } from '@/lib/backend/client'
import { ArcaptchaField, captchaErrorMessage } from '@/features/captcha/ArcaptchaField'

type Mode = 'email' | 'phone'
type EmailSubMode = 'password' | 'magic'

export function LoginPage() {
  const { t } = useTranslation()
  const { signIn, requestPhoneOtp, verifyPhoneOtp, requestEmailMagicLink, user, configured } =
    useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard'

  const [mode, setMode] = useState<Mode>('phone')
  const [emailSubMode, setEmailSubMode] = useState<EmailSubMode>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [magicSent, setMagicSent] = useState(false)
  const [devCode, setDevCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [options, setOptions] = useState<BackendAuthOptions | null>(null)
  const [captchaToken, setCaptchaToken] = useState('')
  const [captchaReset, setCaptchaReset] = useState(0)

  useEffect(() => {
    void backend.auth.getOptions().then(({ data }) => {
      if (!data) return
      setOptions(data)
      if (!data.otp_login_enabled) setMode('email')
      if (!data.password_login_enabled && data.email_magic_login_enabled) setEmailSubMode('magic')
    })
  }, [])

  if (user) {
    return <Navigate to={from.startsWith('/') ? from : '/dashboard'} replace />
  }

  const mapOtpError = (err: string | null) => {
    if (!err) return null
    if (err === 'backend_missing') return t('auth.backendMissing')
    if (err === 'invalid_phone') return t('auth.invalidPhone')
    if (err === 'invalid_code' || err === 'no_challenge') return t('auth.invalidOtp')
    if (err === 'expired') return t('auth.otpExpired')
    if (err === 'cooldown') return t('auth.otpCooldown')
    if (err === 'too_many_attempts') return t('auth.otpTooMany')
    if (err.startsWith('captcha_')) return captchaErrorMessage(err)
    return err
  }

  const onEmailSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setSubmitting(true)

    if (emailSubMode === 'magic') {
      const result = await requestEmailMagicLink(email.trim(), captchaToken)
      setSubmitting(false)
      setCaptchaToken('')
      setCaptchaReset((value) => value + 1)
      if (result.error === 'backend_missing') {
        setError(t('auth.backendMissing'))
        return
      }
      if (result.error) {
        setError(captchaErrorMessage(result.error))
        return
      }
      setMagicSent(true)
      return
    }

    const result = await signIn(email.trim(), password, captchaToken)
    setSubmitting(false)
    setCaptchaToken('')
    setCaptchaReset((value) => value + 1)

    if (result.error === 'backend_missing') {
      setError(t('auth.backendMissing'))
      return
    }
    if (result.error) {
      setError(result.error.startsWith('captcha_') ? captchaErrorMessage(result.error) : t('auth.invalidCredentials'))
      return
    }
    void navigate(from, { replace: true })
  }

  const onRequestOtp = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    const result = await requestPhoneOtp(phone.trim(), 'login', captchaToken)
    setSubmitting(false)
    setCaptchaToken('')
    setCaptchaReset((value) => value + 1)
    if (result.error) {
      setError(mapOtpError(result.error))
      return
    }
    setOtpSent(true)
    setDevCode(result.devCode ?? null)
  }

  const onVerifyOtp = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    const result = await verifyPhoneOtp({ phone: phone.trim(), code: code.trim() })
    setSubmitting(false)
    if (result.error) {
      setError(mapOtpError(result.error))
      return
    }
    void navigate(from, { replace: true })
  }

  return (
    <div className="auth-stage mx-auto flex min-h-[72vh] max-w-6xl items-center px-4 py-12">
      <div className="grid w-full overflow-hidden rounded-[2rem] border border-white/70 bg-white shadow-[0_30px_90px_rgb(18_76_98/0.16)] md:grid-cols-[0.9fr_1.1fr]">
        <div className="hidden bg-gradient-to-br from-[#0b4964] via-[#087eb8] to-[#0b9b65] p-10 text-white md:flex md:flex-col md:justify-between">
          <span className="flex size-16 items-center justify-center rounded-2xl bg-white/15 text-3xl font-black backdrop-blur">ت</span>
          <div>
            <p className="text-4xl font-black leading-tight">مرکز مدیریت<br />جام تبرستان</p>
            <p className="mt-4 max-w-sm text-sm leading-8 text-white/75">ورود یکپارچه مدیران، کارشناسان، شرکت‌ها و اعضای تیم با دسترسی متناسب با نقش.</p>
          </div>
        </div>
        <div className="p-6 sm:p-10 lg:p-12">
        <p className="mb-2 text-sm font-bold text-emerald-600">Tabarestan Cup</p>
        <h1 className="mb-2 text-3xl font-black tracking-tight text-slate-900">{t('auth.loginTitle')}</h1>
        <p className="mb-7 text-sm leading-7 text-rc-muted">{t('app.tagline')}</p>

        {!configured ? (
          <p className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
            {t('auth.backendMissing')}
          </p>
        ) : null}

        <div className="mb-5 flex gap-2">
          {options?.otp_login_enabled !== false ? <Button
            type="button"
            variant={mode === 'phone' ? 'primary' : 'ghost'}
            className="flex-1"
            onClick={() => {
              setMode('phone')
              setError(null)
            }}
          >
            {t('auth.loginWithSms')}
          </Button> : null}
          {(options?.password_login_enabled !== false || options?.email_magic_login_enabled !== false) ? <Button
            type="button"
            variant={mode === 'email' ? 'primary' : 'ghost'}
            className="flex-1"
            onClick={() => {
              setMode('email')
              setError(null)
            }}
          >
            {t('auth.loginWithEmail')}
          </Button> : null}
        </div>

        {mode === 'email' ? (
          <form className="space-y-4" onSubmit={(e) => void onEmailSubmit(e)}>
            <div className="flex gap-2 text-xs">
              {options?.password_login_enabled !== false ? <button
                type="button"
                className={
                  emailSubMode === 'password' ? 'text-rc-blue' : 'text-rc-muted hover:text-rc-text'
                }
                onClick={() => {
                  setEmailSubMode('password')
                  setMagicSent(false)
                }}
              >
                {t('auth.loginWithPassword')}
              </button> : null}
              {options?.password_login_enabled !== false && options?.email_magic_login_enabled !== false ? <span className="text-rc-line">·</span> : null}
              {options?.email_magic_login_enabled !== false ? <button
                type="button"
                className={
                  emailSubMode === 'magic' ? 'text-rc-blue' : 'text-rc-muted hover:text-rc-text'
                }
                onClick={() => {
                  setEmailSubMode('magic')
                  setMagicSent(false)
                }}
              >
                {t('auth.loginWithMagicLink')}
              </button> : null}
            </div>
            <Input
              label={emailSubMode === 'password' ? 'نام کاربری، ایمیل یا شماره موبایل' : t('auth.email')}
              name="email"
              type={emailSubMode === 'magic' ? 'email' : 'text'}
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              dir="ltr"
            />
            {emailSubMode === 'password' ? (
              <div className="space-y-2"><Input
                label={t('auth.password')}
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                dir="ltr"
              /><Link to="/forgot-password" className="inline-flex text-xs font-bold text-rc-blue hover:underline">رمز عبور را فراموش کرده‌اید؟</Link></div>
            ) : null}
            {magicSent ? (
              <p className="rounded-md border border-rc-blue/30 bg-rc-blue/10 px-3 py-2 text-sm text-rc-blue">
                {t('auth.magicLinkSent')}
              </p>
            ) : null}
            <ArcaptchaField context="login" onToken={setCaptchaToken} resetKey={captchaReset} />
            {error ? <p className="text-sm text-red-400">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting
                ? t('app.loading')
                : emailSubMode === 'magic'
                  ? t('auth.sendMagicLink')
                  : t('auth.loginCta')}
            </Button>
          </form>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => void (otpSent ? onVerifyOtp(e) : onRequestOtp(e))}
          >
            <Input
              label={t('auth.phone')}
              name="phone"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              dir="ltr"
              placeholder="09xxxxxxxxx"
            />
            {otpSent ? (
              <Input
                label={t('auth.otpCode')}
                name="otp"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                dir="ltr"
                inputMode="numeric"
                autoComplete="one-time-code"
              />
            ) : null}
            {devCode ? (
              <p className="rounded-md border border-rc-blue/30 bg-rc-blue/10 px-3 py-2 font-mono text-xs text-rc-blue">
                {t('auth.devOtp', { code: devCode })}
              </p>
            ) : null}
            {!otpSent ? <ArcaptchaField context="login" onToken={setCaptchaToken} resetKey={captchaReset} /> : null}
            {error ? <p className="text-sm text-red-400">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting
                ? t('app.loading')
                : otpSent
                  ? t('auth.verifyOtp')
                  : t('auth.sendOtp')}
            </Button>
            {otpSent ? (
              <button
                type="button"
                className="w-full text-center text-sm text-rc-muted hover:text-rc-blue"
                onClick={() => {
                  setOtpSent(false)
                  setCode('')
                  setDevCode(null)
                }}
              >
                {t('auth.changePhone')}
              </button>
            ) : null}
          </form>
        )}

        {(options?.email_signup_enabled !== false || options?.phone_signup_enabled !== false) ? <p className="mt-6 text-center text-sm text-rc-muted">
          {t('auth.noAccount')}{' '}
          <Link to="/signup" className="text-rc-blue hover:underline">
            {t('nav.signup')}
          </Link>
        </p> : null}
        </div>
      </div>
    </div>
  )
}
