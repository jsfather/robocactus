import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, FieldError, PanelCard, Select, StatusBadge } from '@/components/ui/FormControls'
import { PanelPage } from '@/components/layout/PanelShell'
import { StatCard } from '@/components/panel/HudKit'
import { TicketInbox } from '@/features/chat/TicketInbox'
import { DepartmentSettings } from '@/features/tickets/DepartmentSettings'
import {
  fetchTicketDepartments,
  fetchTicketStatusCounts,
  type TicketStatusCounts,
} from '@/features/tickets/api'
import { fetchTeamsForReview, reviewTeam } from '@/features/judging/api'
import { useUnreadTicketCount } from '@/hooks/useUnreadTickets'
import { useAuth } from '@/hooks/useAuth'
import type { Company, DocumentRow, Invoice, League, Profile, Team, TeamMember, TicketDepartment } from '@/types/database'
import { backend } from '@/lib/backend'
import { fetchTeamDocuments, fetchTeamMembers } from '@/features/registration/api'
import { fetchLatestInvoiceForTeam } from '@/features/payments/api'
import { safeSameOriginUrl } from '@/lib/safe-url'

type TriageDossier = { team: Team; members: TeamMember[]; documents: DocumentRow[]; invoice: Invoice | null; company: Company | null; league: League | null }

function DossierAsset({ path, bucket, label, onOpen }: { path?: string | null; bucket: 'team-documents' | 'payment-receipts'; label: string; onOpen: (url: string) => void }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    if (!path) { setUrl(''); return }
    if (/^https?:/i.test(path)) { setUrl(safeSameOriginUrl(path) ?? ''); return }
    void backend.storage.from(bucket).createSignedUrl(path, 600).then(({ data }) => setUrl(data.signedUrl ?? ''))
  }, [bucket, path])
  if (!url) return <span className="grid h-20 w-28 place-items-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-2 text-center text-[10px] text-slate-400">فایلی ثبت نشده</span>
  if (/\.pdf(?:$|\?)/i.test(path ?? '')) return <button type="button" onClick={() => window.open(url, '_blank', 'noopener,noreferrer')} className="grid h-20 w-28 place-items-center rounded-xl border border-red-100 bg-red-50 text-xs font-black text-red-700">PDF · مشاهده</button>
  return <button type="button" onClick={() => onOpen(url)} className="group relative h-20 w-28 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100"><img src={url} alt={label} className="size-full object-cover" /><span className="absolute inset-x-0 bottom-0 bg-slate-950/70 py-1 text-[9px] font-bold text-white">مشاهده</span></button>
}

