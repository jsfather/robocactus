import { useEffect, useState, type FormEvent } from 'react'
import { Button, FieldError, Input, Select, Textarea } from '@/components/ui/FormControls'
import { DateTimeField } from '@/components/ui/DateTimeField'
import { PanelPage } from '@/components/layout/PanelShell'
import { HudFrame, SectionLabel } from '@/components/panel/HudKit'
import { useAuth } from '@/hooks/useAuth'
import { backend } from '@/lib/backend'
import { fetchRegistrationDocTypes, type RegistrationDocType } from '@/features/notifications/api'
import { uploadProfileDocument } from '@/features/content/api'
import type { AccountType, Profile } from '@/types/database'

export function AccountProfilePage() {
  const { user, profile, refreshProfile, requestPhoneOtp, verifyPhoneOtp } = useAuth()
  const [form, setForm] = useState<Profile | null>(profile)
  const [docs, setDocs] = useState<RegistrationDocType[]>([])
  const [uploaded, setUploaded] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [otpCode, setOtpCode] = useState('')
  const [otpSent, setOtpSent] = useState(false)

  useEffect(() => setForm(profile), [profile])
  useEffect(() => {
    if (!profile?.account_type || !user) return
    void Promise.all([
      fetchRegistrationDocTypes(profile.account_type),
      backend.from('profile_documents').select('doc_type_id').eq('user_id', user.id),
    ]).then(([types, response]) => {
      setDocs(types)
      setUploaded(new Set((response.data ?? []).map((row: { doc_type_id: string }) => row.doc_type_id)))
    })
  }, [profile?.account_type, user])

  const patch = (value: Partial<Profile>) => setForm((current) => current ? { ...current, ...value } : current)
  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (!form || !user) return
    const required = [form.first_name_fa, form.last_name_fa, form.first_name_en, form.last_name_en, form.email, form.birth_date, form.address, form.postal_code]
    if (required.some((value) => !String(value ?? '').trim()) || (form.account_type === 'individual' ? !form.national_id : !form.company_name || !form.company_national_id || !form.legal_representative_national_id)) {
      setError('تکمیل همه اطلاعات هویتی الزامی است.')
      return
    }
    if (docs.some((doc) => doc.is_required && !uploaded.has(doc.id))) {
      setError('مدارک الزامی را بارگذاری کنید.')
      return
    }
    setBusy(true)
    setError(null)
    const { id: _id, role: _role, created_at: _created, ...payload } = form
    const { error: updateError } = await backend.from('profiles').update({ ...payload, full_name: `${form.first_name_fa} ${form.last_name_fa}`.trim(), identity_completed_at: new Date().toISOString() }).eq('id', user.id)
    setBusy(false)
    if (updateError) { setError(updateError.message); return }
    await refreshProfile()
  }

  const upload = async (doc: RegistrationDocType, file?: File) => {
    if (!file || !user) return
    setBusy(true)
    try {
      const url = await uploadProfileDocument(user.id, file)
      await backend.from('profile_documents').delete().eq('user_id', user.id).eq('doc_type_id', doc.id)
      await backend.from('profile_documents').insert({ user_id: user.id, doc_type_id: doc.id, file_url: url })
      setUploaded((current) => new Set(current).add(doc.id))
    } catch (err) { setError(err instanceof Error ? err.message : 'آپلود ناموفق بود.') } finally { setBusy(false) }
  }

  if (!form) return <p className="text-rc-muted">در حال بارگذاری…</p>
  return <PanelPage index="ID.01" title="تکمیل اطلاعات هویتی" description="برای مشاهده لیگ‌ها و ثبت تیم، اطلاعات و مدارک خود را کامل کنید.">
    <form className="space-y-6" onSubmit={(event) => void save(event)}>
      <FieldError message={error ?? undefined} />
      <HudFrame className="space-y-4 p-5"><SectionLabel index="PERSON.01" title="هویت فرد یا نماینده قانونی" />
        <div className="grid gap-3 md:grid-cols-2">
          <Select label="نوع حساب" value={form.account_type ?? 'individual'} onChange={(event) => patch({ account_type: event.target.value as AccountType })}><option value="individual">شخص حقیقی</option><option value="legal">شخص حقوقی</option></Select>
          <Input label="نام کاربری" value={form.username ?? ''} onChange={(event) => patch({ username: event.target.value })} dir="ltr" />
          <Input label="نام فارسی" required value={form.first_name_fa ?? ''} onChange={(event) => patch({ first_name_fa: event.target.value })} />
          <Input label="نام خانوادگی فارسی" required value={form.last_name_fa ?? ''} onChange={(event) => patch({ last_name_fa: event.target.value })} />
          <Input label="نام انگلیسی" required value={form.first_name_en ?? ''} onChange={(event) => patch({ first_name_en: event.target.value })} dir="ltr" />
          <Input label="نام خانوادگی انگلیسی" required value={form.last_name_en ?? ''} onChange={(event) => patch({ last_name_en: event.target.value })} dir="ltr" />
          <Input label="ایمیل" required type="email" value={form.email ?? ''} onChange={(event) => patch({ email: event.target.value })} dir="ltr" />
          <div className="space-y-2"><Input label="شماره موبایل" required value={form.phone ?? ''} onChange={(event) => patch({ phone: event.target.value, phone_verified_at: null })} dir="ltr" />
            {form.phone_verified_at ? <p className="text-xs text-emerald-500">شماره موبایل تأیید شده است.</p> : <div className="flex gap-2">{otpSent ? <Input label="کد یکبارمصرف" value={otpCode} onChange={(event) => setOtpCode(event.target.value)} dir="ltr" /> : null}<Button type="button" variant="secondary" onClick={() => void (async () => { setBusy(true); const result = otpSent ? await verifyPhoneOtp({ phone: form.phone, code: otpCode, fullName: form.full_name, purpose: 'profile' }) : await requestPhoneOtp(form.phone, 'profile'); setBusy(false); if (result.error) { setError(result.error); return } if (otpSent) { patch({ phone_verified_at: new Date().toISOString() }); await refreshProfile() } else setOtpSent(true) })()}>{otpSent ? 'تأیید کد' : 'ارسال کد تأیید'}</Button></div>}</div>
          <DateTimeField label="تاریخ تولد" withTime={false} value={form.birth_date ? `${form.birth_date}T12:00:00.000Z` : null} onChange={(iso) => patch({ birth_date: iso?.slice(0, 10) ?? null })} />
          {form.account_type === 'individual' ? <Input label="کد ملی" required value={form.national_id ?? ''} onChange={(event) => patch({ national_id: event.target.value })} dir="ltr" /> : null}
          <Input label="کد پستی" required value={form.postal_code ?? ''} onChange={(event) => patch({ postal_code: event.target.value })} dir="ltr" />
        </div><Textarea label="نشانی کامل" required value={form.address ?? ''} onChange={(event) => patch({ address: event.target.value })} />
      </HudFrame>
      {form.account_type === 'legal' ? <HudFrame className="space-y-4 p-5"><SectionLabel index="LEGAL.02" title="اطلاعات شرکت" /><div className="grid gap-3 md:grid-cols-2"><Input label="نام شرکت" required value={form.company_name ?? ''} onChange={(event) => patch({ company_name: event.target.value })} /><Input label="شناسه ملی شرکت" required value={form.company_national_id ?? ''} onChange={(event) => patch({ company_national_id: event.target.value })} dir="ltr" /><Input label="کد اقتصادی" value={form.economic_code ?? ''} onChange={(event) => patch({ economic_code: event.target.value })} dir="ltr" /><Input label="کد ملی نماینده قانونی" required value={form.legal_representative_national_id ?? ''} onChange={(event) => patch({ legal_representative_national_id: event.target.value })} dir="ltr" /></div></HudFrame> : null}
      <HudFrame className="space-y-4 p-5"><SectionLabel index="DOC.03" title="مدارک احراز هویت" hint="کارت ملی و برای اشخاص حقوقی روزنامه رسمی را بارگذاری کنید." /><div className="grid gap-3 md:grid-cols-2">{docs.map((doc) => <label key={doc.id} className="rounded-2xl border border-rc-line bg-rc-surface p-4"><span className="mb-2 block text-sm font-bold">{doc.label_fa}{doc.is_required ? ' *' : ''}</span><input type="file" accept="image/*,application/pdf" onChange={(event) => void upload(doc, event.target.files?.[0])} className="text-xs" />{uploaded.has(doc.id) ? <span className="mt-2 block text-xs text-emerald-500">بارگذاری شده</span> : null}</label>)}</div></HudFrame>
      <Button type="submit" disabled={busy}>{busy ? 'در حال ذخیره…' : 'ذخیره و ادامه'}</Button>
    </form>
  </PanelPage>
}
