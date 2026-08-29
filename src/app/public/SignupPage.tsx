import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { Button, Input, Textarea } from '@/components/ui/FormControls'
import { BirthDateField, latinDigits } from '@/components/ui/BirthDateField'
import { DocumentUploadField, validateIdentityImage } from '@/components/ui/DocumentUploadField'
import {
  clearSignupDraft,
  saveSignupDraft,
  useAuth,
} from '@/hooks/useAuth'
import { useToast } from '@/components/ui/Toast'
import { fetchRegistrationDocTypes, type RegistrationDocType } from '@/features/notifications/api'
import { uploadProfileDocument } from '@/features/content/api'
import { backend } from '@/lib/backend'
import type { AccountType } from '@/types/database'
import type { BackendAuthOptions } from '@/lib/backend'
import { ArcaptchaField, captchaErrorMessage } from '@/features/captcha/ArcaptchaField'
import { RegistrationStepper } from '@/components/auth/RegistrationStepper'
import { OtpCodeInput } from '@/components/auth/OtpCodeInput'
import { isStrongPassword, PasswordField } from '@/components/auth/PasswordField'

type Step = 'type' | 'channel' | 'identity' | 'verify' | 'docs' | 'review'
type AuthChannel = 'phone' | 'email'
type OtpState = 'idle' | 'verifying' | 'success' | 'error'

