import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, Input } from '@/components/ui/FormControls'
import { useAuth } from '@/hooks/useAuth'
import { backend, type BackendAuthOptions } from '@/lib/backend/client'

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
    return err
  }

  const onEmailSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setSubmitting(true)

    if (emailSubMode === 'magic') {
      const result = await requestEmailMagicLink(email.trim())
      setSubmitting(false)
      if (result.error === 'backend_missing') {
        setError(t('auth.backendMissing'))
        return
      }
      if (result.error) {
        setError(result.error)
        return
      }
      setMagicSent(true)
      return
    }

    const result = await signIn(email.trim(), password)
    setSubmitting(false)

    if (result.error === 'backend_missing') {
      setError(t('auth.backendMissing'))
      return
    }
    if (result.error) {
      setError(t('auth.invalidCredentials'))
      return
    }
    void navigate(from, { replace: true })
  }

  const onRequestOtp = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    const result = await requestPhoneOtp(phone.trim())
    setSubmitting(false)
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
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-12">
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 shadow-[0_0_40px_rgba(59,130,246,0.08)]">
        <h1 className="mb-1 text-2xl font-semibold">{t('auth.loginTitle')}</h1>
        <p className="mb-6 font-mono text-xs text-rc-muted">{t('app.tagline')}</p>

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
              <Input
                label={t('auth.password')}
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                dir="ltr"
              />
            ) : null}
            {magicSent ? (
              <p className="rounded-md border border-rc-blue/30 bg-rc-blue/10 px-3 py-2 text-sm text-rc-blue">
                {t('auth.magicLinkSent')}
              </p>
            ) : null}
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
  )
}
