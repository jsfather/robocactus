import { useEffect, useMemo, useState } from 'react'
import { PanelPage } from '@/components/layout/PanelShell'
import { Button, FieldError, Input, PanelCard, Select } from '@/components/ui/FormControls'
import { useToast } from '@/components/ui/Toast'
import { dispatchPendingSms } from '@/features/notifications/api'
import { backend } from '@/lib/backend'
import { formatAppDateTime } from '@/lib/dates'
import type { DocumentRow, Invoice, League, Profile, Team } from '@/types/database'

type Reminder = { reminder_type: string; template_key: string; is_active: boolean; delay_hours: number; max_sends: number; interval_hours: number; variables: string[] }
const stageLabel: Record<string, string> = { draft: 'شروع‌شده', incomplete: 'اطلاعات ناقص', awaiting_documents: 'در انتظار مدارک', awaiting_review: 'در انتظار بررسی', awaiting_payment: 'در انتظار پرداخت' }
const reminderLabel: Record<string, string> = { incomplete_registration: 'تکمیل ثبت‌نام', team_approval: 'تأیید تیم', account_verification: 'تأیید حساب', payment: 'پرداخت' }

export function SuperAdminIncompleteRegistrationsPage() {
  const toast = useToast()
  const [teams, setTeams] = useState<Team[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [leagues, setLeagues] = useState<League[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [documents, setDocuments] = useState<DocumentRow[]>([])
  const [settings, setSettings] = useState<Reminder[]>([])
  const [query, setQuery] = useState('')
  const [leagueId, setLeagueId] = useState('')
  const [stage, setStage] = useState('')
  const [abandonedHours, setAbandonedHours] = useState('')
  const [accountStatus, setAccountStatus] = useState('')
  const [paymentStatus, setPaymentStatus] = useState('')
  const [teamStatus, setTeamStatus] = useState('')
  const [sort, setSort] = useState<'recent' | 'oldest' | 'progress'>('oldest')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = async () => {
    const results = await Promise.all([
      backend.from('teams').select('*').in('lifecycle_status', ['draft', 'incomplete', 'awaiting_documents', 'awaiting_review', 'awaiting_payment']).order('last_activity_at'),
      backend.from('profiles').select('*'), backend.from('leagues').select('*'),
      backend.from('invoices').select('*').order('created_at', { ascending: false }),
      backend.from('documents').select('*'),
      backend.from('registration_reminder_settings').select('*').order('reminder_type'),
    ])
    const failed = results.find((result) => result.error)
    if (failed?.error) throw new Error(failed.error.message)
    setTeams((results[0].data ?? []) as Team[]); setProfiles((results[1].data ?? []) as Profile[])
    setLeagues((results[2].data ?? []) as League[]); setInvoices((results[3].data ?? []) as Invoice[])
    setDocuments((results[4].data ?? []) as DocumentRow[]); setSettings((results[5].data ?? []) as Reminder[])
  }
  useEffect(() => { void load().catch((reason: Error) => setError(reason.message)) }, [])

  const rows = useMemo(() => teams.filter((team) => {
    const profile = profiles.find((item) => item.id === team.captain_id)
    const league = leagues.find((item) => item.id === team.league_id)
    const invoice = invoices.find((item) => item.team_id === team.id)
    const text = `${team.name} ${profile?.full_name ?? ''} ${profile?.phone ?? ''} ${league?.name ?? ''}`.toLowerCase()
    const inactiveHours = (Date.now() - new Date(team.last_activity_at ?? team.created_at).getTime()) / 3_600_000
    return (!leagueId || team.league_id === leagueId) && (!stage || team.lifecycle_status === stage) && (!teamStatus || team.status === teamStatus) && (!accountStatus || profile?.account_status === accountStatus) && (!paymentStatus || (invoice?.status ?? 'none') === paymentStatus) && (!abandonedHours || inactiveHours >= Number(abandonedHours)) && (!query || text.includes(query.toLowerCase()))
  }).sort((a, b) => sort === 'progress' ? Number(b.registration_progress ?? 0) - Number(a.registration_progress ?? 0) : sort === 'recent' ? new Date(b.last_activity_at ?? b.created_at).getTime() - new Date(a.last_activity_at ?? a.created_at).getTime() : new Date(a.last_activity_at ?? a.created_at).getTime() - new Date(b.last_activity_at ?? b.created_at).getTime()), [teams, profiles, leagues, invoices, leagueId, stage, teamStatus, accountStatus, paymentStatus, abandonedHours, query, sort])

  const send = async (teamId: string, type: string) => {
    setBusy(true)
    try {
      const response = await backend.rpc('enqueue_registration_reminder', { p_team_id: teamId, p_reminder_type: type })
      if (response.error) throw new Error(response.error.message)
      if (!response.data) return toast.info('طبق محدودیت زمانی یا سقف ارسال، فعلاً یادآوری جدید مجاز نیست.')
      await dispatchPendingSms().catch(() => undefined)
      toast.success('یادآوری در صف ارسال قرار گرفت.')
    } catch (reason) { toast.error(reason instanceof Error ? reason.message : 'ارسال یادآوری ناموفق بود.') }
    finally { setBusy(false) }
  }
  const patch = (index: number, value: Partial<Reminder>) => setSettings((items) => items.map((item, i) => i === index ? { ...item, ...value } : item))
  const save = async () => {
    setBusy(true)
    try {
      for (const item of settings) {
        const result = await backend.from('registration_reminder_settings').update({ ...item, updated_at: new Date().toISOString() }).eq('reminder_type', item.reminder_type)
        if (result.error) throw new Error(result.error.message)
      }
      toast.success('تنظیمات یادآوری ذخیره شد.')
    } catch (reason) { toast.error(reason instanceof Error ? reason.message : 'ذخیره تنظیمات ناموفق بود.') }
    finally { setBusy(false) }
  }

  return <PanelPage index="REG.LIFE" title="ثبت‌نام‌های ناقص و رهاشده" description="مشاهده آخرین مرحله، میزان پیشرفت و پیگیری امن بدون پیامک تکراری">
    <FieldError message={error ?? undefined} />
    <div className="grid gap-4 sm:grid-cols-3"><Metric label="پرونده ناقص" value={teams.length} /><Metric label="در انتظار پرداخت" value={teams.filter((team) => team.lifecycle_status === 'awaiting_payment').length} /><Metric label="بدون فعالیت بیش از ۷۲ ساعت" value={teams.filter((team) => Date.now() - new Date(team.last_activity_at ?? team.created_at).getTime() > 259_200_000).length} /></div>
    <PanelCard title="جست‌وجو و فیلتر"><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><Input label="نام، تیم یا موبایل" value={query} onChange={(event) => setQuery(event.target.value)} /><Select label="لیگ" value={leagueId} onChange={(event) => setLeagueId(event.target.value)}><option value="">همه لیگ‌ها</option>{leagues.map((league) => <option key={league.id} value={league.id}>{league.name}</option>)}</Select><Select label="مرحله ثبت‌نام" value={stage} onChange={(event) => setStage(event.target.value)}><option value="">همه مراحل</option>{Object.entries(stageLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select><Select label="مدت رهاشدن" value={abandonedHours} onChange={(event) => setAbandonedHours(event.target.value)}><option value="">بدون محدودیت</option><option value="24">بیش از ۲۴ ساعت</option><option value="72">بیش از ۳ روز</option><option value="168">بیش از ۷ روز</option></Select><Select label="وضعیت تیم" value={teamStatus} onChange={(event) => setTeamStatus(event.target.value)}><option value="">همه وضعیت‌ها</option><option value="draft">پیش‌نویس</option><option value="submitted">ارسال‌شده</option><option value="under_review">در حال بررسی</option><option value="approved">تأییدشده</option><option value="rejected">ردشده</option></Select><Select label="وضعیت حساب" value={accountStatus} onChange={(event) => setAccountStatus(event.target.value)}><option value="">همه حساب‌ها</option><option value="pending">تکمیل‌نشده</option><option value="approved">تأییدشده</option><option value="rejected">ردشده</option></Select><Select label="وضعیت پرداخت" value={paymentStatus} onChange={(event) => setPaymentStatus(event.target.value)}><option value="">همه پرداخت‌ها</option><option value="none">بدون صورتحساب</option><option value="pending">در انتظار پرداخت</option><option value="paid">پرداخت‌شده</option><option value="failed">ناموفق</option></Select><Select label="مرتب‌سازی" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="oldest">قدیمی‌ترین فعالیت</option><option value="recent">جدیدترین فعالیت</option><option value="progress">بیشترین پیشرفت</option></Select></div></PanelCard>
    <PanelCard title="پرونده‌های نیازمند پیگیری" description={`${rows.length.toLocaleString('fa-IR')} پرونده`}><div className="space-y-3">{rows.map((team) => { const profile = profiles.find((item) => item.id === team.captain_id); const league = leagues.find((item) => item.id === team.league_id); const invoice = invoices.find((item) => item.team_id === team.id); const documentCount = documents.filter((item) => item.team_id === team.id).length; return <article key={team.id} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"><div className="flex flex-wrap justify-between gap-3"><div><h3 className="font-black text-slate-800">{team.name} <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] text-amber-700">{stageLabel[team.lifecycle_status ?? 'draft']}</span></h3><p className="mt-2 text-sm text-slate-500">{profile?.full_name} · <span dir="ltr">{profile?.phone}</span> · {league?.name}</p><p className="mt-2 text-xs text-slate-400">شروع ثبت‌نام: {formatAppDateTime(team.registration_started_at ?? team.created_at)} · مدارک: {documentCount ? `${documentCount.toLocaleString('fa-IR')} فایل` : 'بارگذاری نشده'} · وضعیت تیم: {team.status}</p></div><div className="text-xs leading-6 text-slate-500">آخرین فعالیت: {formatAppDateTime(team.last_activity_at ?? team.created_at)}<br />حساب: {profile?.account_status ?? '—'} · فاکتور: {invoice?.status ?? 'صادر نشده'} · {Number(invoice?.amount ?? 0).toLocaleString('fa-IR')} ریال</div></div><div className="mt-4"><div className="mb-2 flex justify-between text-xs font-bold"><span>{stageLabel[team.lifecycle_status ?? 'draft']}</span><span>{Number(team.registration_progress ?? 0).toLocaleString('fa-IR')}٪</span></div><div className="h-2 rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-l from-sky-500 to-emerald-500" style={{ width: `${team.registration_progress ?? 0}%` }} /></div></div><div className="mt-4 flex flex-wrap gap-2">{settings.filter((setting) => setting.is_active).map((setting) => <Button key={setting.reminder_type} type="button" variant="secondary" disabled={busy} onClick={() => void send(team.id, setting.reminder_type)}>یادآوری {reminderLabel[setting.reminder_type]}</Button>)}</div></article> })}{!rows.length ? <p className="py-10 text-center text-slate-500">موردی یافت نشد.</p> : null}</div></PanelCard>
    <PanelCard title="تنظیمات یادآوری کاوه‌نگار" description="نام الگو، متغیرها، تأخیر و کنترل تعداد ارسال"><div className="grid gap-4 lg:grid-cols-2">{settings.map((setting, index) => <div key={setting.reminder_type} className="rounded-2xl border border-slate-100 bg-slate-50 p-4"><div className="mb-3 flex justify-between"><b>{reminderLabel[setting.reminder_type]}</b><label className="text-xs"><input type="checkbox" checked={setting.is_active} onChange={(event) => patch(index, { is_active: event.target.checked })} /> فعال</label></div><Input label="نام الگوی کاوه‌نگار" value={setting.template_key} onChange={(event) => patch(index, { template_key: event.target.value })} dir="ltr" /><div className="mt-3"><Input label="متغیرها (با ویرگول جدا کنید)" value={setting.variables.join(', ')} onChange={(event) => patch(index, { variables: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) })} dir="ltr" /></div><div className="mt-3 grid grid-cols-3 gap-2"><Input label="تأخیر (ساعت)" type="number" value={setting.delay_hours} onChange={(event) => patch(index, { delay_hours: +event.target.value })} /><Input label="حداکثر ارسال" type="number" value={setting.max_sends} onChange={(event) => patch(index, { max_sends: +event.target.value })} /><Input label="فاصله (ساعت)" type="number" value={setting.interval_hours} onChange={(event) => patch(index, { interval_hours: +event.target.value })} /></div></div>)}</div><Button type="button" className="mt-5" disabled={busy} onClick={() => void save()}>ذخیره تنظیمات</Button></PanelCard>
  </PanelPage>
}
function Metric({ label, value }: { label: string; value: number }) { return <div className="rounded-2xl border border-amber-100 bg-gradient-to-l from-amber-50 to-white p-5"><p className="text-xs font-bold text-amber-700">{label}</p><p className="mt-1 text-3xl font-black text-slate-900">{value.toLocaleString('fa-IR')}</p></div> }
