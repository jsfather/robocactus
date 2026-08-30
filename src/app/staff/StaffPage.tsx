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
import type { Profile, Team, TicketDepartment } from '@/types/database'
import { backend } from '@/lib/backend'

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
    setBusy(true)
    setError(null)
    try {
      const updated = await reviewTeam({ teamId, status: 'under_review' })
      setTeams((prev) => prev.filter((x) => x.id !== updated.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setBusy(false)
    }
  }

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
                    disabled={busy}
                    onClick={() => void markReview(team.id)}
                  >
                    {isEn ? 'Send to Team Review' : 'ارسال به بررسی تیم‌ها'}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </PanelCard></> : null}
        </div>
      )}
    </PanelPage>
  )
}
