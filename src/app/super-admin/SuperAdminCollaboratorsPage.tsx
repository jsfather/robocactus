import { useEffect, useMemo, useState } from 'react'
import { PanelPage } from '@/components/layout/PanelShell'
import { Button, PanelCard, Select } from '@/components/ui/FormControls'
import { useToast } from '@/components/ui/Toast'
import { assignLeagueAdmin, fetchAllLeagues, fetchAllProfiles, fetchLeagueAdmins, removeLeagueAdmin, setUserRole, type LeagueAdminRow } from '@/features/leagues/adminApi'
import type { League, Profile, UserRole } from '@/types/database'

export function SuperAdminCollaboratorsPage() {
  const toast = useToast()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [leagues, setLeagues] = useState<League[]>([])
  const [assignments, setAssignments] = useState<LeagueAdminRow[]>([])
  const [leagueId, setLeagueId] = useState('')
  const [userId, setUserId] = useState('')
  const [assignmentRole, setAssignmentRole] = useState<'judge' | 'head_judge' | 'operator'>('judge')
  const [busy, setBusy] = useState(false)
  const reload = async () => { const [p, l, a] = await Promise.all([fetchAllProfiles(), fetchAllLeagues(), fetchLeagueAdmins()]); setProfiles(p); setLeagues(l); setAssignments(a); if (!leagueId && l[0]) setLeagueId(l[0].id) }
  useEffect(() => { void reload().catch((e: Error) => toast.error(e.message)) }, [])
  const collaborators = useMemo(() => profiles.filter((p) => ['super_admin', 'league_admin', 'staff'].includes(p.role)), [profiles])
  const current = assignments.filter((a) => a.league_id === leagueId)
  const name = (id: string) => profiles.find((p) => p.id === id)?.full_name ?? id.slice(0, 8)
  return <PanelPage index="USR.02" title="همکاران و نقش‌های داخلی" description="مدیران، کارشناسان، داوران و اپراتورها از شرکت‌کنندگان حقیقی و حقوقی جدا مدیریت می‌شوند.">
    <PanelCard title="همکاران سامانه"><div className="grid gap-3 md:grid-cols-2">{collaborators.map((profile) => <div key={profile.id} className="flex items-center justify-between rounded-2xl border border-slate-200 p-4"><div><p className="font-black">{profile.full_name}</p><p className="mt-1 text-xs text-slate-500">{profile.phone}</p></div><Select label="نقش داخلی" value={profile.role} onChange={(e) => void setUserRole(profile.id, e.target.value as UserRole).then(reload).catch((x: Error) => toast.error(x.message))}><option value="staff">کارشناس</option><option value="league_admin">مدیر لیگ / داور</option><option value="super_admin">مدیر کل</option></Select></div>)}</div></PanelCard>
    <PanelCard title="تخصیص داور و اپراتور به لیگ" description="هر داور امتیاز مستقل ثبت می‌کند؛ مدیر نتایج فقط پس از تکمیل همه داوری‌ها قادر به انتشار است."><div className="grid gap-3 md:grid-cols-4"><Select label="لیگ" value={leagueId} onChange={(e) => setLeagueId(e.target.value)}>{leagues.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</Select><Select label="همکار" value={userId} onChange={(e) => setUserId(e.target.value)}><option value="">انتخاب کنید</option>{collaborators.filter((p) => p.role !== 'super_admin').map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</Select><Select label="مسئولیت" value={assignmentRole} onChange={(e) => setAssignmentRole(e.target.value as typeof assignmentRole)}><option value="judge">داور</option><option value="head_judge">سرداور / انتشار نتیجه</option><option value="operator">اپراتور</option></Select><div className="flex items-end"><Button className="w-full" disabled={busy || !userId} onClick={() => void (async () => { setBusy(true); try { await assignLeagueAdmin(leagueId, userId, assignmentRole); await reload(); toast.success('تخصیص ذخیره شد.') } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) } })()}>ثبت تخصیص</Button></div></div><div className="mt-5 grid gap-2">{current.map((row) => <div key={`${row.league_id}-${row.user_id}`} className="flex items-center justify-between rounded-xl bg-slate-50 p-3 text-sm"><span>{name(row.user_id)} · {row.assignment_role === 'head_judge' ? 'سرداور' : row.assignment_role === 'operator' ? 'اپراتور' : 'داور'}</span><Button variant="danger" onClick={() => void removeLeagueAdmin(row.league_id, row.user_id).then(reload)}>حذف</Button></div>)}</div></PanelCard>
  </PanelPage>
}