export function SignupPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const { requestPhoneOtp, verifyPhoneOtp, signUp, user, configured, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const phoneOnboardingRequested = params.get('onboarding') === 'phone'

  const [step, setStep] = useState<Step>(() =>
    params.get('resume') === 'docs' ? 'docs' : 'type',
  )
  const [accountType, setAccountType] = useState<AccountType>('individual')
  const [authChannel, setAuthChannel] = useState<AuthChannel>('phone')
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [firstNameFa, setFirstNameFa] = useState('')
  const [lastNameFa, setLastNameFa] = useState('')
  const [firstNameEn, setFirstNameEn] = useState('')
  const [lastNameEn, setLastNameEn] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [representativeNationalId, setRepresentativeNationalId] = useState('')
  const [nationalId, setNationalId] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [companyNationalId, setCompanyNationalId] = useState('')
  const [economicCode, setEconomicCode] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [code, setCode] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [devCode, setDevCode] = useState<string | null>(null)
  const [emailCheckInbox, setEmailCheckInbox] = useState(false)
  const [docTypes, setDocTypes] = useState<RegistrationDocType[]>([])
  const [uploads, setUploads] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [authOptions, setAuthOptions] = useState<BackendAuthOptions | null>(null)
  const [captchaToken, setCaptchaToken] = useState('')
  const [captchaReset, setCaptchaReset] = useState(0)
  const [challengeId, setChallengeId] = useState('')
  const [otpRemainingSeconds, setOtpRemainingSeconds] = useState(0)
  const [resendSeconds, setResendSeconds] = useState(0)
  const [otpState, setOtpState] = useState<OtpState>('idle')
  const [confirmAccuracy, setConfirmAccuracy] = useState(false)
  const [acceptTerms, setAcceptTerms] = useState(false)
  const verifyInFlight = useRef(false)

  useEffect(() => {
    void backend.auth.getOptions().then(({ data }) => setAuthOptions(data))
  }, [])

  useEffect(() => {
    void fetchRegistrationDocTypes(accountType)
      .then(setDocTypes)
      .catch(() => setDocTypes([]))
  }, [accountType])

  useEffect(() => {
    if (otpRemainingSeconds <= 0 && resendSeconds <= 0) return
    const timer = window.setTimeout(() => { setOtpRemainingSeconds((v) => Math.max(0, v - 1)); setResendSeconds((v) => Math.max(0, v - 1)) }, 1000)
    return () => window.clearTimeout(timer)
  }, [otpRemainingSeconds, resendSeconds])

  useEffect(() => {
    if (params.get('resume') === 'docs' && user) {
      setUserId(user.id)
      setStep('docs')
    }
  }, [params, user])

  useEffect(() => {
    if (phoneOnboardingRequested && user?.phone) {
      setPhone(user.phone)
      setAuthChannel('phone')
      setUserId(user.id)
    }
  }, [phoneOnboardingRequested, user])

  useEffect(() => {
    const uid = userId ?? user?.id
    if (!uid || (step !== 'docs' && step !== 'review')) return
    void backend.from('profile_documents').select('doc_type_id,file_url').eq('user_id', uid).then(({ data }) => {
      if (data?.length) setUploads(Object.fromEntries(data.map((row: { doc_type_id: string; file_url: string }) => [row.doc_type_id, row.file_url])))
    })
  }, [step, user?.id, userId])

  const isPhoneOnboarding = phoneOnboardingRequested && Boolean(user)

  if (user && step === 'type' && !isPhoneOnboarding) {
    return <Navigate to="/dashboard" replace />
  }

  const mapOtpError = (err: string | null) => {
    if (!err) return null
    if (err === 'backend_missing') return t('auth.backendMissing')
    if (err === 'invalid_phone') return t('auth.invalidPhone')
    if (err === 'invalid_code') return t('auth.invalidOtp')
    if (err === 'expired') return t('auth.otpExpired')
    if (err === 'already_used') return t('auth.otpUsed')
    if (err === 'invalid_session' || err === 'no_challenge') return t('auth.otpInvalidSession')
    if (err === 'cooldown') return t('auth.otpCooldown')
    if (err === 'too_many_attempts') return t('auth.otpTooMany')
    if (err === 'phone_signup_disabled') return t('auth.phoneSignupDisabled')
    if (err === 'server_error' || err.startsWith('http_')) return t('auth.otpServerError')
    if (err.startsWith('captcha_')) return captchaErrorMessage(err)
    return err
  }

  const validateIdentity = () => {
    try {
      if (authChannel === 'email') {
        if (password !== confirmPassword) {
          setError(t('auth.passwordMismatch'))
          return false
        }
        z.object({
          fullName: z.string().min(2), username: z.string().min(3),
          email: z.string().email(),
          password: z.string().refine(isStrongPassword),
        }).parse({ fullName, username, email, password })
        if (accountType === 'individual') {
          z.object({ nationalId: z.string().min(5) }).parse({ nationalId })
        } else {
          z.object({
            companyName: z.string().min(2),
            companyNationalId: z.string().min(5),
          }).parse({ companyName, companyNationalId })
        }
      } else if (accountType === 'individual') {
        z.object({
          fullName: z.string().min(2), email: z.string().email(),
          nationalId: z.string().min(8),
          phone: z.string().min(10),
        }).parse({ fullName, nationalId, phone, email })
      } else {
        z.object({
          fullName: z.string().min(2), email: z.string().email(),
          companyName: z.string().min(2),
          companyNationalId: z.string().min(5),
          phone: z.string().min(10),
        }).parse({ fullName, companyName, companyNationalId, phone, email })
      }
      if (!firstNameFa.trim() || !lastNameFa.trim() || !firstNameEn.trim() || !lastNameEn.trim() || !birthDate || !postalCode.trim() || !address.trim()) {
        setError(t('auth.required'))
        return false
      }
      if (accountType === 'legal' && !representativeNationalId.trim()) {
        setError(t('auth.required'))
        return false
      }
      return true
    } catch {
      setError(t('auth.required'))
      return false
    }
  }

  const persistProfileFields = async (uid: string) => {
    const { error: profileError } = await backend
      .from('profiles')
      .update({
        account_type: accountType,
        account_status: 'pending',
        auth_channel: authChannel,
        email: email.trim().toLowerCase(),
        national_id: accountType === 'individual' ? nationalId.trim() : null,
        company_name: accountType === 'legal' ? companyName.trim() : null,
        company_national_id: accountType === 'legal' ? companyNationalId.trim() : null,
        economic_code: accountType === 'legal' ? economicCode.trim() || null : null,
        address: address.trim() || null,
        full_name: `${firstNameFa} ${lastNameFa}`.trim() || fullName.trim(),
        username: username.trim().toLowerCase() || null,
        first_name_fa: firstNameFa.trim(),
        last_name_fa: lastNameFa.trim(),
        first_name_en: firstNameEn.trim(),
        last_name_en: lastNameEn.trim(),
        birth_date: birthDate ? latinDigits(birthDate).slice(0, 10) : null,
        postal_code: postalCode.trim(),
        legal_representative_national_id: accountType === 'legal' ? representativeNationalId.trim() : null,
        // Signup only creates the participant shell. The profile becomes
        // complete after the dedicated identity flow collects every required field.
        identity_completed_at: null,
      })
      .eq('id', uid)
    if (profileError) throw new Error(profileError.message)
  }

  const onRequestOtp = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    const result = await requestPhoneOtp(phone.trim(), 'signup', captchaToken)
    setSubmitting(false)
    setCaptchaToken('')
    setCaptchaReset((value) => value + 1)
    if (result.error) {
      setError(mapOtpError(result.error))
      return
    }
    setOtpSent(true)
    setChallengeId(result.challengeId ?? '')
    setOtpRemainingSeconds(result.expiresInSec ?? 300)
    setResendSeconds(result.resendAfterSec ?? 60)
    setDevCode(result.devCode ?? null)
    toast.info(t('auth.otpSent'))
  }

  const verifyOtp = async (completeCode = code) => {
    if (completeCode.length !== 6 || verifyInFlight.current || otpState === 'success') return
    if (!challengeId) { setError(t('auth.otpInvalidSession')); return }
    verifyInFlight.current = true
    setError(null)
    setSubmitting(true)
    setOtpState('verifying')
    const result = await verifyPhoneOtp({
      phone: phone.trim(),
      code: completeCode.trim(),
      fullName: fullName.trim(),
      purpose: 'signup',
      challengeId,
    })
    if (result.error) {
      setSubmitting(false)
      verifyInFlight.current = false
      setOtpState('error')
      setError(mapOtpError(result.error))
      if (['expired', 'already_used', 'invalid_session', 'too_many_attempts'].includes(result.error)) setResendSeconds(0)
      window.setTimeout(() => setOtpState('idle'), 650)
      return
    }
    try {
      const { data: auth } = await backend.auth.getUser()
      const uid = auth.user?.id
      if (!uid) throw new Error(t('common.error'))
      await persistProfileFields(uid)
      setUserId(uid)
      await refreshProfile()
      clearSignupDraft()
      setOtpState('success')
      toast.success(t('auth.phoneVerified'))
      await new Promise((resolve) => window.setTimeout(resolve, 5000))
      setStep('docs')
    } catch (err) {
      setOtpState('error')
      setError(err instanceof Error ? err.message : t('common.error'))
      window.setTimeout(() => setOtpState('idle'), 650)
    } finally {
      verifyInFlight.current = false
      setSubmitting(false)
    }
  }

  const completeVerifiedPhoneIdentity = async () => {
    if (!user || !validateIdentity()) return
    setError(null)
    setSubmitting(true)
    try {
      await persistProfileFields(user.id)
      setUserId(user.id)
      await refreshProfile()
      clearSignupDraft()
      setStep('docs')
      toast.success(t('auth.identitySaved'))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setSubmitting(false)
    }
  }

  const onResendOtp = async () => {
    if (submitting || resendSeconds > 0) return
    setSubmitting(true); setError(null); setCode(''); setOtpState('idle')
    const result = await requestPhoneOtp(phone.trim(), 'signup', '')
    setSubmitting(false)
    if (result.error) { setError(mapOtpError(result.error)); return }
    setChallengeId(result.challengeId ?? ''); setOtpRemainingSeconds(result.expiresInSec ?? 300); setResendSeconds(result.resendAfterSec ?? 60); setDevCode(result.devCode ?? null)
    toast.info(t('auth.otpSent'))
  }

  const onEmailRegister = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    if (!validateIdentity()) return
    setSubmitting(true)

    saveSignupDraft({
      accountType,
      fullName: fullName.trim(),
      username: username.trim(),
      firstNameFa: firstNameFa.trim(),
      lastNameFa: lastNameFa.trim(),
      firstNameEn: firstNameEn.trim(),
      lastNameEn: lastNameEn.trim(),
      birthDate,
      postalCode: postalCode.trim(),
      representativeNationalId: representativeNationalId.trim(),
      nationalId: nationalId.trim(),
      companyName: companyName.trim(),
      companyNationalId: companyNationalId.trim(),
      economicCode: economicCode.trim(),
      address: address.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      authChannel: 'email',
    })

    const result = await signUp({
      email: email.trim().toLowerCase(),
      password,
      fullName: fullName.trim(),
      username: username.trim(),
      phone: phone.trim() || undefined,
      authChannel: 'email',
      captchaToken,
    })
    setSubmitting(false)
    setCaptchaToken('')
    setCaptchaReset((value) => value + 1)

    if (result.error) {
      setError(result.error === 'backend_missing' ? t('auth.backendMissing') : result.error.startsWith('captcha_') ? captchaErrorMessage(result.error) : result.error)
      return
    }

    if (result.needsEmailConfirm) {
      setEmailCheckInbox(true)
      setStep('verify')
      toast.info(t('auth.checkEmail'))
      return
    }

    try {
      const { data: auth } = await backend.auth.getUser()
      const uid = auth.user?.id
      if (!uid) throw new Error(t('common.error'))
      await persistProfileFields(uid)
      setUserId(uid)
      await refreshProfile()
      clearSignupDraft()
      setStep('docs')
      toast.success(t('auth.emailVerified'))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    }
  }

  const onUploadDoc = async (docId: string, file: File | undefined) => {
    if (!file) return
    const validation = validateIdentityImage(file)
    if (validation) { setError(validation); return }
    const uid = userId ?? user?.id
    if (!uid) return
    setSubmitting(true)
    try {
      const url = await uploadProfileDocument(uid, file)
      setUploads((prev) => ({ ...prev, [docId]: url }))
      await backend.from('profile_documents').delete().eq('user_id', uid).eq('doc_type_id', docId)
      await backend.from('profile_documents').insert({
        user_id: uid,
        doc_type_id: docId,
        file_url: url,
      })
      toast.success(t('common.upload'))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setSubmitting(false)
    }
  }

  const removeUpload = async (docId: string) => {
    const uid = userId ?? user?.id
    if (!uid) return
    setSubmitting(true)
    const { error: removeError } = await backend.from('profile_documents').delete().eq('user_id', uid).eq('doc_type_id', docId)
    setSubmitting(false)
    if (removeError) { setError(removeError.message); return }
    setUploads((current) => { const next = { ...current }; delete next[docId]; return next })
  }

  const finish = async () => {
    const missing = docTypes.filter((d) => d.is_required).some((d) => !uploads[d.id])
    if (missing) {
      setError(t('auth.docsRequired'))
      return
    }
    if (!confirmAccuracy || !acceptTerms) { setError('تأیید صحت اطلاعات و پذیرش قوانین برای ثبت نهایی الزامی است.'); return }
    toast.success(t('auth.signupPendingDone'))
    void navigate('/dashboard')
  }

  const steps: Step[] = isPhoneOnboarding
    ? ['type', 'identity', 'docs', 'review']
    : ['type', 'channel', 'identity', 'verify', 'docs', 'review']
  const stepLabels: Record<Step, string> = {
    type: t('auth.registrationSteps.type'),
    channel: t('auth.registrationSteps.channel'),
    identity: t('auth.registrationSteps.identity'),
    verify: t('auth.registrationSteps.verify'),
    docs: t('auth.registrationSteps.docs'),
    review: 'تأیید اطلاعات',
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <p className="font-mono text-[10px] tracking-[0.28em] text-rc-blue uppercase">JOIN · SIGNUP</p>
      <h1 className="mt-1 text-3xl font-semibold">{t('auth.signupTitle')}</h1>
      {authOptions?.email_signup_enabled !== false ? <p className="mt-2 text-sm text-rc-muted">{t('auth.signupMultiHint')}</p> : null}

      {!configured ? (
        <p className="mt-6 text-sm text-red-400">{t('auth.backendMissing')}</p>
      ) : null}

      <RegistrationStepper steps={steps.map((id) => ({ id, label: stepLabels[id] }))} currentId={step} ariaLabel={t('auth.registrationProgress')} />

      {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}

      {step === 'type' ? (
        <div className="mt-6 grid gap-3">
          <button
            type="button"
            onClick={() => {
              setAccountType('individual')
              setStep(isPhoneOnboarding ? 'identity' : 'channel')
            }}
            className="border border-rc-line bg-rc-surface p-4 text-start hover:border-rc-blue/50"
          >
            <p className="font-semibold">{t('registrationSettings.individual')}</p>
            <p className="mt-1 text-sm text-rc-muted">{t('auth.individualHint')}</p>
          </button>
          <button
            type="button"
            onClick={() => {
              setAccountType('legal')
              setStep(isPhoneOnboarding ? 'identity' : 'channel')
            }}
            className="border border-rc-line bg-rc-surface p-4 text-start hover:border-rc-blue/50"
          >
            <p className="font-semibold">{t('registrationSettings.legal')}</p>
            <p className="mt-1 text-sm text-rc-muted">{t('auth.legalHint')}</p>
          </button>
          <p className="text-sm text-rc-muted">
            {t('auth.hasAccount')}{' '}
            <Link to="/login" className="text-rc-blue hover:underline">
              {t('nav.login')}
            </Link>
          </p>
        </div>
      ) : null}

      {step === 'channel' ? (
        <div className="mt-6 grid gap-3">
          <p className="text-sm text-rc-muted">{t('auth.chooseChannelHint')}</p>
          {authOptions?.phone_signup_enabled !== false ? <button
            type="button"
            onClick={() => {
              setAuthChannel('phone')
              setStep('identity')
            }}
            className="border border-rc-line bg-rc-surface p-4 text-start hover:border-rc-blue/50"
          >
            <p className="font-semibold">{t('auth.channelIran')}</p>
            <p className="mt-1 text-sm text-rc-muted">{t('auth.channelIranHint')}</p>
          </button> : null}
          {authOptions?.email_signup_enabled !== false ? <button
            type="button"
            onClick={() => {
              setAuthChannel('email')
              setStep('identity')
            }}
            className="border border-rc-line bg-rc-surface p-4 text-start hover:border-rc-blue/50"
          >
            <p className="font-semibold">{t('auth.channelAbroad')}</p>
            <p className="mt-1 text-sm text-rc-muted">{t('auth.channelAbroadHint')}</p>
          </button> : null}
          <Button type="button" variant="ghost" onClick={() => setStep('type')}>
            {t('team.back')}
          </Button>
        </div>
      ) : null}

      {step === 'identity' ? (
        <form
          className="mt-6 space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (!validateIdentity()) return
            if (isPhoneOnboarding) {
              void completeVerifiedPhoneIdentity()
              return
            }
            if (authChannel === 'email') {
              void onEmailRegister(e)
              return
            }
            setStep('verify')
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="نام فارسی" required value={firstNameFa} onChange={(e) => { setFirstNameFa(e.target.value); setFullName(`${e.target.value} ${lastNameFa}`.trim()) }} />
            <Input label="نام خانوادگی فارسی" required value={lastNameFa} onChange={(e) => { setLastNameFa(e.target.value); setFullName(`${firstNameFa} ${e.target.value}`.trim()) }} />
            <Input label="نام انگلیسی" required value={firstNameEn} onChange={(e) => setFirstNameEn(e.target.value)} dir="ltr" />
            <Input label="نام خانوادگی انگلیسی" required value={lastNameEn} onChange={(e) => setLastNameEn(e.target.value)} dir="ltr" />
          </div>
          <BirthDateField label="تاریخ تولد" value={birthDate} onChange={(date) => setBirthDate(date ?? '')} />
          <Input label="کد پستی" required value={postalCode} onChange={(e) => setPostalCode(e.target.value.replace(/\D/g, ''))} dir="ltr" inputMode="numeric" maxLength={10} />
          {accountType === 'individual' ? (
            <Input
              label={t('auth.nationalId')}
              required
              value={nationalId}
              onChange={(e) => setNationalId(e.target.value)}
              dir="ltr"
            />
          ) : (
            <>
              <Input label={t('company.name')} required value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
              <Input
                label={t('auth.companyNationalId')}
                required
                value={companyNationalId}
                onChange={(e) => setCompanyNationalId(e.target.value)}
                dir="ltr"
              />
              <Input label="کد ملی نماینده قانونی" required value={representativeNationalId} onChange={(e) => setRepresentativeNationalId(e.target.value)} dir="ltr" />
              <Input
                label={t('auth.economicCode')}
                value={economicCode}
                onChange={(e) => setEconomicCode(e.target.value)}
                dir="ltr"
              />
            </>
          )}
          <Textarea label={t('auth.address')} className="min-h-20" value={address} onChange={(e) => setAddress(e.target.value)} />

          {authChannel === 'email' ? (
            <>
              <Input label="نام کاربری" required value={username} onChange={(e) => setUsername(e.target.value)} dir="ltr" autoComplete="username" />
              <Input
                label={t('auth.email')}
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                dir="ltr"
              />
              <PasswordField label={t('auth.password')} value={password} onChange={setPassword} />
              <PasswordField label={t('auth.confirmPassword')} value={confirmPassword} onChange={setConfirmPassword} confirmValue={password} />
              <Input
                label={t('auth.phoneOptional')}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                dir="ltr"
              />
            </>
          ) : (
            <>
              <Input label={t('auth.email')} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" />
              <Input label={t('auth.phone')} required value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" />
            </>
          )}

          {authChannel === 'email' ? <ArcaptchaField context="signup" onToken={setCaptchaToken} resetKey={captchaReset} /> : null}
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => setStep(isPhoneOnboarding ? 'type' : 'channel')}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={submitting}>
              {authChannel === 'email'
                ? submitting
                  ? t('app.loading')
                  : t('auth.signupWithEmail')
                : t('team.next')}
            </Button>
          </div>
        </form>
      ) : null}

      {step === 'verify' && authChannel === 'phone' ? (
        <div className="mt-6 space-y-4">
          {!otpSent ? (
            <form onSubmit={(e) => void onRequestOtp(e)} className="space-y-3">
              <p className="text-sm text-rc-muted">{t('auth.verifyPhoneHint')}</p>
              <Input label={t('auth.phone')} value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" />
              <ArcaptchaField context="signup" onToken={setCaptchaToken} resetKey={captchaReset} />
              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={() => setStep('identity')}>
                  {t('team.back')}
                </Button>
                <Button type="submit" disabled={submitting}>
                  {t('auth.sendOtp')}
                </Button>
              </div>
            </form>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); void verifyOtp() }} className="space-y-3">
              {devCode ? (
                <p className="font-mono text-xs text-rc-accent">DEV OTP: {devCode}</p>
              ) : null}
              <OtpCodeInput value={code} onChange={(next) => { setCode(next); setError(null) }} onComplete={(next) => void verifyOtp(next)} state={otpState} disabled={submitting || otpState === 'success'} />
              <p className={`text-xs font-bold ${otpRemainingSeconds > 0 ? 'text-sky-700' : 'text-rose-700'}`}>{otpRemainingSeconds > 0 ? `${t('auth.otpValidity')} ${String(Math.floor(otpRemainingSeconds / 60)).padStart(2, '0')}:${String(otpRemainingSeconds % 60).padStart(2, '0')}` : t('auth.otpExpired')}</p>
              <Button type="submit" disabled={submitting || code.length !== 6}>
                {submitting ? t('app.loading') : t('auth.verifyAndContinue')}
              </Button>
              <Button type="button" variant="ghost" disabled={submitting || resendSeconds > 0} onClick={() => void onResendOtp()}>{resendSeconds > 0 ? t('auth.otpResendAfterExpiry') : t('auth.otpResend')}</Button>
            </form>
          )}
        </div>
      ) : null}

      {step === 'verify' && authChannel === 'email' && emailCheckInbox ? (
        <div className="mt-6 space-y-4 rounded-xl border border-rc-blue/30 bg-rc-blue/5 p-5">
          <p className="text-sm text-rc-text">{t('auth.checkEmail')}</p>
          <p className="text-sm text-rc-muted" dir="ltr">
            {email}
          </p>
          <p className="text-xs text-rc-muted">{t('auth.checkEmailHint')}</p>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => setStep('identity')}>
              {t('team.back')}
            </Button>
            <Link to="/login" className="inline-flex items-center text-sm text-rc-blue hover:underline">
              {t('nav.login')}
            </Link>
          </div>
        </div>
      ) : null}

      {step === 'docs' ? (
        <div className="mt-6 space-y-4">
          <div className="rounded-2xl border border-sky-100 bg-sky-50 p-4"><p className="text-sm font-black text-sky-900">{t('auth.uploadDocsHint')}</p><p className="mt-1 text-xs leading-6 text-sky-700">تصویر باید واضح باشد؛ حداکثر حجم ۵ مگابایت و فرمت مجاز فقط JPG یا PNG است.</p></div>
          {docTypes.length === 0 ? (
            <p className="text-sm text-rc-muted">{t('auth.noDocsConfigured')}</p>
          ) : (
            docTypes.map((d) => (
              <DocumentUploadField key={d.id} label={d.label_fa} required={d.is_required} value={uploads[d.id]} busy={submitting} onSelect={(file) => void onUploadDoc(d.id, file)} onRemove={() => void removeUpload(d.id)} />
            ))
          )}
          <div className="flex flex-wrap gap-2"><Button type="button" variant="ghost" onClick={() => setStep(isPhoneOnboarding ? 'identity' : 'verify')}>{t('team.back')}</Button><Button type="button" disabled={submitting} onClick={() => { const missing = docTypes.some((doc) => doc.is_required && !uploads[doc.id]); if (missing) { setError(t('auth.docsRequired')); return } setError(null); setStep('review') }}>{t('team.next')}</Button></div>
        </div>
      ) : null}

      {step === 'review' ? <div className="mt-6 space-y-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-black text-slate-900">بررسی نهایی اطلاعات</h2><p className="mt-2 text-sm leading-7 text-slate-500">پیش از ثبت نهایی، مشخصات و مدارک خود را مرور کنید. در صورت نیاز با دکمه بازگشت اطلاعات را اصلاح کنید.</p><dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2"><div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs text-slate-400">نوع حساب</dt><dd className="mt-1 font-black">{accountType === 'legal' ? 'شخص حقوقی' : 'شخص حقیقی'}</dd></div><div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs text-slate-400">نام</dt><dd className="mt-1 font-black">{firstNameFa} {lastNameFa}</dd></div><div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs text-slate-400">نام انگلیسی</dt><dd className="mt-1 font-black" dir="ltr">{firstNameEn} {lastNameEn}</dd></div><div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs text-slate-400">تاریخ تولد</dt><dd className="mt-1 font-black" dir="ltr">{birthDate}</dd></div><div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs text-slate-400">شماره تماس</dt><dd className="mt-1 font-black" dir="ltr">{phone}</dd></div><div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs text-slate-400">تعداد مدارک</dt><dd className="mt-1 font-black">{Object.keys(uploads).length.toLocaleString('fa-IR')}</dd></div></dl></div>
        <div className="space-y-3 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4"><label className="flex cursor-pointer items-start gap-3 text-sm font-bold text-slate-700"><input type="checkbox" checked={confirmAccuracy} onChange={(event) => setConfirmAccuracy(event.target.checked)} className="mt-1 size-5 accent-emerald-600" /><span>تأیید می‌کنم اطلاعات واردشده صحیح و متعلق به این حساب است.</span></label><label className="flex cursor-pointer items-start gap-3 text-sm font-bold text-slate-700"><input type="checkbox" checked={acceptTerms} onChange={(event) => setAcceptTerms(event.target.checked)} className="mt-1 size-5 accent-emerald-600" /><span><Link to="/terms" target="_blank" className="text-rc-blue underline">قوانین و مقررات</Link> را مطالعه کرده‌ام و می‌پذیرم.</span></label></div>
        <div className="flex flex-wrap gap-2"><Button type="button" variant="ghost" onClick={() => setStep('docs')}>{t('team.back')}</Button><Button type="button" disabled={submitting || !confirmAccuracy || !acceptTerms} onClick={() => void finish()}>{t('auth.finishSignup')}</Button></div>
      </div> : null}
    </div>
  )
}
