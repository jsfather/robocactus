import { useEffect, useMemo, useState } from 'react'
import { PanelPage } from '@/components/layout/PanelShell'
import { Button, Input, PanelCard, Select } from '@/components/ui/FormControls'
import { PasswordField, isStrongPassword } from '@/components/auth/PasswordField'
import { backend } from '@/lib/backend'
import { useToast } from '@/components/ui/Toast'
import { assignLeagueAdmin, fetchAllLeagues, fetchAllProfiles, fetchLeagueAdmins, removeLeagueAdmin, setUserRole, type LeagueAdminRow } from '@/features/leagues/adminApi'
import type { League, Profile, UserRole } from '@/types/database'

type Department = NonNullable<Profile['staff_department']>
const departments: Array<[Department, string]> = [['support', 'پشتیبانی'], ['finance', 'امور مالی'], ['operations', 'اجرایی و عملیات'], ['content', 'محتوا و رسانه']]
const accessRoles = [['support', 'پشتیبانی'], ['finance', 'حسابداری'], ['operations', 'کارشناس ثبت‌نام'], ['judge', 'داوران']] as const
const accessSections = [['tickets', 'تیکت‌ها'], ['chat', 'چت آنلاین'], ['triage', 'بررسی اولیه تیم'], ['account_activation', 'فعال‌سازی حساب‌ها'], ['finance', 'حسابداری و پرداخت‌ها'], ['team_review', 'بررسی فنی و داوری']] as const

