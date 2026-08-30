import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Button, FieldError, Input, PanelCard, Select, Textarea } from '@/components/ui/FormControls'
import { BirthDateField, latinDigits } from '@/components/ui/BirthDateField'
import { PanelPage } from '@/components/layout/PanelShell'
import { StatCard } from '@/components/panel/HudKit'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/components/ui/Toast'
import { backend } from '@/lib/backend'
import { fetchRegistrationDocTypes, type RegistrationDocType } from '@/features/notifications/api'
import { uploadProfileDocument } from '@/features/content/api'
import { normalizeIranMobile, participantErrors, profileCompletionPercent } from '@/features/participants/identity'
import type { AccountType, ParticipantFieldRule, Profile } from '@/types/database'
import { useTranslation } from 'react-i18next'
import { isStrongPassword, PasswordField } from '@/components/auth/PasswordField'
import { DocumentUploadField, validateIdentityImage } from '@/components/ui/DocumentUploadField'
import { mapSignupError } from '@/features/auth/signupProgress'

const baseRequired = ['first_name_fa', 'last_name_fa', 'first_name_en', 'last_name_en', 'birth_date', 'gender', 'email', 'province', 'city', 'country_code', 'nationality', 'residence', 'postal_code', 'address']
const fallbackRules = baseRequired.map((field_key) => ({ field_key, label_fa: field_key, label_en: field_key, is_required: true, is_locked: false, applies_to: (field_key === 'birth_date' || field_key === 'gender' ? 'individual' : 'both') as ParticipantFieldRule['applies_to'], updated_at: '' }))