export function StaffPage({ section = 'tickets' }: { section?: 'tickets' | 'triage' }) {
  const { t, i18n } = useTranslation()
  const isEn = i18n.language.startsWith('en')
  const { profile } = useAuth()
  const { count: unread } = useUnreadTicketCount()
  const [teams, setTeams] = useState<Team[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [counts, setCounts] = useState<TicketStatusCounts>({
    open: 0,
    answered: 0,
    closed: 0,
    total: 0,
  })
  const [departments, setDepartments] = useState<TicketDepartment[]>([])
  const [deptFilter, setDeptFilter] = useState('')
  const [showDeptSettings, setShowDeptSettings] = useState(false)
  const [pendingAccounts, setPendingAccounts] = useState<Profile[]>([])
  const [canActivateAccounts, setCanActivateAccounts] = useState(false)
  const [canTriageTeams, setCanTriageTeams] = useState(false)
  const [dossier, setDossier] = useState<TriageDossier | null>(null)
  const [dossierLoading, setDossierLoading] = useState(false)
  const [dossierError, setDossierError] = useState<string | null>(null)
  const [viewerUrl, setViewerUrl] = useState('')
  const tab = section
  const isSa = profile?.role === 'super_admin'

  const loadTriage = async () => {
    setLoading(true)
    setError(null)
    try {
      setTeams(await fetchTeamsForReview({ statuses: ['submitted'] }))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (tab === 'triage') {
      const roleKey = profile?.role === 'super_admin' ? null : profile?.role === 'league_admin' ? 'judge' : profile?.staff_department ?? 'operations'
      void (async () => {
        const permissionRows = profile?.role === 'super_admin' ? ['triage', 'account_activation'] : ((await backend.from('role_section_permissions').select('section_key').eq('role_key', roleKey).in('section_key', ['triage', 'account_activation']).eq('is_enabled', true)).data ?? []).map((row: { section_key: string }) => row.section_key)
        const allowAccounts = permissionRows.includes('account_activation'); const allowTeams = permissionRows.includes('triage')
        setCanActivateAccounts(allowAccounts); setCanTriageTeams(allowTeams)
        if (allowTeams) void loadTriage(); else setTeams([])
        if (allowAccounts) { const { data, error: profileError } = await backend.from('profiles').select('*').eq('account_status', 'pending').order('created_at', { ascending: true }); if (profileError) throw new Error(profileError.message); setPendingAccounts((data ?? []) as Profile[]) } else setPendingAccounts([])
      })().catch((err: Error) => setError(err.message))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, profile])

  const reviewAccount = async (account: Profile, approved: boolean) => {
    const reason = approved ? null : window.prompt('دلیل رد حساب را بنویسید:')
    if (!approved && !reason?.trim()) return
    setBusy(true); setError(null)
    const { error: reviewError } = await backend.rpc('review_user_account', { p_user_id: account.id, p_approved: approved, p_reason: reason })
    setBusy(false)
    if (reviewError) { setError(reviewError.message); return }
    setPendingAccounts((current) => current.filter((item) => item.id !== account.id))
  }

  useEffect(() => {
    if (tab !== 'tickets') return
    void fetchTicketStatusCounts()
      .then(setCounts)
      .catch(() => undefined)
    void fetchTicketDepartments(true)
      .then(setDepartments)
      .catch(() => undefined)
  }, [tab])

  const markReview = async (teamId: string) => {
    if (dossierIssues.length) {
      setDossierError(dossierIssues.join(' • '))
      return
    }
    setDossierError(null)
    setBusy(true)
    setError(null)
    try {
      const updated = await reviewTeam({ teamId, status: 'under_review' })
      setTeams((prev) => prev.filter((x) => x.id !== updated.id))
      setDossier(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      setDossierError(message.includes('team_dossier_incomplete')
        ? 'پرونده هنوز کامل نیست. اطلاعات هویتی، سرپرست، اعضا، مدارک و وضعیت پرداخت را دوباره بررسی کنید.'
        : (message || t('common.error')))
    } finally {
      setBusy(false)
    }
  }

  const openDossier = async (team: Team) => {
    setDossierLoading(true); setError(null); setDossierError(null)
    try {
      const [members, documents, invoice, companyResponse, leagueResponse] = await Promise.all([
        fetchTeamMembers(team.id), fetchTeamDocuments(team.id), fetchLatestInvoiceForTeam(team.id),
        backend.from('companies').select('*').eq('id', team.company_id).maybeSingle(),
        backend.from('leagues').select('*').eq('id', team.league_id).maybeSingle(),
      ])
      if (companyResponse.error) throw new Error(companyResponse.error.message)
      if (leagueResponse.error) throw new Error(leagueResponse.error.message)
      setDossier({ team, members: members.map((member) => ({ ...member, photo_url: safeSameOriginUrl(member.photo_url) })), documents, invoice, company: companyResponse.data as Company | null, league: leagueResponse.data as League | null })
    } catch (err) { setError(err instanceof Error ? err.message : t('common.error')) } finally { setDossierLoading(false) }
  }

  const dossierIssues = !dossier ? [] : [
    !dossier.members.some((member) => member.role === 'captain') ? (isEn ? 'Team captain is missing' : 'سرپرست تیم ثبت نشده است') : null,
    dossier.members.some((member) => !member.first_name_fa || !member.last_name_fa || !member.birth_date || !member.national_id || !member.national_id_doc_path) ? (isEn ? 'Some member identity records are incomplete' : 'اطلاعات هویتی یا مدرک برخی اعضا ناقص است') : null,
    (dossier.team.registration_progress ?? 0) < 75 ? (isEn ? 'Registration flow has not reached final review' : 'فرآیند ثبت‌نام هنوز به مرحله بررسی نهایی نرسیده است') : null,
    !dossier.invoice ? (isEn ? 'Invoice has not been issued' : 'فاکتور صادر نشده است') : null,
    dossier.invoice && dossier.invoice.status !== 'paid' && dossier.invoice.receipt_status !== 'approved' && Number(dossier.invoice.amount) > 0 ? (isEn ? 'Payment has not been confirmed' : 'پرداخت یا فیش هنوز تأیید نشده است') : null,
  ].filter((item): item is string => Boolean(item))

  return (
    <PanelPage
      index={tab === 'triage' ? 'OPS.04' : 'OPS.03'}
      title={tab === 'triage' ? t('staff.tabTriage') : t('staff.tabTickets')}
      description={t('staff.subtitle')}
      actions={
        tab === 'tickets' && isSa ? (
          <Button
            type="button"
            variant={showDeptSettings ? 'primary' : 'secondary'}
            onClick={() => setShowDeptSettings((v) => !v)}
          >
            {t('tickets.departments')}
          </Button>
        ) : undefined
      }
    >
      <FieldError message={error ?? undefined} />

      {tab === 'tickets' ? (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard index="TK.01" label={t('tickets.statusOpen')} value={counts.open} accent="orange" />
            <StatCard
              index="TK.02"
              label={t('tickets.statusAnswered')}
              value={counts.answered}
              accent="blue"
            />
            <StatCard
              index="TK.03"
              label={t('tickets.statusClosed')}
              value={counts.closed}
              accent="green"
            />
            <StatCard index="TK.04" label={t('panel.unreadTicketsShort')} value={unread} accent="red" />
          </div>

          {showDeptSettings && isSa ? (
            <div className="mb-8">
              <DepartmentSettings />
            </div>
          ) : null}

          {departments.length ? (
            <div className="mb-4 max-w-xs">
              <Select
                label={t('tickets.filterDepartment')}
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
              >
                <option value="">{t('tickets.allDepartments')}</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}

          <TicketInbox mode="staff" departmentId={deptFilter || undefined} />
        </>
      ) : (
        <div className="space-y-5">
          {canActivateAccounts ? <PanelCard title="فعال‌سازی حساب شرکت‌کنندگان" description="این صف فقط مربوط به هویت صاحب حساب حقیقی یا حقوقی است؛ تیم، داوری و پرداخت در صف‌های جدا بررسی می‌شوند."><div className="space-y-3">{pendingAccounts.map((account) => <article key={account.id} className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-black text-slate-900">{account.full_name}</h3><span className="rounded-md bg-amber-50 px-2 py-1 text-[10px] font-black text-amber-700">در انتظار فعال‌سازی</span></div><p className="mt-2 text-xs text-slate-500">{account.account_type === 'legal' ? `حقوقی · ${account.company_name || 'نام مجموعه ثبت نشده'}` : 'شخص حقیقی'} · <span dir="ltr">{account.phone}</span></p><p className="mt-1 text-xs text-slate-500">کد ملی/شناسه: {account.account_type === 'legal' ? account.company_national_id : account.national_id || '—'} · {account.city || 'شهر ثبت نشده'}</p></div><div className="flex gap-2"><Button type="button" disabled={busy} onClick={() => void reviewAccount(account, true)}>تأیید و فعال‌سازی</Button><Button type="button" variant="danger" disabled={busy} onClick={() => void reviewAccount(account, false)}>رد حساب</Button></div></article>)}{!pendingAccounts.length ? <div className="rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/60 p-8 text-center text-sm font-bold text-emerald-800">حسابی در انتظار بررسی نیست.</div> : null}</div></PanelCard> : null}
          {canTriageTeams ? <><section className="overflow-hidden rounded-[2rem] bg-gradient-to-l from-[#063d59] via-[#0873a0] to-[#087b61] p-6 text-white shadow-[0_20px_60px_rgb(8_126_184/0.18)] sm:p-8">
            <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
              <div><p className="text-xs font-black tracking-widest text-emerald-200">{isEn ? 'INITIAL TRIAGE' : 'کنترل ورودی پرونده'}</p><h2 className="mt-2 text-2xl font-black">{isEn ? 'A quick completeness check before technical review' : 'بررسی سریع کامل‌بودن پرونده، پیش از ارزیابی تخصصی'}</h2><p className="mt-3 max-w-3xl text-sm leading-7 text-sky-50/85">{isEn ? 'Check that the team has submitted the required identity details, people and documents. This stage does not approve technical eligibility and does not record scores.' : 'در این مرحله فقط وجود اطلاعات هویتی، اعضا و مدارک ضروری کنترل می‌شود. تأیید صلاحیت فنی، داوری و امتیازدهی در «بررسی تیم‌ها» انجام می‌شود.'}</p></div>
              <div className="rounded-2xl border border-white/15 bg-white/10 px-6 py-4 text-center backdrop-blur"><strong className="block text-3xl">{teams.length.toLocaleString(isEn ? 'en-US' : 'fa-IR')}</strong><span className="text-xs text-sky-100">{isEn ? 'new files' : 'پرونده جدید'}</span></div>
            </div>
          </section>

          <div className="grid gap-3 md:grid-cols-3">
            {[
              [isEn ? '1. Submitted' : '۱. ثبت‌شده', isEn ? 'A newly completed registration enters this queue.' : 'ثبت‌نام تکمیل‌شده وارد صف بررسی اولیه می‌شود.'],
              [isEn ? '2. Completeness check' : '۲. کنترل کامل‌بودن', isEn ? 'Confirm the basic profile, people and required documents exist.' : 'وجود اطلاعات پایه، افراد و مدارک ضروری را کنترل کنید.'],
              [isEn ? '3. Technical review' : '۳. ارجاع تخصصی', isEn ? 'Send a complete file to Team Review for eligibility and scoring.' : 'پرونده کامل را برای احراز صلاحیت و داوری به بررسی تیم‌ها بفرستید.'],
            ].map(([title, body], index) => <article key={title} className="relative rounded-2xl border border-sky-100 bg-white p-5 shadow-sm"><span className={`absolute start-0 top-5 h-10 w-1 rounded-e-full ${index === 2 ? 'bg-emerald-500' : 'bg-sky-500'}`} /><h3 className="font-black text-slate-900">{title}</h3><p className="mt-2 text-xs leading-6 text-slate-600">{body}</p></article>)}
          </div>

        <PanelCard title={t('staff.triageTitle')} description={isEn ? 'Only move a file forward after its basic submission is complete.' : 'پس از اطمینان از کامل‌بودن اطلاعات پایه، پرونده را به بررسی تخصصی ارجاع دهید.'}>
          {loading ? (
            <p className="text-sm text-rc-muted">{t('app.loading')}</p>
          ) : teams.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/60 px-5 py-10 text-center"><span className="mx-auto grid size-12 place-items-center rounded-2xl bg-white text-emerald-600 shadow-sm">✓</span><p className="mt-3 font-black text-slate-800">{t('staff.triageEmpty')}</p><p className="mt-1 text-xs text-slate-500">{isEn ? 'There is no registration waiting for an initial check.' : 'در حال حاضر پرونده‌ای منتظر کنترل اولیه نیست.'}</p></div>
          ) : (
            <ul className="divide-y divide-rc-line">
              {teams.map((team) => (
                <li key={team.id} className="my-3 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-sky-100 bg-gradient-to-l from-white to-sky-50/60 p-4 shadow-sm">
                  <div>
                    <p className="font-medium">{team.name}</p>
                    <StatusBadge
                      status={team.status}
                      label={t(`team.statuses.${team.status}`, { defaultValue: team.status })}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy || dossierLoading}
                    onClick={() => void openDossier(team)}
                  >
                    {isEn ? 'Open dossier' : 'مشاهده پرونده و بررسی'}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </PanelCard></> : null}
        </div>
      )}
      {dossier ? <div className="fixed inset-0 z-[180] flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true" onMouseDown={(event) => { if (event.target === event.currentTarget) setDossier(null) }}>
        <div className="flex max-h-[92dvh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-slate-50 shadow-2xl">
          <header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 sm:px-7"><div className="min-w-0"><p className="text-xs font-black text-sky-700">بررسی اولیه ← پرونده کامل تیم</p><h2 className="mt-1 truncate text-xl font-black text-slate-950">{dossier.team.name}</h2><p className="mt-1 text-xs text-slate-500">{dossier.league?.name ?? 'لیگ نامشخص'} · {dossier.company?.name ?? 'مجموعه نامشخص'}</p></div><button type="button" onClick={() => setDossier(null)} className="grid size-10 shrink-0 place-items-center rounded-full border border-slate-200 text-xl" aria-label="بستن">×</button></header>
          <div className="overflow-y-auto p-4 sm:p-7">
            {dossierError ? <div className="mb-4"><FieldError message={dossierError} /></div> : null}
            {dossierIssues.length ? <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4"><p className="text-sm font-black text-amber-900">{isEn ? 'Complete these items before referral:' : 'پیش از ارجاع این موارد را تکمیل کنید:'}</p><ul className="mt-2 list-disc space-y-1 ps-5 text-xs leading-6 text-amber-800">{dossierIssues.map((issue) => <li key={issue}>{issue}</li>)}</ul></div> : null}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[
              ['وضعیت پرونده', t(`team.statuses.${dossier.team.status}`, { defaultValue: dossier.team.status })],
              ['تعداد اعضا', `${dossier.members.length.toLocaleString('fa-IR')} نفر`],
              ['مبلغ فاکتور', dossier.invoice ? `${Number(dossier.invoice.amount).toLocaleString('fa-IR')} ریال` : 'فاکتور صادر نشده'],
              ['وضعیت پرداخت', dossier.invoice?.status === 'paid' ? 'پرداخت‌شده' : dossier.invoice?.receipt_status === 'pending_review' ? 'فیش در انتظار بررسی' : 'پرداخت نشده'],
            ].map(([label, value]) => <div key={label} className="border-s-4 border-sky-500 bg-white px-4 py-3 shadow-sm"><span className="block text-[11px] font-bold text-slate-500">{label}</span><strong className="mt-1 block text-sm text-slate-900">{value}</strong></div>)}</div>
            <section className="mt-6"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="font-black text-slate-900">اعضای تیم و مدارک هویتی</h3><span className="text-xs text-slate-500">تصاویر بندانگشتی‌اند؛ برای مشاهده انتخاب کنید</span></div><div className="grid gap-3 lg:grid-cols-2">{dossier.members.map((member) => { const name = `${member.first_name_fa ?? member.first_name ?? ''} ${member.last_name_fa ?? member.last_name ?? ''}`.trim() || member.full_name; return <article key={member.id} className="flex min-w-0 items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3"><div className="size-14 shrink-0 overflow-hidden rounded-xl bg-sky-50">{member.photo_url ? <button type="button" className="size-full" onClick={() => setViewerUrl(member.photo_url!)}><img src={member.photo_url} alt={name} className="size-full object-cover" /></button> : <span className="grid size-full place-items-center font-black text-sky-700">{name.slice(0, 1)}</span>}</div><div className="min-w-0 flex-1"><strong className="block truncate text-sm text-slate-900">{name}</strong><span className="mt-1 block text-xs text-slate-500">{member.role === 'captain' ? 'سرپرست' : member.role === 'coach' ? 'مربی' : 'عضو تیم'} · {member.national_id ?? 'شناسه ثبت نشده'}</span><span className={`mt-2 inline-flex rounded-md px-2 py-1 text-[10px] font-bold ${member.national_id_doc_path && member.birth_date ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{member.national_id_doc_path && member.birth_date ? 'اطلاعات پایه کامل' : 'نیازمند تکمیل'}</span></div><DossierAsset path={member.national_id_doc_path} bucket="team-documents" label={`مدرک ${name}`} onOpen={setViewerUrl} /></article>})}{!dossier.members.length ? <p className="rounded-xl border border-dashed border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">هیچ عضوی برای این تیم ثبت نشده است.</p> : null}</div></section>
            <section className="mt-6"><h3 className="mb-3 font-black text-slate-900">مدارک تیم</h3><div className="flex flex-wrap gap-3">{dossier.documents.map((doc) => <article key={doc.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3"><DossierAsset path={doc.file_path} bucket="team-documents" label={doc.doc_type} onOpen={setViewerUrl} /><div className="max-w-44 min-w-0"><strong className="block truncate text-xs text-slate-800">{doc.doc_type === 'team_logo' ? 'لوگوی تیم' : doc.doc_type}</strong><span className="mt-1 block truncate text-[10px] text-slate-400" dir="ltr">{doc.file_path.split('/').pop()}</span></div></article>)}{!dossier.documents.length ? <p className="text-sm text-slate-500">مدرک مستقلی برای تیم ثبت نشده است.</p> : null}</div></section>
            <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4"><h3 className="font-black text-slate-900">پرداخت و فیش واریزی</h3>{dossier.invoice ? <div className="mt-3 flex flex-wrap items-center justify-between gap-4"><div className="text-xs leading-6 text-slate-600"><p>شماره فاکتور: <strong>{dossier.invoice.invoice_number ?? '—'}</strong></p><p>روش پرداخت: <strong>{dossier.invoice.payment_method === 'card_to_card' ? 'کارت به کارت' : 'آنلاین'}</strong></p><p>وضعیت: <strong>{dossier.invoice.status === 'paid' ? 'پرداخت‌شده' : dossier.invoice.receipt_status === 'rejected' ? 'فیش ردشده' : dossier.invoice.receipt_status === 'pending_review' ? 'فیش در انتظار بررسی' : 'پرداخت نشده'}</strong></p></div>{dossier.invoice.receipt_path ? <DossierAsset path={dossier.invoice.receipt_path} bucket="payment-receipts" label="فیش پرداخت" onOpen={setViewerUrl} /> : <span className="rounded-xl bg-slate-100 px-4 py-3 text-xs text-slate-500">فیش کارت‌به‌کارت ثبت نشده</span>}</div> : <p className="mt-3 text-sm text-amber-700">هنوز فاکتوری برای این تیم صادر نشده است.</p>}</section>
          </div>
          <footer className="flex flex-col gap-3 border-t border-slate-200 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7"><p className="text-xs leading-6 text-slate-500">پس از کنترل اطلاعات، اعضا، مدارک و پرداخت، پرونده را به بررسی تخصصی ارجاع دهید.</p><div className="flex gap-2"><Button type="button" variant="secondary" onClick={() => setDossier(null)}>بستن</Button><Button type="button" disabled={busy || dossierIssues.length > 0} onClick={() => void markReview(dossier.team.id)}>{busy ? 'در حال ارسال…' : 'تأیید کامل بودن و ارسال به بررسی تیم‌ها'}</Button></div></footer>
        </div>
      </div> : null}
      {viewerUrl ? <div className="fixed inset-0 z-[200] grid place-items-center bg-slate-950/85 p-4" role="dialog" aria-modal="true" onMouseDown={(event) => { if (event.target === event.currentTarget) setViewerUrl('') }}><div className="relative max-h-[90dvh] max-w-4xl overflow-hidden rounded-2xl bg-white p-2"><button type="button" className="absolute end-4 top-4 z-10 grid size-10 place-items-center rounded-full bg-slate-950/75 text-xl text-white" onClick={() => setViewerUrl('')}>×</button><img src={viewerUrl} alt="نمایش مدرک" className="max-h-[86dvh] max-w-full rounded-xl object-contain" /></div></div> : null}
    </PanelPage>
  )
}
