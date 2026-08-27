import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, FieldError, Input, PanelCard, Select, Textarea } from '@/components/ui/FormControls'
import {
  adminUpdateProfile,
  assignLeagueAdmin,
  fetchAllLeagues,
  fetchAllProfiles,
  fetchLeagueAdmins,
  removeLeagueAdmin,
  setUserRole,
  type LeagueAdminRow,
} from '@/features/leagues/adminApi'
import { activateUserAccount, createAccountIssue } from '@/features/notifications/api'
import { AccountIssuesAdminList } from '@/features/account-issues/AccountIssuesPanel'
import { useToast } from '@/components/ui/Toast'
import type { League, Profile, UserRole } from '@/types/database'
import { PanelPage } from '@/components/layout/PanelShell'
import { StatCard } from '@/components/panel/HudKit'
import { backend } from '@/lib/backend'

const ALL_ROLES: UserRole[] = ['company_admin', 'team_captain']

export function SuperAdminUsersPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [leagues, setLeagues] = useState<League[]>([])
  const [admins, setAdmins] = useState<LeagueAdminRow[]>([])
  const [selectedLeague, setSelectedLeague] = useState('')
  const [assignUserId, setAssignUserId] = useState('')
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
  const [createForm, setCreateForm] = useState({ full_name: '', phone: '', email: '', username: '', password: '', account_type: 'individual' as 'individual' | 'legal', account_status: 'pending' as 'pending' | 'active' })
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [genderFilter, setGenderFilter] = useState('all')
  const [completionFilter, setCompletionFilter] = useState('all')

  const participants = useMemo(() => profiles.filter((profile) => ['company_admin', 'team_captain'].includes(profile.role)), [profiles])
  const filteredParticipants = useMemo(() => participants.filter((profile) => {
    const haystack = `${profile.full_name} ${profile.phone} ${profile.email ?? ''} ${profile.province ?? ''} ${profile.city ?? ''}`.toLowerCase()
    return (!search.trim() || haystack.includes(search.trim().toLowerCase()))
      && (typeFilter === 'all' || profile.account_type === typeFilter)
      && (genderFilter === 'all' || profile.gender === genderFilter)
      && (completionFilter === 'all' || (completionFilter === 'complete' ? Boolean(profile.identity_completed_at) : !profile.identity_completed_at))
  }), [participants, search, typeFilter, genderFilter, completionFilter])

  const reload = async () => {
    setLoading(true)
    setError(null)
    try {
      const [p, l, a] = await Promise.all([
        fetchAllProfiles(),
        fetchAllLeagues(),
        fetchLeagueAdmins(),
      ])
      setProfiles(p)
      setLeagues(l)
      setAdmins(a)
      if (!selectedLeague && l[0]) setSelectedLeague(l[0].id)
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

  const leagueAdmins = useMemo(
    () => admins.filter((a) => a.league_id === selectedLeague),
    [admins, selectedLeague],
  )

  const profileName = (id: string) => {
    const p = profiles.find((x) => x.id === id)
    return p ? `${p.full_name} (${p.phone})` : id.slice(0, 8)
  }

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

  const onRoleChange = async (userId: string, role: UserRole) => {
    setBusy(true)
    setError(null)
    try {
      const updated = await setUserRole(userId, role)
      setProfiles((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  const onAssign = async () => {
    if (!selectedLeague || !assignUserId) return
    setBusy(true)
    setError(null)
    try {
      await assignLeagueAdmin(selectedLeague, assignUserId)
      setAssignUserId('')
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  const onRemove = async (userId: string) => {
    if (!selectedLeague) return
    setBusy(true)
    try {
      await removeLeagueAdmin(selectedLeague, userId)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  const onCreateUser = async (event: FormEvent) => {
    event.preventDefault()
    if (!createForm.full_name.trim() || !/^09\d{9}$/.test(createForm.phone.trim())) {
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

  return (
    <PanelPage index="USR.01" title={t('admin.users.title')} description="مدیریت حساب شرکت‌کنندگان حقیقی و حقوقی؛ اعضای مدیریتی از بخش نقش‌ها مدیریت می‌شوند." actions={<Button type="button" onClick={() => setCreating((value) => !value)}>{creating ? 'بستن فرم' : '+ افزودن کاربر'}</Button>}>

      <FieldError message={error ?? undefined} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard index="01" label="کل کاربران" value={profiles.length} hint="تمام حساب‌های ثبت‌شده" />
        <StatCard index="02" label="در انتظار فعال‌سازی" value={profiles.filter((profile) => profile.account_status === 'pending').length} hint="نیازمند بررسی مدیریت" accent="orange" />
        <StatCard index="03" label="مدیران شرکت" value={profiles.filter((profile) => profile.role === 'company_admin').length} hint="حساب‌های حقوقی و سازمانی" accent="green" />
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

      <PanelCard title={t('admin.users.listTitle')}>
        <div className="mb-5 grid gap-3 md:grid-cols-5"><Input label="جست‌وجوی نام، موبایل یا شهر" value={search} onChange={(e) => setSearch(e.target.value)} /><Select label="نوع" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}><option value="all">همه</option><option value="individual">حقیقی</option><option value="legal">حقوقی</option></Select><Select label="جنسیت" value={genderFilter} onChange={(e) => setGenderFilter(e.target.value)}><option value="all">همه</option><option value="male">مرد</option><option value="female">زن</option><option value="other">سایر</option></Select><Select label="تکمیل پرونده" value={completionFilter} onChange={(e) => setCompletionFilter(e.target.value)}><option value="all">همه</option><option value="complete">تکمیل</option><option value="incomplete">ناقص</option></Select><div className="flex items-end"><Button className="w-full" type="button" variant="ghost" onClick={() => { setSearch(''); setTypeFilter('all'); setGenderFilter('all'); setCompletionFilter('all') }}>پاک‌کردن فیلتر</Button></div></div>
        {loading ? (
          <p className="text-sm text-rc-muted">{t('app.loading')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="panel-data-table w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-white/10 text-rc-muted">
                  <th className="px-2 py-2 text-start">{t('auth.fullName')}</th>
                  <th className="px-2 py-2 text-start">{t('auth.phone')}</th>
                  <th className="px-2 py-2 text-start">{t('dashboard.role')}</th>
                  <th className="px-2 py-2 text-start">{t('admin.users.status')}</th>
                  <th className="px-2 py-2 text-start">{t('admin.users.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredParticipants.map((profile) => (
                  <tr key={profile.id} className="border-b border-white/5">
                    <td className="px-2 py-2">{profile.full_name}</td>
                    <td className="px-2 py-2 font-mono text-xs" dir="ltr">
                      {profile.phone}
                    </td>
                    <td className="px-2 py-2">
                      <select
                        className="rounded-md border border-white/10 bg-rc-navy px-2 py-1.5 text-sm"
                        value={profile.role}
                        disabled={busy}
                        onChange={(e) =>
                          void onRoleChange(profile.id, e.target.value as UserRole)
                        }
                      >
                        {ALL_ROLES.map((role) => (
                          <option key={role} value={role}>
                            {t(`dashboard.roles.${role}`)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-2 font-mono text-xs">
                      {profile.account_status ?? 'active'}
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

      <PanelCard title={t('admin.users.assignTitle')} description={t('admin.users.assignHint')}>
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <Select
            label={t('team.league')}
            value={selectedLeague}
            onChange={(e) => setSelectedLeague(e.target.value)}
          >
            <option value="">{t('team.selectLeague')}</option>
            {leagues.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
          <Select
            label={t('admin.users.pickUser')}
            value={assignUserId}
            onChange={(e) => setAssignUserId(e.target.value)}
          >
            <option value="">{t('admin.users.pickUserPlaceholder')}</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name} — {p.phone}
              </option>
            ))}
          </Select>
          <Button type="button" onClick={() => void onAssign()} disabled={busy || !assignUserId}>
            {t('admin.users.assignCta')}
          </Button>
        </div>

        <ul className="mt-4 divide-y divide-white/5">
          {leagueAdmins.length === 0 ? (
            <li className="py-2 text-sm text-rc-muted">{t('admin.users.noAdmins')}</li>
          ) : (
            leagueAdmins.map((row) => (
              <li key={`${row.league_id}-${row.user_id}`} className="flex items-center justify-between py-2">
                <span className="text-sm">{profileName(row.user_id)}</span>
                <Button
                  type="button"
                  variant="danger"
                  onClick={() => void onRemove(row.user_id)}
                  disabled={busy}
                >
                  {t('common.delete')}
                </Button>
              </li>
            ))
          )}
        </ul>
      </PanelCard>

      <AccountIssuesAdminList />
    </PanelPage>
  )
}