export function AccountProfilePage() {
  const { user, profile, refreshProfile, requestPhoneOtp, verifyPhoneOtp } = useAuth()
  const toast = useToast()
  const { t } = useTranslation()
  const formRef = useRef<HTMLFormElement>(null)
  const [form, setForm] = useState<Profile | null>(profile)
  const [rules, setRules] = useState<ParticipantFieldRule[]>(fallbackRules)
  const [docs, setDocs] = useState<RegistrationDocType[]>([])
  const [uploaded, setUploaded] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [otpCode, setOtpCode] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [otpChallengeId, setOtpChallengeId] = useState('')
  const [passwords, setPasswords] = useState({ current: '', next: '', repeat: '' })

  useEffect(() => setForm(profile), [profile])
  useEffect(() => {
    setForm((current) => current && (current.country_code ?? 'IR') === 'IR' && !current.nationality?.trim() ? { ...current, nationality: 'ایرانی', is_foreign: false } : current)
  }, [profile?.id])
  useEffect(() => {
    if (!profile?.account_type || !user) return
    void Promise.all([
      fetchRegistrationDocTypes(profile.account_type),
      backend.from('profile_documents').select('doc_type_id,file_url').eq('user_id', user.id),
      backend.from('participant_field_rules').select('*').order('field_key'),
    ]).then(([types, response, ruleResponse]) => {
      setDocs(types)
      setUploaded(Object.fromEntries((response.data ?? []).map((row: { doc_type_id: string; file_url: string }) => [row.doc_type_id, row.file_url])))
      if (ruleResponse.data?.length) setRules(ruleResponse.data as ParticipantFieldRule[])
    })
  }, [profile?.account_type, user])

  const patch = (value: Partial<Profile>) => setForm((current) => current ? { ...current, ...value } : current)
  const required = (key: string) => rules.some((rule) => rule.field_key === key && rule.is_required && (rule.applies_to === 'both' || rule.applies_to === form?.account_type))
  const field = (key: string) => ({ name: key, required: required(key), error: errors[key] })
  const completion = useMemo(() => {
    if (!form) return 0
    const requiredDocs = docs.filter((doc) => doc.is_required).length
    const uploadedRequiredDocs = docs.filter((doc) => doc.is_required && uploaded[doc.id]).length
    return profileCompletionPercent(form, rules, uploadedRequiredDocs, requiredDocs)
  }, [docs, form, rules, uploaded])

  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (!form || !user) return
    const nextErrors = participantErrors(form, rules)
    if (docs.some((doc) => doc.is_required && !uploaded[doc.id])) nextErrors.documents = 'همه مدارک الزامی را بارگذاری کنید.'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) {
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"], [data-form-error="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
      return
    }
    setBusy(true)
    const { id: _id, role: _role, created_at: _created, ...payload } = form
    const { error } = await backend.from('profiles').update({ ...payload, birth_date: form.birth_date ? latinDigits(form.birth_date).slice(0, 10) : null, phone: normalizeIranMobile(form.phone), full_name: `${form.first_name_fa} ${form.last_name_fa}`.trim(), identity_completed_at: new Date().toISOString() }).eq('id', user.id)
    setBusy(false)
    if (error) return void toast.error(mapSignupError(error.message, t) ?? error.message)
    setErrors({}); await refreshProfile(); toast.success('اطلاعات هویتی با موفقیت ذخیره شد.')
  }

  const uploadDoc = async (doc: RegistrationDocType, file?: File) => {
    if (!file || !user) return
    const validation = validateIdentityImage(file)
    if (validation) return void toast.error(validation)
    setBusy(true)
    try {
      const url = await uploadProfileDocument(user.id, file)
      await backend.from('profile_documents').delete().eq('user_id', user.id).eq('doc_type_id', doc.id)
      await backend.from('profile_documents').insert({ user_id: user.id, doc_type_id: doc.id, file_url: url })
      setUploaded((current) => ({ ...current, [doc.id]: url })); toast.success('مدرک بارگذاری شد.')
    } catch (error) { toast.error(error instanceof Error ? error.message : 'بارگذاری ناموفق بود.') } finally { setBusy(false) }
  }

  const removeDoc = async (doc: RegistrationDocType) => {
    if (!user) return
    setBusy(true)
    const { error } = await backend.from('profile_documents').delete().eq('user_id', user.id).eq('doc_type_id', doc.id)
    setBusy(false)
    if (error) return void toast.error(error.message)
    setUploaded((current) => { const next = { ...current }; delete next[doc.id]; return next })
    toast.success('مدرک حذف شد.')
  }

  const uploadAvatar = async (file?: File) => {
    if (!file || !user) return
    setBusy(true)
    try {
      const path = `${user.id}/avatar-${Date.now()}.${file.name.split('.').pop() ?? 'jpg'}`
      const { error } = await backend.storage.from('profile-avatars').upload(path, file, { upsert: true, contentType: file.type })
      if (error) throw new Error(error.message)
      const url = backend.storage.from('profile-avatars').getPublicUrl(path).data.publicUrl
      await backend.from('profiles').update({ avatar_url: url }).eq('id', user.id)
      patch({ avatar_url: url }); await refreshProfile(); toast.success('تصویر پروفایل ذخیره شد.')
    } catch (error) { toast.error(error instanceof Error ? error.message : 'بارگذاری تصویر ناموفق بود.') } finally { setBusy(false) }
  }

  const changePassword = async (event: FormEvent) => {
    event.preventDefault()
    if (!isStrongPassword(passwords.next)) return void toast.error('رمز جدید باید حداقل ۸ کاراکتر و شامل حرف بزرگ، حرف کوچک و عدد باشد.')
    if (passwords.next !== passwords.repeat) return void toast.error('تکرار رمز عبور با رمز جدید یکسان نیست.')
    setBusy(true); const { error } = await backend.auth.changePassword(passwords.current, passwords.next); setBusy(false)
    if (error) return void toast.error(error.message === 'current_password_invalid' ? 'رمز عبور فعلی صحیح نیست.' : error.message)
    setPasswords({ current: '', next: '', repeat: '' }); toast.success('رمز عبور با موفقیت تغییر کرد.')
  }
  const otpErrorMessage = (error: string) => {
    if (error === 'invalid_code') return t('auth.invalidOtp')
    if (error === 'expired') return t('auth.otpExpired')
    if (error === 'already_used') return t('auth.otpUsed')
    if (error === 'invalid_session' || error === 'no_challenge') return t('auth.otpInvalidSession')
    if (error === 'too_many_attempts') return t('auth.otpTooMany')
    if (error === 'server_error' || error.startsWith('http_')) return t('auth.otpServerError')
    return error
  }
  const handleProfileOtp = async () => {
    if (!otpSent) {
      const requested = await requestPhoneOtp(form?.phone ?? '', 'profile')
      if (requested.error) return void toast.error(otpErrorMessage(requested.error))
      setOtpChallengeId(requested.challengeId ?? ''); setOtpSent(true); return
    }
    const verified = await verifyPhoneOtp({ phone: form?.phone ?? '', code: otpCode, fullName: form?.full_name, purpose: 'profile', challengeId: otpChallengeId })
    if (verified.error) {
      toast.error(otpErrorMessage(verified.error))
      if (['expired','already_used','invalid_session','too_many_attempts'].includes(verified.error)) { setOtpSent(false); setOtpChallengeId(''); setOtpCode('') }
      return
    }
    patch({ phone_verified_at: new Date().toISOString() }); await refreshProfile(); toast.success('شماره موبایل تأیید شد.')
  }

  if (!form) return <p className="text-sm text-slate-500">در حال بارگذاری…</p>
  return <PanelPage index="ID.01" title="پرونده هویتی شرکت‌کننده" description="اطلاعات صاحب حساب را کامل کنید. سرپرست، مربی و اعضای تیم در پرونده همان تیم ثبت می‌شوند و حساب مستقل نمی‌سازند.">
    <div className="grid gap-4 md:grid-cols-3"><section className="relative overflow-hidden rounded-[1.75rem] border border-sky-700 bg-gradient-to-br from-[#06364f] via-[#075d78] to-[#087052] p-6 text-white shadow-[0_18px_48px_rgb(6_54_79/0.2)] md:col-span-2"><div className="relative z-10 flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-black tracking-wide text-cyan-200">پرونده عضویت</p><p className="mt-2 text-3xl font-black text-white">{completion.toLocaleString('fa-IR')}٪ تکمیل شده</p><p className="mt-2 text-sm font-medium text-white/80">{completion === 100 ? 'اطلاعات اصلی پرونده کامل است.' : 'فیلدهای باقی‌مانده را تکمیل کنید تا ثبت‌نام لیگ بدون توقف ادامه یابد.'}</p></div><span className={`rounded-full border px-3 py-1.5 text-xs font-black ${completion === 100 ? 'border-emerald-200/40 bg-emerald-300/20 text-emerald-100' : 'border-amber-200/40 bg-amber-300/20 text-amber-100'}`}>{completion === 100 ? 'کامل' : 'نیازمند تکمیل'}</span></div><div className="relative z-10 mt-5 h-3 overflow-hidden rounded-full border border-white/10 bg-black/20"><span className="block h-full rounded-full bg-gradient-to-l from-cyan-300 to-emerald-300 transition-all duration-500" style={{ width: `${completion}%` }} /></div><span className="absolute -bottom-16 -start-12 size-48 rounded-full border-[28px] border-white/5" /></section><StatCard index="01" label={form.is_foreign ? 'تأیید حساب' : 'تأیید موبایل'} value={form.is_foreign ? 'از مسیر ایمیل' : form.phone_verified_at ? 'تأیید شده' : 'نیازمند تأیید'} hint={form.is_foreign ? 'شرکت‌کننده خارج از ایران' : 'احراز هویت پیامکی'} accent={form.is_foreign || form.phone_verified_at ? 'green' : 'orange'} /></div>
    <form ref={formRef} className="space-y-5" noValidate onSubmit={(event) => void save(event)}>
      {Object.keys(errors).length ? <FieldError message="اطلاعات مشخص‌شده را اصلاح کنید؛ به اولین خطا هدایت می‌شوید." /> : null}
      <PanelCard title="تصویر و نوع حساب" description="تصویر در هدر پنل و پرونده شما نمایش داده می‌شود."><div className="flex flex-wrap items-center gap-5"><span className="grid size-24 overflow-hidden place-items-center rounded-3xl bg-slate-100 text-2xl font-black text-slate-400">{form.avatar_url ? <img src={form.avatar_url} alt="" className="size-full object-cover" /> : form.full_name.slice(0, 1)}</span><label className="cursor-pointer rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-bold text-sky-800">انتخاب تصویر<input className="hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => void uploadAvatar(e.target.files?.[0])} /></label><Select label="نوع شرکت‌کننده" value={form.account_type ?? 'individual'} onChange={(e) => patch({ account_type: e.target.value as AccountType })}><option value="individual">شخص حقیقی</option><option value="legal">شخص حقوقی</option></Select></div></PanelCard>
      <PanelCard title="اطلاعات هویتی" description="فیلدهای ستاره‌دار الزامی هستند."><div className="grid gap-4 md:grid-cols-2">
        <Input label="نام فارسی" {...field('first_name_fa')} value={form.first_name_fa ?? ''} onChange={(e) => patch({ first_name_fa: e.target.value })} /><Input label="نام خانوادگی فارسی" {...field('last_name_fa')} value={form.last_name_fa ?? ''} onChange={(e) => patch({ last_name_fa: e.target.value })} />
        <Input label="نام انگلیسی" {...field('first_name_en')} dir="ltr" value={form.first_name_en ?? ''} onChange={(e) => patch({ first_name_en: e.target.value })} /><Input label="نام خانوادگی انگلیسی" {...field('last_name_en')} dir="ltr" value={form.last_name_en ?? ''} onChange={(e) => patch({ last_name_en: e.target.value })} />
        <Select label="جنسیت" {...field('gender')} value={form.gender ?? ''} onChange={(e) => patch({ gender: e.target.value as Profile['gender'] })}><option value="">انتخاب کنید</option><option value="male">مرد</option><option value="female">زن</option><option value="other">سایر</option></Select><BirthDateField label="تاریخ تولد" name="birth_date" required={required('birth_date')} value={form.birth_date} onChange={(date) => patch({ birth_date: date })} error={errors.birth_date} />
        <Input label="ایمیل" {...field('email')} type="email" dir="ltr" value={form.email ?? ''} onChange={(e) => patch({ email: e.target.value })} /><Input label="تلفن ثابت (اختیاری)" {...field('landline')} dir="ltr" inputMode="numeric" value={form.landline ?? ''} onChange={(e) => patch({ landline: e.target.value.replace(/\D/g, '') })} />
        <div><Input label="شماره موبایل" {...field('phone')} dir="ltr" value={form.phone ?? ''} onChange={(e) => { patch({ phone: e.target.value, phone_verified_at: null }); setOtpSent(false); setOtpChallengeId('') }} />{form.is_foreign ? <p className="mt-2 text-xs text-slate-500">برای شرکت‌کننده خارج از ایران، احراز هویت حساب از مسیر ایمیل انجام می‌شود.</p> : !form.phone_verified_at ? <div className="mt-2 flex gap-2">{otpSent ? <Input label="کد تأیید" dir="ltr" inputMode="numeric" value={otpCode} onChange={(e) => setOtpCode(e.target.value)} /> : null}<Button type="button" variant="secondary" onClick={() => void handleProfileOtp()}>{otpSent ? 'تأیید کد' : 'ارسال کد'}</Button></div> : <p className="mt-2 text-xs font-bold text-emerald-600">شماره موبایل تأیید شده است.</p>}</div>
        <Select label="کشور" {...field('country_code')} value={form.country_code ?? 'IR'} onChange={(e) => patch({ country_code: e.target.value, is_foreign: e.target.value !== 'IR', nationality: e.target.value === 'IR' ? 'ایرانی' : 'اتباع' })}><option value="IR">ایران</option><option value="AF">افغانستان</option><option value="IQ">عراق</option><option value="OTHER">سایر</option></Select>{form.country_code === 'IR' ? <Select label="تابعیت" {...field('nationality')} value={form.nationality ?? 'ایرانی'} onChange={(e) => patch({ nationality: e.target.value })}><option value="ایرانی">ایرانی</option><option value="اتباع">اتباع</option></Select> : null}
        {form.is_foreign ? <Input label="شماره گذرنامه" required error={errors.passport_number} dir="ltr" value={form.passport_number ?? ''} onChange={(e) => patch({ passport_number: e.target.value })} /> : <Input label="کد ملی" required error={errors.national_id} dir="ltr" value={form.national_id ?? ''} onChange={(e) => patch({ national_id: e.target.value })} />}
        <Input label="استان" {...field('province')} value={form.province ?? ''} onChange={(e) => patch({ province: e.target.value })} /><Input label="شهر" {...field('city')} value={form.city ?? ''} onChange={(e) => patch({ city: e.target.value })} /><Input label="محل سکونت" {...field('residence')} value={form.residence ?? ''} onChange={(e) => patch({ residence: e.target.value })} /><Input label="کد پستی" {...field('postal_code')} dir="ltr" inputMode="numeric" value={form.postal_code ?? ''} onChange={(e) => patch({ postal_code: e.target.value.replace(/\D/g, '') })} />
        <Textarea label="نشانی کامل" {...field('address')} className="md:col-span-2" value={form.address ?? ''} onChange={(e) => patch({ address: e.target.value })} />
      </div></PanelCard>
      {form.account_type === 'legal' ? <PanelCard title="اطلاعات شخص حقوقی"><div className="grid gap-4 md:grid-cols-2"><Input label="نام شرکت" required error={errors.company_name} value={form.company_name ?? ''} onChange={(e) => patch({ company_name: e.target.value })} /><Input label="شناسه ملی شرکت" required error={errors.company_national_id} dir="ltr" value={form.company_national_id ?? ''} onChange={(e) => patch({ company_national_id: e.target.value })} /><Input label="کد اقتصادی" dir="ltr" value={form.economic_code ?? ''} onChange={(e) => patch({ economic_code: e.target.value })} /><Input label="کد ملی نماینده قانونی" required error={errors.legal_representative_national_id} dir="ltr" value={form.legal_representative_national_id ?? ''} onChange={(e) => patch({ legal_representative_national_id: e.target.value })} /></div></PanelCard> : null}
      <PanelCard title="مدارک احراز هویت" description="تصویر باید واضح، بدون برش و حداکثر ۵ مگابایت باشد. فقط فایل‌های JPG و PNG پذیرفته می‌شوند."><div data-form-error={Boolean(errors.documents)} className={`grid gap-4 md:grid-cols-2 ${errors.documents ? 'rounded-2xl ring-2 ring-rose-300 ring-offset-4' : ''}`}>{docs.map((doc) => <DocumentUploadField key={doc.id} label={doc.label_fa} required={doc.is_required} value={uploaded[doc.id]} busy={busy} onSelect={(file) => void uploadDoc(doc, file)} onRemove={() => void removeDoc(doc)} />)}</div></PanelCard>
      <Button type="submit" disabled={busy}>{busy ? 'در حال ذخیره…' : 'ذخیره و تکمیل پرونده'}</Button>
    </form>
    <PanelCard title="امنیت حساب" description="قدرت رمز جدید را بررسی کنید؛ رمز عبور هرگز در پنل نمایش دائمی داده نمی‌شود."><form className="grid gap-4 md:grid-cols-3" onSubmit={(e) => void changePassword(e)}><PasswordField label="رمز فعلی" value={passwords.current} onChange={(value) => setPasswords((p) => ({ ...p, current: value }))} autoComplete="current-password" showStrength={false} /><PasswordField label="رمز جدید" value={passwords.next} onChange={(value) => setPasswords((p) => ({ ...p, next: value }))} /><PasswordField label="تکرار رمز جدید" value={passwords.repeat} onChange={(value) => setPasswords((p) => ({ ...p, repeat: value }))} confirmValue={passwords.next} /><Button type="submit" disabled={busy || !isStrongPassword(passwords.next) || passwords.next !== passwords.repeat}>تغییر امن رمز عبور</Button></form></PanelCard>
  </PanelPage>
}