export function SuperAdminCollaboratorsPage() {
  const toast = useToast()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [leagues, setLeagues] = useState<League[]>([])
  const [assignments, setAssignments] = useState<LeagueAdminRow[]>([])
  const [leagueId, setLeagueId] = useState('')
  const [userId, setUserId] = useState('')
  const [assignmentRole, setAssignmentRole] = useState<'judge' | 'head_judge' | 'operator'>('judge')
  const [busy, setBusy] = useState(false)
  const [creating, setCreating] = useState(false)
  const [passwordTarget, setPasswordTarget] = useState<Profile | null>(null)
  const [passwords, setPasswords] = useState({ next: '', repeat: '' })
  const [createForm, setCreateForm] = useState({ full_name: '', phone: '', email: '', username: '', password: '', role: 'staff' as 'staff' | 'league_admin' | 'super_admin' })
  const [permissions, setPermissions] = useState<Array<{ role_key: string; section_key: string; is_enabled: boolean }>>([])

  const reload = async () => {
    const [nextProfiles, nextLeagues, nextAssignments, permissionResponse] = await Promise.all([fetchAllProfiles(), fetchAllLeagues(), fetchLeagueAdmins(), backend.from('role_section_permissions').select('*')])
    setProfiles(nextProfiles); setLeagues(nextLeagues); setAssignments(nextAssignments)
    if (permissionResponse.error) throw new Error(permissionResponse.error.message)
    setPermissions(permissionResponse.data ?? [])
    if (!leagueId && nextLeagues[0]) setLeagueId(nextLeagues[0].id)
  }
  useEffect(() => { void reload().catch((error: Error) => toast.error(error.message)) }, [])
  const collaborators = useMemo(() => profiles.filter((profile) => ['super_admin', 'league_admin', 'staff'].includes(profile.role)), [profiles])
  const current = assignments.filter((item) => item.league_id === leagueId)

  const create = async () => {
    setBusy(true)
    try {
      const result = await backend.auth.adminCreateCollaborator(createForm)
      if (result.error) throw new Error(result.error.message)
      setCreateForm({ full_name: '', phone: '', email: '', username: '', password: '', role: 'staff' }); setCreating(false)
      await reload(); toast.success('حساب همکار ساخته شد.')
    } catch (error) { toast.error((error as Error).message) } finally { setBusy(false) }
  }
  const updateDepartment = async (profile: Profile, value: Department | '') => {
    setBusy(true)
    const { error } = await backend.from('profiles').update({ staff_department: value || null }).eq('id', profile.id)
    setBusy(false)
    if (error) return toast.error(error.message)
    setProfiles((items) => items.map((item) => item.id === profile.id ? { ...item, staff_department: value || null } : item)); toast.success('واحد سازمانی ذخیره شد.')
  }
  const setPassword = async () => {
    if (!passwordTarget || !isStrongPassword(passwords.next) || passwords.next !== passwords.repeat) return
    setBusy(true); const result = await backend.auth.adminSetPassword(passwordTarget.id, passwords.next); setBusy(false)
    if (result.error) return toast.error(result.error.message)
    setPasswordTarget(null); setPasswords({ next: '', repeat: '' }); toast.success('رمز همکار تغییر کرد.')
  }
  const deleteCollaborator = async (profile: Profile) => {
    if (!window.confirm(`حساب همکار «${profile.full_name}» برای همیشه حذف شود؟`)) return
    setBusy(true); const result = await backend.auth.adminDeleteUser(profile.id); setBusy(false)
    if (result.error) return void toast.error(result.error.message === 'user_has_related_records' ? 'این همکار دارای سابقه عملیاتی، داوری یا پاسخ‌گویی است و برای حفظ سوابق قابل حذف نیست؛ دسترسی او را غیرفعال کنید.' : result.error.message === 'user_delete_failed' ? 'حذف حساب انجام نشد. جزئیات در گزارش سرور ثبت شد.' : result.error.message)
    await reload(); toast.success('حساب همکار حذف شد.')
  }
  const togglePermission = async (roleKey: string, sectionKey: string, enabled: boolean) => {
    setBusy(true)
    const { error } = await backend.from('role_section_permissions').upsert({ role_key: roleKey, section_key: sectionKey, is_enabled: enabled, updated_at: new Date().toISOString() })
    setBusy(false)
    if (error) return toast.error(error.message)
    setPermissions((rows) => [...rows.filter((row) => row.role_key !== roleKey || row.section_key !== sectionKey), { role_key: roleKey, section_key: sectionKey, is_enabled: enabled }])
    toast.success('دسترسی نقش ذخیره شد.')
  }

  return <PanelPage index="USR.02" title="همکاران و دسترسی‌های داخلی" description="نقش سیستمی و واحد سازمانی همکاران را مستقل از شرکت‌کنندگان مدیریت کنید.">
    <PanelCard title="ماتریس دسترسی نقش‌ها" description="مدیریت کل همیشه به همه بخش‌ها دسترسی دارد. دسترسی پشتیبانی، حسابداری، کارشناسان ثبت‌نام و داوران را از این جدول تعیین کنید."><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead><tr><th className="text-start">نقش</th>{accessSections.map(([, label]) => <th key={label} className="text-center">{label}</th>)}</tr></thead><tbody>{accessRoles.map(([roleKey, roleLabel]) => <tr key={roleKey}><td className="font-black text-slate-800">{roleLabel}</td>{accessSections.map(([sectionKey]) => { const checked = permissions.some((row) => row.role_key === roleKey && row.section_key === sectionKey && row.is_enabled); return <td key={sectionKey} className="text-center"><input type="checkbox" className="size-5 accent-sky-600" checked={checked} disabled={busy} onChange={(event) => void togglePermission(roleKey, sectionKey, event.target.checked)} aria-label={`${roleLabel} - ${sectionKey}`} /></td> })}</tr>)}</tbody></table></div><p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs leading-6 text-amber-900">نقش «مدیریت کل» قابل محدودکردن نیست تا همیشه امکان بازیابی و مدیریت سامانه وجود داشته باشد. داوران علاوه بر مجوز بخش داوری باید به لیگ مربوطه نیز تخصیص داده شوند.</p></PanelCard>
    <PanelCard title="همکاران سامانه" description="پشتیبانی و امور مالی واحد سازمانی‌اند؛ سطح دسترسی مشخص می‌کند همکار به چه امکاناتی دسترسی دارد." actions={<Button onClick={() => setCreating((value) => !value)}>{creating ? 'بستن فرم' : '+ افزودن همکار'}</Button>}>
      {creating ? <form className="mb-6 grid gap-3 rounded-2xl border border-sky-100 bg-sky-50/60 p-4 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); void create() }}>
        <Input label="نام و نام خانوادگی" required value={createForm.full_name} onChange={(event) => setCreateForm({ ...createForm, full_name: event.target.value })} /><Input label="شماره موبایل" required dir="ltr" value={createForm.phone} onChange={(event) => setCreateForm({ ...createForm, phone: event.target.value })} /><Input label="ایمیل" type="email" dir="ltr" value={createForm.email} onChange={(event) => setCreateForm({ ...createForm, email: event.target.value })} /><Input label="نام کاربری" dir="ltr" value={createForm.username} onChange={(event) => setCreateForm({ ...createForm, username: event.target.value })} /><PasswordField label="رمز اولیه" value={createForm.password} onChange={(value) => setCreateForm({ ...createForm, password: value })} /><Select label="سطح دسترسی" value={createForm.role} onChange={(event) => setCreateForm({ ...createForm, role: event.target.value as typeof createForm.role })}><option value="staff">کارشناس</option><option value="league_admin">مدیر لیگ / داور</option><option value="super_admin">مدیر کل</option></Select><Button type="submit" disabled={busy || !isStrongPassword(createForm.password)}>ساخت حساب همکار</Button>
      </form> : null}
      <div className="grid gap-4 md:grid-cols-2">{collaborators.map((profile) => <article key={profile.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="font-black text-slate-900">{profile.full_name}</p><p className="mt-1 text-xs text-slate-500" dir="ltr">{profile.phone}</p></div><div className="flex gap-2"><Button variant="secondary" onClick={() => { setPasswordTarget(profile); setPasswords({ next: '', repeat: '' }) }}>تغییر رمز</Button><Button variant="danger" disabled={busy || profile.role === 'super_admin'} onClick={() => void deleteCollaborator(profile)}>حذف</Button></div></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><Select label="سطح دسترسی" value={profile.role} disabled={busy} onChange={(event) => void setUserRole(profile.id, event.target.value as UserRole).then(reload).catch((error: Error) => toast.error(error.message))}><option value="staff">کارشناس</option><option value="league_admin">مدیر لیگ / داور</option><option value="super_admin">مدیر کل</option></Select><Select label="واحد سازمانی" value={profile.staff_department ?? ''} disabled={busy} onChange={(event) => void updateDepartment(profile, event.target.value as Department | '')}><option value="">تعیین نشده</option>{departments.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></div></article>)}</div>
    </PanelCard>
    {passwordTarget ? <PanelCard title={`تغییر رمز ${passwordTarget.full_name}`} description="پس از ذخیره، نشست‌های فعال این همکار بسته می‌شوند."><div className="grid gap-4 md:grid-cols-2"><PasswordField label="رمز جدید" value={passwords.next} onChange={(next) => setPasswords({ ...passwords, next })} /><PasswordField label="تکرار رمز جدید" value={passwords.repeat} onChange={(repeat) => setPasswords({ ...passwords, repeat })} confirmValue={passwords.next} /><div className="flex gap-2"><Button disabled={busy || !isStrongPassword(passwords.next) || passwords.next !== passwords.repeat} onClick={() => void setPassword()}>ذخیره رمز</Button><Button variant="ghost" onClick={() => setPasswordTarget(null)}>انصراف</Button></div></div></PanelCard> : null}
    <PanelCard title="تخصیص داور و اپراتور به لیگ" description="این مسئولیت فقط دسترسی همان لیگ را تعیین می‌کند."><div className="grid gap-3 md:grid-cols-4"><Select label="لیگ" value={leagueId} onChange={(event) => setLeagueId(event.target.value)}>{leagues.map((league) => <option key={league.id} value={league.id}>{league.name}</option>)}</Select><Select label="همکار" value={userId} onChange={(event) => setUserId(event.target.value)}><option value="">انتخاب کنید</option>{collaborators.filter((profile) => profile.role !== 'super_admin').map((profile) => <option key={profile.id} value={profile.id}>{profile.full_name}</option>)}</Select><Select label="مسئولیت" value={assignmentRole} onChange={(event) => setAssignmentRole(event.target.value as typeof assignmentRole)}><option value="judge">داور</option><option value="head_judge">سرداور</option><option value="operator">اپراتور</option></Select><Button disabled={busy || !userId} onClick={() => void assignLeagueAdmin(leagueId, userId, assignmentRole).then(reload)}>ثبت تخصیص</Button></div><div className="mt-5 grid gap-2">{current.map((row) => <div key={`${row.league_id}-${row.user_id}`} className="flex items-center justify-between rounded-xl bg-slate-50 p-3 text-sm"><span>{profiles.find((profile) => profile.id === row.user_id)?.full_name ?? row.user_id.slice(0, 8)} · {row.assignment_role}</span><Button variant="danger" onClick={() => void removeLeagueAdmin(row.league_id, row.user_id).then(reload)}>حذف</Button></div>)}</div></PanelCard>
  </PanelPage>
}
