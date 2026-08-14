import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { Button, Input, Textarea } from '@/components/ui/FormControls'
import {
  clearSignupDraft,
  saveSignupDraft,
  useAuth,
} from '@/hooks/useAuth'
import { useToast } from '@/components/ui/Toast'
import { fetchRegistrationDocTypes, type RegistrationDocType } from '@/features/notifications/api'
import { uploadContentMedia } from '@/features/content/api'
import { supabase } from '@/lib/supabase'
import type { AccountType } from '@/types/database'

type Step = 'type' | 'channel' | 'identity' | 'verify' | 'docs'
type AuthChannel = 'phone' | 'email'

export function SignupPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const { requestPhoneOtp, verifyPhoneOtp, signUp, user, configured, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()

  const [step, setStep] = useState<Step>(() =>
    params.get('resume') === 'docs' ? 'docs' : 'type',
  )
  const [accountType, setAccountType] = useState<AccountType>('individual')
  const [authChannel, setAuthChannel] = useState<AuthChannel>('phone')
  const [fullName, setFullName] = useState('')
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

  useEffect(() => {
    void fetchRegistrationDocTypes(accountType)
      .then(setDocTypes)
      .catch(() => setDocTypes([]))
  }, [accountType])

  useEffect(() => {
    if (params.get('resume') === 'docs' && user) {
      setUserId(user.id)
      setStep('docs')
    }
  }, [params, user])

  if (user && step === 'type') {
    return <Navigate to="/dashboard" replace />
  }

  const mapOtpError = (err: string | null) => {
    if (!err) return null
    if (err === 'supabase_missing') return t('auth.supabaseMissing')
    if (err === 'invalid_phone') return t('auth.invalidPhone')
    if (err === 'invalid_code' || err === 'no_challenge') return t('auth.invalidOtp')
    if (err === 'expired') return t('auth.otpExpired')
    if (err === 'cooldown') return t('auth.otpCooldown')
    if (err === 'too_many_attempts') return t('auth.otpTooMany')
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
          fullName: z.string().min(2),
          email: z.string().email(),
          password: z.string().min(8),
        }).parse({ fullName, email, password })
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
          fullName: z.string().min(2),
          nationalId: z.string().min(8),
          phone: z.string().min(10),
        }).parse({ fullName, nationalId, phone })
      } else {
        z.object({
          fullName: z.string().min(2),
          companyName: z.string().min(2),
          companyNationalId: z.string().min(5),
          phone: z.string().min(10),
        }).parse({ fullName, companyName, companyNationalId, phone })
      }
      return true
    } catch {
      setError(t('auth.required'))
      return false
    }
  }

  const persistProfileFields = async (uid: string) => {
    await supabase
      .from('profiles')
      .update({
        account_type: accountType,
        account_status: 'pending',
        auth_channel: authChannel,
        email: authChannel === 'email' ? email.trim().toLowerCase() : null,
        national_id: accountType === 'individual' ? nationalId.trim() : null,
        company_name: accountType === 'legal' ? companyName.trim() : null,
        company_national_id: accountType === 'legal' ? companyNationalId.trim() : null,
        economic_code: accountType === 'legal' ? economicCode.trim() || null : null,
        address: address.trim() || null,
        full_name: fullName.trim(),
      })
      .eq('id', uid)
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
    toast.info(t('auth.otpSent'))
  }

  const onVerifyOtp = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    const result = await verifyPhoneOtp({
      phone: phone.trim(),
      code: code.trim(),
      fullName: fullName.trim(),
    })
    if (result.error) {
      setSubmitting(false)
      setError(mapOtpError(result.error))
      return
    }
    try {
      const { data: auth } = await supabase.auth.getUser()
      const uid = auth.user?.id
      if (!uid) throw new Error(t('common.error'))
      await persistProfileFields(uid)
      setUserId(uid)
      await refreshProfile()
      clearSignupDraft()
      setStep('docs')
      toast.success(t('auth.phoneVerified'))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setSubmitting(false)
    }
  }

  const onEmailRegister = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    if (!validateIdentity()) return
    setSubmitting(true)

    saveSignupDraft({
      accountType,
      fullName: fullName.trim(),
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
      phone: phone.trim() || undefined,
      authChannel: 'email',
    })
    setSubmitting(false)

    if (result.error) {
      setError(result.error === 'supabase_missing' ? t('auth.supabaseMissing') : result.error)
      return
    }

    if (result.needsEmailConfirm) {
      setEmailCheckInbox(true)
      setStep('verify')
      toast.info(t('auth.checkEmail'))
      return
    }

    try {
      const { data: auth } = await supabase.auth.getUser()
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
    const uid = userId ?? user?.id
    if (!uid) return
    setSubmitting(true)
    try {
      const url = await uploadContentMedia(uid, file)
      setUploads((prev) => ({ ...prev, [docId]: url }))
      await supabase.from('profile_documents').insert({
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

  const finish = async () => {
    const missing = docTypes.filter((d) => d.is_required).some((d) => !uploads[d.id])
    if (missing) {
      setError(t('auth.docsRequired'))
      return
    }
    toast.success(t('auth.signupPendingDone'))
    void navigate('/dashboard')
  }

  const steps: Step[] =
    authChannel === 'email'
      ? ['type', 'channel', 'identity', 'verify', 'docs']
      : ['type', 'channel', 'identity', 'verify', 'docs']

  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      <p className="font-mono text-[10px] tracking-[0.28em] text-rc-blue uppercase">JOIN · SIGNUP</p>
      <h1 className="mt-1 text-3xl font-semibold">{t('auth.signupTitle')}</h1>
      <p className="mt-2 text-sm text-rc-muted">{t('auth.signupMultiHint')}</p>

      {!configured ? (
        <p className="mt-6 text-sm text-red-400">{t('auth.supabaseMissing')}</p>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-3 font-mono text-[10px] tracking-wide text-rc-muted">
        {steps.map((s, i) => (
          <span key={s} className={step === s ? 'text-rc-blue' : ''}>
            0{i + 1} {s}
          </span>
        ))}
      </div>

      {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}

      {step === 'type' ? (
        <div className="mt-6 grid gap-3">
          <button
            type="button"
            onClick={() => {
              setAccountType('individual')
              setStep('channel')
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
              setStep('channel')
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
          <button
            type="button"
            onClick={() => {
              setAuthChannel('phone')
              setStep('identity')
            }}
            className="border border-rc-line bg-rc-surface p-4 text-start hover:border-rc-blue/50"
          >
            <p className="font-semibold">{t('auth.channelIran')}</p>
            <p className="mt-1 text-sm text-rc-muted">{t('auth.channelIranHint')}</p>
          </button>
          <button
            type="button"
            onClick={() => {
              setAuthChannel('email')
              setStep('identity')
            }}
            className="border border-rc-line bg-rc-surface p-4 text-start hover:border-rc-blue/50"
          >
            <p className="font-semibold">{t('auth.channelAbroad')}</p>
            <p className="mt-1 text-sm text-rc-muted">{t('auth.channelAbroadHint')}</p>
          </button>
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
            if (authChannel === 'email') {
              void onEmailRegister(e)
              return
            }
            setStep('verify')
          }}
        >
          <Input label={t('auth.fullName')} required value={fullName} onChange={(e) => setFullName(e.target.value)} />
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
              <Input
                label={t('auth.email')}
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                dir="ltr"
              />
              <Input
                label={t('auth.password')}
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                dir="ltr"
              />
              <Input
                label={t('auth.confirmPassword')}
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                dir="ltr"
              />
              <Input
                label={t('auth.phoneOptional')}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                dir="ltr"
              />
            </>
          ) : (
            <Input label={t('auth.phone')} required value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" />
          )}

          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => setStep('channel')}>
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
            <form onSubmit={(e) => void onVerifyOtp(e)} className="space-y-3">
              {devCode ? (
                <p className="font-mono text-xs text-rc-accent">DEV OTP: {devCode}</p>
              ) : null}
              <Input label={t('auth.otpCode')} required value={code} onChange={(e) => setCode(e.target.value)} dir="ltr" />
              <Button type="submit" disabled={submitting}>
                {submitting ? t('app.loading') : t('auth.verifyAndContinue')}
              </Button>
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
          <p className="text-sm text-rc-muted">{t('auth.uploadDocsHint')}</p>
          {docTypes.length === 0 ? (
            <p className="text-sm text-rc-muted">{t('auth.noDocsConfigured')}</p>
          ) : (
            docTypes.map((d) => (
              <label key={d.id} className="block space-y-1.5 border border-rc-line p-3">
                <span className="text-sm">
                  {d.label_fa}
                  {d.is_required ? ' *' : ''}
                </span>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  className="block w-full text-sm text-rc-muted"
                  onChange={(e) => void onUploadDoc(d.id, e.target.files?.[0])}
                />
                {uploads[d.id] ? <p className="font-mono text-[10px] text-emerald-400">OK</p> : null}
              </label>
            ))
          )}
          <Button type="button" disabled={submitting} onClick={() => void finish()}>
            {t('auth.finishSignup')}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
