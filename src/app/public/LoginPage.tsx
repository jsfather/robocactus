import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { OtpCodeInput } from '@/components/auth/OtpCodeInput'
import { PasswordField } from '@/components/auth/PasswordField'
import { Button, FieldError, Input } from '@/components/ui/FormControls'
import { useToast } from '@/components/ui/Toast'
import { ArcaptchaField, captchaErrorMessage } from '@/features/captcha/ArcaptchaField'
import { useAuth } from '@/hooks/useAuth'
import { useSiteSettings } from '@/hooks/useSiteSettings'
import { backend, type BackendAuthOptions } from '@/lib/backend/client'

type Mode = 'email' | 'phone'
type EmailSubMode = 'password' | 'magic'
type OtpState = 'idle' | 'verifying' | 'success' | 'error'

export function LoginPage() {
  const { t, i18n } = useTranslation()
  const toast = useToast()
  const { settings } = useSiteSettings()
  const { signIn, requestPhoneOtp, verifyPhoneOtp, requestEmailMagicLink, user, configured } = useAuth()
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
  const [resendSeconds, setResendSeconds] = useState(0)
  const [otpState, setOtpState] = useState<OtpState>('idle')
  const [challengeId, setChallengeId] = useState('')
  const [otpRemainingSeconds, setOtpRemainingSeconds] = useState(0)
  const verifyInFlight = useRef(false)

  useEffect(() => {
    void backend.auth.getOptions().then(({ data }) => {
      if (!data) return
      setOptions(data)
      if (!data.otp_login_enabled) setMode('email')
      if (!data.password_login_enabled && data.email_magic_login_enabled) setEmailSubMode('magic')
    })
  }, [])

  useEffect(() => {
    if (resendSeconds <= 0) return
    const timer = window.setTimeout(() => setResendSeconds(resendSeconds - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [resendSeconds])

  useEffect(() => {
    if (!otpSent || otpRemainingSeconds <= 0) return
    const timer = window.setTimeout(() => setOtpRemainingSeconds((value) => Math.max(0, value - 1)), 1000)
    return () => window.clearTimeout(timer)
  }, [otpSent, otpRemainingSeconds])

  if (user) return <Navigate to={from.startsWith('/') ? from : '/dashboard'} replace />

  const mapOtpError = (value: string | null) => {
    if (!value) return t('common.error')
    if (value === 'backend_missing') return t('auth.backendMissing')
    if (value === 'invalid_phone') return t('auth.invalidPhone')
    if (value === 'invalid_code') return t('auth.invalidOtp')
    if (value === 'expired') return t('auth.otpExpired')
    if (value === 'already_used') return t('auth.otpUsed')
    if (value === 'invalid_session' || value === 'no_challenge') return t('auth.otpInvalidSession')
    if (value === 'cooldown') return t('auth.otpCooldown')
    if (value === 'too_many_attempts') return t('auth.otpTooMany')
    if (value === 'phone_signup_disabled') return t('auth.phoneSignupDisabled')
    if (value === 'server_error' || value.startsWith('http_')) return t('auth.otpServerError')
    if (value.startsWith('captcha_')) return captchaErrorMessage(value)
    return value
  }
  const showError = (message: string) => { setError(message); toast.error(message) }

  const onEmailSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!email.trim() || (emailSubMode === 'password' && !password)) return showError('لطفاً همه فیلدهای ضروری را تکمیل کنید.')
    setError(null); setSubmitting(true)
    if (emailSubMode === 'magic') {
      const result = await requestEmailMagicLink(email.trim(), captchaToken)
      setSubmitting(false); setCaptchaToken(''); setCaptchaReset((value) => value + 1)
      if (result.error) return showError(result.error === 'backend_missing' ? t('auth.backendMissing') : captchaErrorMessage(result.error))
      setMagicSent(true); toast.success('لینک ورود به ایمیل شما ارسال شد.'); return
    }
    const result = await signIn(email.trim(), password, captchaToken)
    setSubmitting(false); setCaptchaToken(''); setCaptchaReset((value) => value + 1)
    if (result.error) return showError(result.error === 'backend_missing' ? t('auth.backendMissing') : result.error.startsWith('captcha_') ? captchaErrorMessage(result.error) : t('auth.invalidCredentials'))
    toast.success('ورود با موفقیت انجام شد.'); void navigate(from, { replace: true })
  }

  const requestOtp = async (captcha = '') => {
    setError(null); setSubmitting(true)
    const result = await requestPhoneOtp(phone.trim(), 'login', captcha)
    setSubmitting(false)
    if (result.error) { showError(mapOtpError(result.error)); return false }
    setOtpSent(true); setChallengeId(result.challengeId ?? ''); setOtpRemainingSeconds(result.expiresInSec ?? 300); setResendSeconds(result.resendAfterSec ?? 60); setDevCode(result.devCode ?? null)
    toast.success('کد شش‌رقمی برای شما ارسال شد.'); return true
  }
  const onRequestOtp = async (event: FormEvent) => {
    event.preventDefault()
    if (!/^09\d{9}$/.test(phone.trim())) return showError(t('auth.invalidPhone'))
    await requestOtp(captchaToken)
    setCaptchaToken(''); setCaptchaReset((value) => value + 1)
  }
  const verifyOtp = async (completeCode = code) => {
    if (completeCode.length !== 6 || submitting || verifyInFlight.current || otpState === 'success') return
    if (!challengeId) return showError(t('auth.otpInvalidSession'))
    verifyInFlight.current = true
    setError(null); setSubmitting(true); setOtpState('verifying')
    const result = await verifyPhoneOtp({ phone: phone.trim(), code: completeCode, challengeId })
    setSubmitting(false)
    verifyInFlight.current = false
    if (result.error) {
      setOtpState('error'); showError(mapOtpError(result.error))
      if (['expired', 'already_used', 'invalid_session', 'too_many_attempts'].includes(result.error)) setResendSeconds(0)
      if (result.error === 'expired') setOtpRemainingSeconds(0)
      window.setTimeout(() => setOtpState('idle'), 700); return
    }
    setOtpState('success')
    toast.success(result.registrationRequired ? t('auth.otpNewUser') : t('auth.otpExistingUser'))
    const destination = result.registrationRequired ? (result.nextPath || '/signup?onboarding=phone') : from
    window.setTimeout(() => void navigate(destination, { replace: true }), 5000)
  }
  const onResend = async () => {
    if (resendSeconds || submitting) return
    setCode(''); setOtpState('idle'); await requestOtp('')
  }
  const resetPhone = () => { setOtpSent(false); setCode(''); setChallengeId(''); setDevCode(null); setResendSeconds(0); setOtpRemainingSeconds(0); setOtpState('idle'); setError(null) }
  const isEn = i18n.language.startsWith('en')
  const welcomeTitle = (isEn ? settings?.login_welcome_title_en : settings?.login_welcome_title_fa) || (isEn ? 'Welcome to Tabarestan Cup' : 'به جام تبرستان خوش آمدید')
  const welcomeText = (isEn ? settings?.login_welcome_text_en : settings?.login_welcome_text_fa) || (isEn ? 'Sign in to continue to your account.' : 'برای ادامه وارد حساب کاربری خود شوید.')

  const logoUrl = settings?.login_logo_url || settings?.logo_url

  return (
    <div className="auth-stage relative isolate min-h-[calc(100svh-7rem)] overflow-hidden bg-[#f6f8fa] px-4 py-8 sm:px-6 sm:py-12">
      <div className="pointer-events-none absolute inset-0 -z-10 opacity-70" aria-hidden>
        <span className="absolute -start-24 top-10 size-72 rounded-full bg-sky-100/70 blur-3xl" />
        <span className="absolute -end-20 bottom-0 size-80 rounded-full bg-emerald-100/60 blur-3xl" />
      </div>
      <div className="mx-auto flex min-h-[calc(100svh-13rem)] max-w-5xl items-center">
        <section className="grid w-full overflow-hidden rounded-[1.75rem] border border-slate-200/80 bg-white shadow-[0_24px_70px_rgb(15_45_61/0.12)] lg:grid-cols-[minmax(0,1.08fr)_minmax(300px,.72fr)]">
          <main className="order-2 px-5 py-7 sm:px-10 sm:py-10 lg:order-1 lg:px-14 lg:py-12">
            <div className="mb-8 flex items-center justify-between gap-4">
              <Link to="/" className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 transition hover:text-rc-blue">
                <span className="grid size-9 place-items-center rounded-full border border-slate-200 bg-white" aria-hidden>←</span>
                <span>{isEn ? 'Back to home' : 'بازگشت به صفحه اصلی'}</span>
              </Link>
              {logoUrl ? <img src={logoUrl} alt={isEn ? 'Tabarestan Cup' : 'جام تبرستان'} className="h-10 w-auto max-w-32 object-contain lg:hidden" /> : null}
            </div>

            <div className="mb-7">
              <p className="mb-2 text-xs font-black uppercase tracking-[.14em] text-emerald-700">Tabarestan Cup</p>
              <h1 className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">{t('auth.loginTitle')}</h1>
              <p className="mt-2 text-sm leading-7 text-slate-500">{isEn ? 'Enter your details to access your account.' : 'برای دسترسی به حساب کاربری، اطلاعات ورود خود را وارد کنید.'}</p>
            </div>

          {!configured ? <FieldError message={t('auth.backendMissing')} /> : null}
          <div className="mb-6 grid grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1" role="tablist" aria-label={isEn ? 'Login method' : 'روش ورود'}>
            {options?.otp_login_enabled !== false ? <button type="button" role="tab" aria-selected={mode === 'phone'} className={`min-h-11 rounded-lg px-3 text-sm font-black transition ${mode === 'phone' ? 'bg-white text-rc-blue shadow-sm ring-1 ring-slate-200/70' : 'text-slate-500 hover:text-slate-800'}`} onClick={() => { setMode('phone'); setError(null) }}>{t('auth.loginWithSms')}</button> : <span />}
            {options?.password_login_enabled !== false || options?.email_magic_login_enabled !== false ? <button type="button" role="tab" aria-selected={mode === 'email'} className={`min-h-11 rounded-lg px-3 text-sm font-black transition ${mode === 'email' ? 'bg-white text-rc-blue shadow-sm ring-1 ring-slate-200/70' : 'text-slate-500 hover:text-slate-800'}`} onClick={() => { setMode('email'); setError(null) }}>{t('auth.loginWithEmail')}</button> : null}
          </div>
          {mode === 'email' ? (
            <form noValidate className="space-y-4" onSubmit={(event) => void onEmailSubmit(event)}>
              <div className="flex gap-5 border-b border-slate-100 text-xs font-bold">
                {options?.password_login_enabled !== false ? <button type="button" className={`border-b-2 pb-3 transition ${emailSubMode === 'password' ? 'border-rc-blue text-rc-blue' : 'border-transparent text-slate-400 hover:text-slate-700'}`} onClick={() => { setEmailSubMode('password'); setMagicSent(false) }}>{t('auth.loginWithPassword')}</button> : null}
                {options?.email_magic_login_enabled !== false ? <button type="button" className={`border-b-2 pb-3 transition ${emailSubMode === 'magic' ? 'border-rc-blue text-rc-blue' : 'border-transparent text-slate-400 hover:text-slate-700'}`} onClick={() => { setEmailSubMode('magic'); setMagicSent(false) }}>{t('auth.loginWithMagicLink')}</button> : null}
              </div>
              <Input label={emailSubMode === 'password' ? (isEn ? 'Username, email or mobile' : 'نام کاربری، ایمیل یا شماره موبایل') : t('auth.email')} type={emailSubMode === 'magic' ? 'email' : 'text'} autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} dir="ltr" className="rounded-lg" />
              {emailSubMode === 'password' ? <div className="space-y-2"><PasswordField label={t('auth.password')} value={password} onChange={setPassword} autoComplete="current-password" showStrength={false} /><div className="text-end"><Link to="/forgot-password" className="inline-flex text-xs font-black text-rc-blue hover:underline">{isEn ? 'Forgot your password?' : 'رمز عبور را فراموش کرده‌اید؟'}</Link></div></div> : null}
              {magicSent ? <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{t('auth.magicLinkSent')}</p> : null}
              <ArcaptchaField context="login" onToken={setCaptchaToken} resetKey={captchaReset} />
              <FieldError message={error ?? undefined} />
              <Button type="submit" className="w-full rounded-lg bg-rc-blue shadow-none hover:bg-sky-700" disabled={submitting}>{submitting ? t('app.loading') : emailSubMode === 'magic' ? t('auth.sendMagicLink') : t('auth.loginCta')}</Button>
            </form>
          ) : (
            <form noValidate className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (otpSent) void verifyOtp(); else void onRequestOtp(event) }}>
              <Input label={t('auth.phone')} value={phone} onChange={(event) => setPhone(event.target.value)} dir="ltr" inputMode="tel" placeholder="09xxxxxxxxx" disabled={otpSent} />
              {otpSent ? <div className="space-y-3"><div className="flex items-center justify-between"><p className="text-sm font-black text-slate-700">{t('auth.otpCode')}</p><span className={`rounded-full px-3 py-1 text-xs font-bold ${otpRemainingSeconds > 0 ? 'bg-sky-50 text-sky-700' : 'bg-rose-50 text-rose-700'}`}>{otpRemainingSeconds > 0 ? `${t('auth.otpValidity')} ${String(Math.floor(otpRemainingSeconds / 60)).padStart(2, '0')}:${String(otpRemainingSeconds % 60).padStart(2, '0')}` : t('auth.otpExpired')}</span></div><OtpCodeInput value={code} onChange={(value) => { setCode(value); setError(null) }} onComplete={(value) => void verifyOtp(value)} state={otpState} disabled={submitting || otpState === 'success'} /></div> : null}
              {devCode ? <p className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 font-mono text-xs text-sky-700">{t('auth.devOtp', { code: devCode })}</p> : null}
              {!otpSent ? <ArcaptchaField context="login" onToken={setCaptchaToken} resetKey={captchaReset} /> : null}
              <FieldError message={error ?? undefined} />
              <Button type="submit" className="w-full rounded-lg bg-rc-blue shadow-none hover:bg-sky-700" disabled={submitting || (otpSent && code.length !== 6)}>{submitting ? t('app.loading') : otpSent ? t('auth.verifyOtp') : t('auth.sendOtp')}</Button>
              {otpSent ? <div className="flex items-center justify-between gap-3 text-sm"><button type="button" className="font-bold text-slate-500 hover:text-rc-blue" onClick={resetPhone}>{t('auth.changePhone')}</button><button type="button" disabled={resendSeconds > 0 || submitting} className="font-black text-rc-blue disabled:cursor-not-allowed disabled:text-slate-400" onClick={() => void onResend()}>{resendSeconds > 0 ? t('auth.otpResendAfterExpiry') : t('auth.otpResend')}</button></div> : null}
            </form>
          )}
            {options?.show_registration_link !== false && (options?.email_signup_enabled !== false || options?.phone_signup_enabled !== false) ? <div className="mt-7 border-t border-slate-100 pt-5 text-center text-sm text-slate-500"><span>{t('auth.noAccount')} </span><Link to="/signup" className="font-black text-rc-blue hover:underline">{t('nav.signup')}</Link></div> : null}
            <p className="mt-4 text-center text-xs leading-6 text-slate-400">{isEn ? 'By signing in, you accept the ' : 'با ورود به سایت، '}<Link to="/terms" className="font-bold text-sky-700 hover:underline">{t('nav.terms')}</Link>{isEn ? '.' : ' را می‌پذیرید.'} <Link to="/registration-guide" className="ms-2 font-bold text-emerald-700 hover:underline">{t('nav.registrationGuide')}</Link></p>
          </main>

          <aside className="relative order-1 hidden min-h-[640px] overflow-hidden bg-[#07577b] p-10 text-white lg:flex lg:flex-col lg:justify-between" style={settings?.login_cover_url ? { backgroundImage: `linear-gradient(150deg, rgb(5 65 92 / .92), rgb(4 112 104 / .86)), url(${settings.login_cover_url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
            <div className="pointer-events-none absolute inset-0 opacity-20" aria-hidden style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} />
            <span className="absolute -end-28 -top-24 size-72 rounded-full border-[42px] border-white/10" aria-hidden />
            <div className="relative">
              {logoUrl ? <div className="inline-flex rounded-2xl bg-white p-4 shadow-lg"><img src={logoUrl} alt={isEn ? 'Tabarestan Cup' : 'جام تبرستان'} className="h-16 w-auto max-w-44 object-contain" /></div> : <span className="grid size-16 place-items-center rounded-2xl bg-white text-3xl font-black text-rc-blue">ت</span>}
            </div>
            <div className="relative max-w-sm">
              <span className="mb-5 block h-1 w-12 rounded-full bg-emerald-400" />
              <h2 className="text-3xl font-black leading-[1.55]">{welcomeTitle}</h2>
              <p className="mt-4 text-sm leading-8 text-white/80">{welcomeText}</p>
              <div className="mt-8 flex items-center gap-3 text-xs font-bold text-white/70"><span className="h-px w-8 bg-white/40" /><span>{isEn ? 'National robotics competitions' : 'مسابقات ملی رباتیک و فناوری'}</span></div>
            </div>
          </aside>
        </section>
      </div>
    </div>
  )
}
