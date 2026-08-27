import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PanelPage } from '@/components/layout/PanelShell'
import { FieldError, PanelCard, StatusBadge } from '@/components/ui/FormControls'
import { useAuth } from '@/hooks/useAuth'
import { backend } from '@/lib/backend'
import { formatAppDateTime } from '@/lib/dates'
import { formatAmountToman } from '@/features/payments/api'
import type { Invoice, League, Team } from '@/types/database'

const paymentLabelsFa: Record<string, string> = {
  pending: 'در انتظار پرداخت',
  paid: 'پرداخت‌شده',
  failed: 'ناموفق',
  refunded: 'بازگشت وجه',
}
const paymentLabelsEn: Record<string, string> = { pending: 'Awaiting payment', paid: 'Paid', failed: 'Failed', refunded: 'Refunded' }

const methodLabelsFa: Record<string, string> = {
  online: 'پرداخت آنلاین',
  card_to_card: 'کارت‌به‌کارت',
}
const methodLabelsEn: Record<string, string> = { online: 'Online payment', card_to_card: 'Card transfer' }

export function AccountInvoicesPage() {
  const { invoiceId } = useParams()
  const { i18n } = useTranslation()
  const fa = i18n.language.startsWith('fa')
  const paymentLabels = fa ? paymentLabelsFa : paymentLabelsEn
  const methodLabels = fa ? methodLabelsFa : methodLabelsEn
  const currency = fa ? 'ریال' : 'IRR'
  const { user, loading: authLoading } = useAuth()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [leagues, setLeagues] = useState<League[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (authLoading || !user) return
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const invoiceResult = await backend.from('invoices').select('*').is('archived_at', null).order('created_at', { ascending: false })
        if (invoiceResult.error) throw new Error(invoiceResult.error.message)
        const invoiceRows = (invoiceResult.data ?? []) as Invoice[]
        const teamIds = [...new Set(invoiceRows.map((row) => row.team_id))]
        const teamResult = teamIds.length ? await backend.from('teams').select('*').in('id', teamIds) : { data: [], error: null }
        if (teamResult.error) throw new Error(teamResult.error.message)
        const teamRows = (teamResult.data ?? []) as Team[]
        const leagueIds = [...new Set(teamRows.map((row) => row.league_id))]
        const leagueResult = leagueIds.length ? await backend.from('leagues').select('*').in('id', leagueIds) : { data: [], error: null }
        if (leagueResult.error) throw new Error(leagueResult.error.message)
        setInvoices(invoiceRows)
        setTeams(teamRows)
        setLeagues((leagueResult.data ?? []) as League[])
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'دریافت صورتحساب‌ها ناموفق بود.')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [authLoading, user])

  const selected = useMemo(() => invoices.find((row) => row.id === invoiceId) ?? null, [invoiceId, invoices])
  const teamFor = (row: Invoice) => teams.find((team) => team.id === row.team_id)
  const leagueFor = (row: Invoice) => leagues.find((league) => league.id === teamFor(row)?.league_id)

  if (authLoading || loading) return <div className="px-4 py-12 text-center text-rc-muted">{fa ? 'در حال دریافت صورتحساب‌ها…' : 'Loading invoices…'}</div>

  if (invoiceId) {
    if (!selected) return <PanelPage title={fa ? 'جزئیات صورتحساب' : 'Invoice details'} index="AC.02"><FieldError message={error ?? (fa ? 'این صورتحساب پیدا نشد یا اجازه مشاهده آن را ندارید.' : 'Invoice not found or you do not have access.')} /><Link className="mt-5 inline-block text-sm font-bold text-rc-blue" to="/account/invoices">{fa ? 'بازگشت به صورتحساب‌ها' : 'Back to invoices'}</Link></PanelPage>
    const team = teamFor(selected)
    const league = leagueFor(selected)
    return <PanelPage title={`${fa ? 'صورتحساب' : 'Invoice'} ${selected.invoice_number ?? ''}`} description={fa ? 'جزئیات مالی ثبت‌نام لیگ' : 'League registration billing details'} index="AC.02">
      <PanelCard title={team?.name ?? (fa ? 'ثبت‌نام تیم' : 'Team registration')} description={league?.name}>
        <dl className="grid gap-4 sm:grid-cols-2">
          <Info label={fa ? 'شماره صورتحساب' : 'Invoice number'} value={selected.invoice_number ?? '—'} />
          <Info label={fa ? 'وضعیت' : 'Status'} value={paymentLabels[selected.status] ?? selected.status} />
          <Info label={fa ? 'روش پرداخت' : 'Payment method'} value={methodLabels[selected.payment_method ?? 'online'] ?? '—'} />
          <Info label={fa ? 'تاریخ صدور' : 'Issued at'} value={formatAppDateTime(selected.created_at, i18n.language)} />
          <Info label={fa ? 'مبلغ' : 'Amount'} value={`${formatAmountToman(Number(selected.amount))} ${currency}`} strong />
          <Info label={fa ? 'تاریخ پرداخت' : 'Paid at'} value={formatAppDateTime(selected.paid_at, i18n.language)} />
          {selected.gateway_ref ? <Info label={fa ? 'شناسه تراکنش' : 'Transaction reference'} value={selected.gateway_ref} /> : null}
        </dl>
        {selected.receipt_status === 'rejected' ? <p className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">{fa ? 'دلیل رد فیش' : 'Receipt rejection reason'}: {selected.receipt_rejection_reason || (fa ? 'ذکر نشده' : 'Not provided')}</p> : null}
        <div className="mt-6 flex flex-wrap gap-3">{selected.status !== 'refunded' ? <Link to={`/payments/teams/${selected.team_id}`} className="rounded-xl bg-gradient-to-l from-sky-600 to-emerald-600 px-5 py-3 text-sm font-bold text-white">{selected.status === 'paid' ? (fa ? 'مشاهده رسید و عضویت' : 'View receipt and membership') : (fa ? 'ادامه پرداخت' : 'Continue payment')}</Link> : null}<Link to="/account/invoices" className="rounded-xl bg-slate-100 px-5 py-3 text-sm font-bold text-slate-600">{fa ? 'بازگشت' : 'Back'}</Link></div>
      </PanelCard>
    </PanelPage>
  }

  return <PanelPage title={fa ? 'صورتحساب‌های من' : 'My invoices'} description={fa ? 'همه پیش‌فاکتورها، پرداخت‌ها و وضعیت بررسی فیش‌ها' : 'All proformas, payments and receipt reviews'} index="AC.02">
    <FieldError message={error ?? undefined} />
    <div className="grid gap-4 sm:grid-cols-3">
      <Metric label={fa ? 'همه صورتحساب‌ها' : 'All invoices'} value={invoices.length} />
      <Metric label={fa ? 'پرداخت‌شده' : 'Paid'} value={invoices.filter((row) => row.status === 'paid').length} tone="emerald" />
      <Metric label={fa ? 'نیازمند اقدام' : 'Action required'} value={invoices.filter((row) => row.status === 'pending').length} tone="amber" />
    </div>
    <div className="mt-6 space-y-3">
      {invoices.map((invoice) => {
        const team = teamFor(invoice)
        const league = leagueFor(invoice)
        return <Link key={invoice.id} to={`/account/invoices/${invoice.id}`} className="group block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-4"><div><div className="flex items-center gap-2"><h2 className="font-black text-slate-800">{team?.name ?? (fa ? 'ثبت‌نام تیم' : 'Team registration')}</h2>{invoice.payment_method === 'card_to_card' ? <span className="rounded-full bg-violet-100 px-2.5 py-1 text-[10px] font-black text-violet-700">{methodLabels.card_to_card}</span> : null}</div><p className="mt-1 text-sm text-slate-500">{league?.name ?? (fa ? 'لیگ' : 'League')} · {invoice.invoice_number ?? (fa ? 'بدون شماره' : 'No number')}</p></div><div className="text-left"><StatusBadge status={invoice.status} label={paymentLabels[invoice.status] ?? invoice.status} /><p className="mt-2 text-lg font-black text-slate-800">{formatAmountToman(Number(invoice.amount))} {currency}</p></div></div>
        </Link>
      })}
      {!invoices.length ? <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-14 text-center text-sm text-slate-500">{fa ? 'هنوز صورتحسابی برای حساب شما صادر نشده است.' : 'No invoices have been issued for your account yet.'}</div> : null}
    </div>
  </PanelPage>
}

function Info({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className="rounded-2xl bg-slate-50 p-4"><dt className="text-xs font-bold text-slate-400">{label}</dt><dd className={`mt-2 ${strong ? 'text-xl font-black text-emerald-700' : 'text-sm font-bold text-slate-700'}`}>{value}</dd></div>
}

function Metric({ label, value, tone = 'sky' }: { label: string; value: number; tone?: 'sky' | 'emerald' | 'amber' }) {
  const colors = { sky: 'from-sky-50 text-sky-700', emerald: 'from-emerald-50 text-emerald-700', amber: 'from-amber-50 text-amber-700' }
  return <div className={`rounded-2xl border border-white bg-gradient-to-l ${colors[tone]} to-white p-5 shadow-sm`}><p className="text-xs font-bold opacity-70">{label}</p><p className="mt-2 text-3xl font-black">{value.toLocaleString('fa-IR')}</p></div>
}
