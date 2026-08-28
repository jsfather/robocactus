import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, FieldError, Input, PanelCard, Select, Textarea } from '@/components/ui/FormControls'
import {
  adminUpdateProfile,
  fetchAllProfiles,
} from '@/features/leagues/adminApi'
import { activateUserAccount, createAccountIssue } from '@/features/notifications/api'
import { AccountIssuesAdminList } from '@/features/account-issues/AccountIssuesPanel'
import { useToast } from '@/components/ui/Toast'
import type { Profile } from '@/types/database'
import { PanelPage } from '@/components/layout/PanelShell'
import { StatCard } from '@/components/panel/HudKit'
import { backend } from '@/lib/backend'
import { normalizeIranMobile, participantDisplayName } from '@/features/participants/identity'

export function SuperAdminUsersPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [editing, setEditing] = useState<Profile | null>(null)
  const [editForm, setEditForm] = useState({
    full_name: '',
    phone: '',
    email: '',
    national_id: '',
    address: '',
    company_name: '',
    company_national_id: '',
    economic_code: '',
  })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [passwordTarget, setPasswordTarget] = useState<Profile | null>(null)
  const [adminPassword, setAdminPassword] = useState({ next: '', repeat: '' })
  const [createForm, setCreateForm] = useState({ full_name: '', phone: '', email: '', username: '', password: '', account_type: 'individual' as 'individual' | 'legal', account_status: 'pending' as 'pending' | 'active' })
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [genderFilter, setGenderFilter] = useState('all')
  const [completionFilter, setCompletionFilter] = useState('all')
  const [provinceFilter, setProvinceFilter] = useState('all')
  const [cityFilter, setCityFilter] = useState('all')

  const participants = useMemo(() => profiles.filter((profile) => ['company_admin', 'team_captain'].includes(profile.role)), [profiles])
  const filteredParticipants = useMemo(() => participants.filter((profile) => {
    const haystack = `${profile.full_name} ${profile.phone} ${profile.email ?? ''} ${profile.province ?? ''} ${profile.city ?? ''}`.toLowerCase()
    return (!search.trim() || haystack.includes(search.trim().toLowerCase()))
      && (typeFilter === 'all' || profile.account_type === typeFilter)
      && (genderFilter === 'all' || profile.gender === genderFilter)
      && (completionFilter === 'all' || (completionFilter === 'complete' ? Boolean(profile.identity_completed_at) : !profile.identity_completed_at))
      && (provinceFilter === 'all' || profile.province === provinceFilter)
      && (cityFilter === 'all' || profile.city === cityFilter)
  }), [participants, search, typeFilter, genderFilter, completionFilter, provinceFilter, cityFilter])

  const reload = async () => {
    setLoading(true)
    setError(null)
    try {
      const p = await fetchAllProfiles()
      setProfiles(p)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const openEdit = (profile: Profile) => {
    setEditing(profile)
    setEditForm({
      full_name: profile.full_name ?? '',
      phone: profile.phone ?? '',
      email: profile.email ?? '',
      national_id: profile.national_id ?? '',
      address: profile.address ?? '',
      company_name: profile.company_name ?? '',
      company_national_id: profile.company_national_id ?? '',
      economic_code: profile.economic_code ?? '',
    })
  }

  const onSaveEdit = async (e: FormEvent) => {
    e.preventDefault()
    if (!editing) return
    setBusy(true)
    setError(null)
    try {
      const updated = await adminUpdateProfile({
        userId: editing.id,
        fullName: editForm.full_name,
        phone: editForm.phone,
        email: editForm.email,
        nationalId: editForm.national_id,
        address: editForm.address,
        companyName: editForm.company_name,
        companyNationalId: editForm.company_national_id,
        economicCode: editForm.economic_code,
      })
      setProfiles((prev) => prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)))
      setEditing(null)
      toast.success(t('admin.users.saved'))
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('common.error')
      setError(msg)
      toast.error(msg)
    } finally {
      setBusy(false)
    }
  }

  const onCreateUser = async (event: FormEvent) => {
    event.preventDefault()
    if (!createForm.full_name.trim() || !normalizeIranMobile(createForm.phone.trim())) {
      const message = 'نام و شماره موبایل معتبر الزامی است.'; setError(message); toast.error(message); return
    }
    setBusy(true); setError(null)
    const { error: createError } = await backend.auth.adminCreateUser(createForm)
    setBusy(false)
    if (createError) {
      const message = createError.message === 'user_already_exists' ? 'کاربری با این شماره، ایمیل یا نام کاربری وجود دارد.' : createError.message
      setError(message); toast.error(message); return
    }
    toast.success('حساب کاربر با موفقیت ساخته شد.')
    setCreateForm({ full_name: '', phone: '', email: '', username: '', password: '', account_type: 'individual', account_status: 'pending' })
    setCreating(false); await reload()
  }
  const deleteUser = async (profile: Profile) => {
    if (!window.confirm(`حساب «${participantDisplayName(profile)}» و اطلاعات وابسته برای همیشه حذف شود؟`)) return
    setBusy(true); const result = await backend.auth.adminDeleteUser(profile.id); setBusy(false)
    if (result.error) return void toast.error(result.error.message)
    await reload(); toast.success('حساب کاربر حذف شد.')
  }
  const accountStatusLabel: Record<string, string> = { active: 'فعال', pending: 'در انتظار تکمیل', suspended: 'تعلیق‌شده', rejected: 'ردشده', inactive: 'غیرفعال' }

  return (
    <PanelPage index="USR.01" title={t('admin.users.title')} description="مدیریت حساب شرکت‌کنندگان حقیقی و حقوقی؛ اعضای مدیریتی از بخش نقش‌ها مدیریت می‌شوند." actions={<Button type="button" onClick={() => setCreating((value) => !value)}>{creating ? 'بستن فرم' : '+ افزودن کاربر'}</Button>}>

      <FieldError message={error ?? undefined} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard index="01" label="کل کاربران" value={profiles.length} hint="تمام حساب‌های ثبت‌شده" />
        <StatCard index="02" label="در انتظار فعال‌سازی" value={profiles.filter((profile) => profile.account_status === 'pending').length} hint="نیازمند بررسی مدیریت" accent="orange" />
        <StatCard index="03" label="اشخاص حقوقی" value={participants.filter((profile) => profile.account_type === 'legal').length} hint="شرکت‌ها و سازمان‌های شرکت‌کننده" accent="green" />
        <StatCard index="04" label="مدیر لیگ و همکار" value={profiles.filter((profile) => profile.role === 'league_admin' || profile.role === 'staff').length} hint="اعضای اجرایی پنل" />
      </div>

      {creating ? <PanelCard title="افزودن کاربر حقیقی یا حقوقی" description="این فرم حساب شرکت‌کننده می‌سازد؛ برای کاربر حقیقی نقش پایه کاربری و برای شخص حقوقی دسترسی پنل شرکت ثبت می‌شود.">
        <form noValidate className="grid gap-4 md:grid-cols-2" onSubmit={(event) => void onCreateUser(event)}>
          <Select label="نوع حساب" value={createForm.account_type} onChange={(event) => setCreateForm((form) => ({ ...form, account_type: event.target.value as 'individual' | 'legal' }))}><option value="individual">شخص حقیقی</option><option value="legal">شخص حقوقی / شرکت</option></Select>
          <Select label="وضعیت اولیه حساب" value={createForm.account_status} onChange={(event) => setCreateForm((form) => ({ ...form, account_status: event.target.value as 'pending' | 'active' }))}><option value="pending">در انتظار تکمیل و بررسی</option><option value="active">فعال</option></Select>
          <Input label="نام و نام خانوادگی / نام نماینده" value={createForm.full_name} onChange={(event) => setCreateForm((form) => ({ ...form, full_name: event.target.value }))} />
          <Input label="شماره موبایل" value={createForm.phone} onChange={(event) => setCreateForm((form) => ({ ...form, phone: event.target.value }))} dir="ltr" inputMode="tel" placeholder="09xxxxxxxxx" />
          <Input label="ایمیل (اختیاری)" value={createForm.email} onChange={(event) => setCreateForm((form) => ({ ...form, email: event.target.value }))} dir="ltr" type="email" />
          <Input label="نام کاربری (اختیاری)" value={createForm.username} onChange={(event) => setCreateForm((form) => ({ ...form, username: event.target.value }))} dir="ltr" />
          <Input label="رمز عبور اولیه (اختیاری، حداقل ۸ کاراکتر)" value={createForm.password} onChange={(event) => setCreateForm((form) => ({ ...form, password: event.target.value }))} dir="ltr" type="password" autoComplete="new-password" />
          <div className="flex items-end"><Button type="submit" className="w-full" disabled={busy}>{busy ? t('app.loading') : 'ساخت حساب کاربر'}</Button></div>
          <p className="rounded-2xl bg-sky-50 p-4 text-xs leading-6 text-sky-800 md:col-span-2">اگر رمز وارد نشود، کاربر با کد یک‌بارمصرف شماره موبایل وارد می‌شود. اطلاعات تکمیلی هویتی و مدارک بعداً توسط کاربر یا مدیریت تکمیل می‌شوند.</p>
        </form>
      </PanelCard> : null}

      {editing ? (
        <PanelCard title={t('admin.users.editTitle')} description={editing.full_name}>
          <form className="grid gap-3 md:grid-cols-2" onSubmit={(e) => void onSaveEdit(e)}>
            <Input
              label={t('auth.fullName')}
              required
              value={editForm.full_name}
              onChange={(e) => setEditForm((f) => ({ ...f, full_name: e.target.value }))}
            />
            <Input
              label={t('auth.phone')}
              required
              value={editForm.phone}
              onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
              dir="ltr"
            />
            <Input
              label={t('auth.email')}
              value={editForm.email}
              onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
              dir="ltr"
            />
            <Input
              label={t('auth.nationalId')}
              value={editForm.national_id}
              onChange={(e) => setEditForm((f) => ({ ...f, national_id: e.target.value }))}
              dir="ltr"
            />
            <Input
              label={t('auth.companyNationalId')}
              value={editForm.company_national_id}
              onChange={(e) => setEditForm((f) => ({ ...f, company_national_id: e.target.value }))}
              dir="ltr"
            />
            <Input
              label={t('auth.economicCode')}
              value={editForm.economic_code}
              onChange={(e) => setEditForm((f) => ({ ...f, economic_code: e.target.value }))}
              dir="ltr"
            />
            <Input
              label={t('company.name')}
              value={editForm.company_name}
              onChange={(e) => setEditForm((f) => ({ ...f, company_name: e.target.value }))}
            />
            <div className="md:col-span-2">
              <Textarea
                label={t('auth.address')}
                value={editForm.address}
                onChange={(e) => setEditForm((f) => ({ ...f, address: e.target.value }))}
              />
            </div>
            <div className="md:col-span-2 flex gap-2">
              <Button type="submit" disabled={busy}>
                {busy ? t('app.loading') : t('common.save')}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                {t('common.cancel')}
              </Button>
            </div>
          </form>
        </PanelCard>
      ) : null}

      {passwordTarget ? <PanelCard title="تعیین رمز جدید حساب" description={`برای ${passwordTarget.full_name} — پس از ذخیره، نشست‌های فعال این حساب بسته می‌شوند.`}><form className="grid gap-3 md:grid-cols-2" onSubmit={(event) => void (async () => { event.preventDefault(); if (adminPassword.next.length < 8) return toast.error('رمز باید حداقل ۸ کاراکتر باشد.'); if (adminPassword.next !== adminPassword.repeat) return toast.error('تکرار رمز یکسان نیست.'); setBusy(true); const result = await backend.auth.adminSetPassword(passwordTarget.id, adminPassword.next); setBusy(false); if (result.error) return toast.error(result.error.message); setPasswordTarget(null); setAdminPassword({ next: '', repeat: '' }); toast.success('رمز جدید تنظیم و نشست‌های قبلی بسته شد.') })()}><Input label="رمز جدید" required type="password" autoComplete="new-password" value={adminPassword.next} onChange={(event) => setAdminPassword({ ...adminPassword, next: event.target.value })} /><Input label="تکرار رمز جدید" required type="password" autoComplete="new-password" value={adminPassword.repeat} onChange={(event) => setAdminPassword({ ...adminPassword, repeat: event.target.value })} /><div className="flex gap-2"><Button type="submit" disabled={busy}>تنظیم امن رمز</Button><Button type="button" variant="ghost" onClick={() => setPasswordTarget(null)}>انصراف</Button></div></form></PanelCard> : null}

      <PanelCard title={t('admin.users.listTitle')}>
        <div className="mb-5 grid gap-3 md:grid-cols-4 xl:grid-cols-7"><Input label="جست‌وجوی نام یا موبایل" value={search} onChange={(e) => setSearch(e.target.value)} /><Select label="نوع" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}><option value="all">همه</option><option value="individual">حقیقی</option><option value="legal">حقوقی</option></Select><Select label="جنسیت" value={genderFilter} onChange={(e) => setGenderFilter(e.target.value)}><option value="all">همه</option><option value="male">مرد</option><option value="female">زن</option><option value="other">سایر</option></Select><Select label="تکمیل پرونده" value={completionFilter} onChange={(e) => setCompletionFilter(e.target.value)}><option value="all">همه</option><option value="complete">تکمیل</option><option value="incomplete">ناقص</option></Select><Select label="استان" value={provinceFilter} onChange={(e) => setProvinceFilter(e.target.value)}><option value="all">همه</option>{[...new Set(participants.map((p) => p.province).filter(Boolean))].map((value) => <option key={value} value={value!}>{value}</option>)}</Select><Select label="شهر" value={cityFilter} onChange={(e) => setCityFilter(e.target.value)}><option value="all">همه</option>{[...new Set(participants.filter((p) => provinceFilter === 'all' || p.province === provinceFilter).map((p) => p.city).filter(Boolean))].map((value) => <option key={value} value={value!}>{value}</option>)}</Select><div className="flex items-end"><Button className="w-full" type="button" variant="ghost" onClick={() => { setSearch(''); setTypeFilter('all'); setGenderFilter('all'); setCompletionFilter('all'); setProvinceFilter('all'); setCityFilter('all') }}>پاک‌کردن</Button></div></div>
        {loading ? (
          <p className="text-sm text-rc-muted">{t('app.loading')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="panel-data-table w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-white/10 text-rc-muted">
                  <th className="px-2 py-2 text-start">{t('auth.fullName')}</th>
                  <th className="px-2 py-2 text-start">{t('auth.phone')}</th>
                  <th className="px-2 py-2 text-start">نوع شرکت‌کننده</th>
                  <th className="px-2 py-2 text-start">{t('admin.users.status')}</th>
                  <th className="px-2 py-2 text-start">{t('admin.users.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredParticipants.map((profile) => (
                  <tr key={profile.id} className="border-b border-white/5">
                    <td className="px-2 py-2">{profile.account_type === 'legal' ? `شرکت ${profile.company_name || participantDisplayName(profile)}` : `${profile.gender === 'female' ? 'خانم' : profile.gender === 'male' ? 'آقای' : ''} ${participantDisplayName(profile)}`.trim()}</td>
                    <td className="px-2 py-2 font-mono text-xs" dir="ltr">
                      {profile.phone}
                    </td>
                    <td className="px-2 py-2">
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${profile.account_type === 'legal' ? 'bg-violet-100 text-violet-800' : 'bg-sky-100 text-sky-800'}`}>
                        {profile.account_type === 'legal' ? 'شخص حقوقی' : 'شخص حقیقی'}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-xs font-bold">
                      <span className={`inline-flex rounded-full px-3 py-1 ${profile.account_status === 'active' && profile.identity_completed_at ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{!profile.identity_completed_at ? 'پرونده ناقص' : accountStatusLabel[profile.account_status ?? 'active'] ?? profile.account_status}</span>
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex flex-wrap gap-1">
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={busy}
                          onClick={() => openEdit(profile)}
                        >
                          {t('common.edit')}
                        </Button>
                        <Button type="button" variant="ghost" disabled={busy || !profile.email} onClick={() => void backend.auth.adminRequestPasswordReset(profile.id).then(({ error }) => error ? toast.error(error.message) : toast.success('پیوند بازنشانی رمز به ایمیل کاربر ارسال شد.'))}>بازنشانی رمز</Button>
                        <Button type="button" variant="ghost" disabled={busy} onClick={() => { setPasswordTarget(profile); setAdminPassword({ next: '', repeat: '' }) }}>تعیین رمز جدید</Button>
                        {profile.account_status === 'pending' ? (
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={busy}
                            onClick={() =>
                              void activateUserAccount(profile.id)
                                .then(reload)
                                .then(() => toast.success(t('admin.users.activated')))
                                .catch((err: Error) => {
                                  setError(err.message)
                                  toast.error(err.message)
                                })
                            }
                          >
                            {t('admin.users.activate')}
                          </Button>
                        ) : null}
                        <Button type="button" variant="danger" disabled={busy} onClick={() => void deleteUser(profile)}>حذف</Button>
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => {
                            const title = window.prompt(t('admin.users.issueTitle'))
                            if (!title) return
                            void createAccountIssue({ userId: profile.id, title })
                              .then(() => toast.success(t('admin.users.issueLogged')))
                              .catch((err: Error) => toast.error(err.message))
                          }}
                        >
                          {t('admin.users.logIssue')}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PanelCard>

      <AccountIssuesAdminList />
    </PanelPage>
  )
}
