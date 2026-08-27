import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, FieldError, Input, PanelCard, Select, StatusBadge, Textarea } from '@/components/ui/FormControls'
import { fetchActiveLeagues } from '@/features/companies/api'
import { adminArchiveInvoice, adminDeleteInvoice, adminUpdateInvoice, fetchFinanceDeposits, fetchFinanceRows, formatAmountToman, receiptPrivateUrl, reviewCardReceipt, type FinanceDeposit, type FinanceRow } from '@/features/payments/api'
import type { League, PaymentStatus } from '@/types/database'
import { PanelPage } from '@/components/layout/PanelShell'
import { StatCard } from '@/components/panel/HudKit'
import { formatAppDateTime } from '@/lib/dates'
import { useToast } from '@/components/ui/Toast'

type Tab = 'invoices' | 'deposits' | 'card'
const statusLabels: Record<PaymentStatus, string> = { pending: 'در انتظار پرداخت', paid: 'پرداخت‌شده', failed: 'ناموفق', refunded: 'مرجوع‌شده' }
const receiptLabels: Record<string, string> = { pending_review: 'در حال بررسی', approved: 'تأییدشده', rejected: 'ردشده' }

export function SuperAdminFinancePage() {
  const { t, i18n } = useTranslation()
  const toast = useToast()
  const [tab, setTab] = useState<Tab>('invoices')
  const [rows, setRows] = useState<FinanceRow[]>([])
  const [deposits, setDeposits] = useState<FinanceDeposit[]>([])
  const [leagues, setLeagues] = useState<League[]>([])
  const [status, setStatus] = useState('')
  const [method, setMethod] = useState('')
  const [archive, setArchive] = useState<'active' | 'archived' | 'all'>('active')
  const [leagueId, setLeagueId] = useState('')
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const [editing, setEditing] = useState<FinanceRow | null>(null)
  const [editForm, setEditForm] = useState({ amount: '', status: 'pending' as PaymentStatus, paymentMethod: 'online' as 'online' | 'card_to_card', note: '' })

  const load = async () => {
    setLoading(true); setError(null)
    try {
      const [finance, ledger, allLeagues] = await Promise.all([fetchFinanceRows(), fetchFinanceDeposits(), fetchActiveLeagues()])
      setRows(finance); setDeposits(ledger); setLeagues(allLeagues)
    } catch (err) { setError(err instanceof Error ? err.message : t('common.error')) }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    return rows.filter((row) => {
      if (tab === 'card' && row.payment_method !== 'card_to_card' && !row.receipt_status) return false
      if (status && row.status !== status) return false
      if (method && row.payment_method !== method) return false
      if (leagueId && row.league_id !== leagueId) return false
      if (archive === 'active' && row.archived_at) return false
      if (archive === 'archived' && !row.archived_at) return false
      return !needle || [row.invoice_number, row.company_name, row.team_name, row.league_name, row.gateway_ref].some((value) => value?.toLocaleLowerCase().includes(needle))
    })
  }, [archive, leagueId, method, query, rows, status, tab])

  const postedDeposits = deposits.filter((row) => row.status === 'posted')
  const paidSum = postedDeposits.reduce((sum, row) => sum + Number(row.amount), 0)
  const onlineSum = postedDeposits.filter((row) => row.payment_method === 'online').reduce((sum, row) => sum + Number(row.amount), 0)
  const cardSum = postedDeposits.filter((row) => row.payment_method === 'card_to_card').reduce((sum, row) => sum + Number(row.amount), 0)
  const receiptPendingCount = rows.filter((row) => row.receipt_status === 'pending_review').length

  const openEdit = (row: FinanceRow) => { setEditing(row); setEditForm({ amount: String(row.amount), status: row.status, paymentMethod: row.payment_method ?? 'online', note: row.admin_note ?? '' }) }
  const saveEdit = async () => {
    if (!editing) return
    setBusyId(editing.id); setError(null)
    try { await adminUpdateInvoice({ invoiceId: editing.id, amount: Number(editForm.amount), status: editForm.status, paymentMethod: editForm.paymentMethod, adminNote: editForm.note }); toast.success('فاکتور و دفتر واریزی به‌روز شد.'); setEditing(null); await load() }
    catch (err) { setError(err instanceof Error ? err.message : t('common.error')) }
    finally { setBusyId(null) }
  }
  const archiveInvoice = async (row: FinanceRow) => {
    setBusyId(row.id); setError(null)
    try { await adminArchiveInvoice(row.id, !row.archived_at); toast.success(row.archived_at ? 'فاکتور از بایگانی خارج شد.' : 'فاکتور بایگانی شد.'); await load() }
    catch (err) { setError(err instanceof Error ? err.message : t('common.error')) }
    finally { setBusyId(null) }
  }
  const deleteInvoice = async (row: FinanceRow) => {
    if (!window.confirm('این پیش‌فاکتور به‌طور دائم حذف شود؟')) return
    setBusyId(row.id); setError(null)
    try { await adminDeleteInvoice(row.id); toast.success('پیش‌فاکتور حذف شد.'); await load() }
    catch (err) { setError(err instanceof Error ? (err.message === 'paid_invoice_must_be_archived' ? 'فاکتور پرداخت‌شده فقط قابل بایگانی است.' : err.message) : t('common.error')) }
    finally { setBusyId(null) }
  }
  const reviewReceipt = async (row: FinanceRow, approved: boolean) => {
    setBusyId(row.id); setError(null)
    try { await reviewCardReceipt(row.id, approved, reasons[row.id]); toast.success(approved ? 'واریز تأیید و در دفتر حسابداری ثبت شد.' : 'فیش رد شد.'); await load() }
    catch (err) { setError(err instanceof Error ? err.message : t('common.error')) }
    finally { setBusyId(null) }
  }

  const visibleDeposits = postedDeposits.filter((row) => {
    const needle = query.trim().toLocaleLowerCase()
    return (!method || row.payment_method === method) && (!leagueId || row.league_id === leagueId) && (!needle || [row.invoice_number, row.company_name, row.team_name, row.reference].some((value) => value?.toLocaleLowerCase().includes(needle)))
  })

  return <PanelPage index="FIN.OP" title="مرکز عملیات حسابداری" description="مدیریت فاکتورها، واریزهای قطعی، فیش‌های کارت‌به‌کارت و سوابق مالی">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><StatCard index="F01" label="مجموع واریز قطعی" value={formatAmountToman(paidSum)} accent="green" /><StatCard index="F02" label="واریز آنلاین" value={formatAmountToman(onlineSum)} /><StatCard index="F03" label="واریز کارت‌به‌کارت" value={formatAmountToman(cardSum)} accent="orange" /><StatCard index="F04" label="فاکتور پرداخت‌شده" value={postedDeposits.length} accent="green" /><StatCard index="F05" label="فیش در انتظار بررسی" value={receiptPendingCount} accent={receiptPendingCount ? 'red' : 'green'} /></div>
    <div className="panel-tabs flex flex-wrap gap-2 rounded-2xl border border-rc-line bg-white p-2 shadow-sm"><Button type="button" variant={tab === 'invoices' ? 'primary' : 'ghost'} onClick={() => setTab('invoices')}>فاکتورها</Button><Button type="button" variant={tab === 'deposits' ? 'primary' : 'ghost'} onClick={() => setTab('deposits')}>دفتر واریزی‌ها</Button><Button type="button" variant={tab === 'card' ? 'primary' : 'ghost'} onClick={() => setTab('card')}>کارت‌به‌کارت <span className="rounded-full bg-amber-100 px-2 text-amber-800">{receiptPendingCount}</span></Button></div>
    <PanelCard title="جست‌وجو و فیلترها"><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5"><Input label="جست‌وجوی فاکتور، تیم، شرکت یا پیگیری" value={query} onChange={(e) => setQuery(e.target.value)} />{tab !== 'deposits' ? <Select label="وضعیت پرداخت" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">همه وضعیت‌ها</option>{Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select> : null}<Select label="روش پرداخت" value={method} onChange={(e) => setMethod(e.target.value)}><option value="">همه روش‌ها</option><option value="online">پرداخت آنلاین</option><option value="card_to_card">کارت‌به‌کارت</option></Select><Select label="لیگ" value={leagueId} onChange={(e) => setLeagueId(e.target.value)}><option value="">همه لیگ‌ها</option>{leagues.map((league) => <option key={league.id} value={league.id}>{league.name}</option>)}</Select>{tab !== 'deposits' ? <Select label="بایگانی" value={archive} onChange={(e) => setArchive(e.target.value as typeof archive)}><option value="active">فعال‌ها</option><option value="archived">بایگانی‌شده‌ها</option><option value="all">همه</option></Select> : null}</div></PanelCard>
    <FieldError message={error ?? undefined} />
    {tab === 'deposits' ? <DepositTable rows={visibleDeposits} language={i18n.language} /> : <InvoiceTable rows={filtered} cardMode={tab === 'card'} loading={loading} language={i18n.language} busyId={busyId} reasons={reasons} setReasons={setReasons} onReview={reviewReceipt} onEdit={openEdit} onArchive={archiveInvoice} onDelete={deleteInvoice} />}
    {editing ? <EditInvoiceModal row={editing} form={editForm} setForm={setEditForm} busy={busyId === editing.id} onClose={() => setEditing(null)} onSave={saveEdit} /> : null}
  </PanelPage>
}

function DepositTable({ rows, language }: { rows: FinanceDeposit[]; language: string }) {
  return <PanelCard title={`دفتر واریزی‌های قطعی (${rows.length})`}><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-sm"><thead><tr><th>زمان واریز</th><th>فاکتور</th><th>پرداخت‌کننده</th><th>لیگ / تیم</th><th>روش</th><th>مبلغ</th><th>پیگیری</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className={row.payment_method === 'card_to_card' ? 'bg-amber-50/70' : ''}><td>{formatAppDateTime(row.occurred_at, language)}</td><td className="font-mono text-xs text-rc-blue">{row.invoice_number}</td><td>{row.company_name}</td><td>{row.league_name} / {row.team_name}</td><td><PaymentMethodLabel method={row.payment_method} /></td><td className="font-black text-emerald-700">{formatAmountToman(Number(row.amount))}</td><td dir="ltr" className="font-mono text-xs">{row.reference || '—'}</td></tr>)}</tbody></table></div></PanelCard>
}

type InvoiceTableProps = { rows: FinanceRow[]; cardMode: boolean; loading: boolean; language: string; busyId: string | null; reasons: Record<string, string>; setReasons: React.Dispatch<React.SetStateAction<Record<string, string>>>; onReview: (row: FinanceRow, approved: boolean) => Promise<void>; onEdit: (row: FinanceRow) => void; onArchive: (row: FinanceRow) => Promise<void>; onDelete: (row: FinanceRow) => Promise<void> }
function InvoiceTable({ rows, cardMode, loading, language, busyId, reasons, setReasons, onReview, onEdit, onArchive, onDelete }: InvoiceTableProps) {
  return <PanelCard title={`${cardMode ? 'واریزهای کارت‌به‌کارت' : 'مدیریت فاکتورها'} (${rows.length})`}>{loading ? <p className="text-sm text-rc-muted">در حال دریافت…</p> : rows.length === 0 ? <p className="text-sm text-rc-muted">موردی پیدا نشد.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[1120px] text-sm"><thead><tr><th>فاکتور / تاریخ</th><th>شرکت / تیم</th><th>لیگ</th><th>مبلغ</th><th>وضعیت</th><th>روش</th><th>فیش و بررسی</th><th>عملیات</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className={`${row.payment_method === 'card_to_card' ? 'bg-amber-50/65' : ''} ${row.archived_at ? 'opacity-60' : ''}`}><td><strong className="block font-mono text-xs text-rc-blue">{row.invoice_number}</strong><span className="text-[11px] text-rc-muted">{formatAppDateTime(row.created_at, language)}</span></td><td><strong className="block">{row.company_name}</strong><span className="text-xs text-rc-muted">{row.team_name}</span></td><td>{row.league_name}</td><td className="font-black">{formatAmountToman(Number(row.amount))}</td><td><StatusBadge status={row.status === 'paid' ? 'approved' : row.status === 'failed' ? 'rejected' : 'under_review'} label={statusLabels[row.status]} /></td><td><PaymentMethodLabel method={row.payment_method ?? 'online'} /></td><td className="min-w-64"><ReceiptCell row={row} busy={busyId === row.id} reason={reasons[row.id] ?? ''} onReason={(value) => setReasons((current) => ({ ...current, [row.id]: value }))} onReview={onReview} /></td><td><div className="flex min-w-52 flex-wrap gap-2"><Button type="button" variant="secondary" onClick={() => onEdit(row)}>ویرایش</Button><Button type="button" variant="secondary" onClick={() => void onArchive(row)} disabled={busyId === row.id}>{row.archived_at ? 'خروج از بایگانی' : 'بایگانی'}</Button>{row.status !== 'paid' && !row.receipt_path ? <Button type="button" variant="danger" onClick={() => void onDelete(row)} disabled={busyId === row.id}>حذف</Button> : null}</div></td></tr>)}</tbody></table></div>}</PanelCard>
}

function ReceiptCell({ row, busy, reason, onReason, onReview }: { row: FinanceRow; busy: boolean; reason: string; onReason: (value: string) => void; onReview: (row: FinanceRow, approved: boolean) => Promise<void> }) {
  return <>{row.receipt_status ? <span className="mb-2 block text-xs font-bold">{receiptLabels[row.receipt_status] ?? row.receipt_status}</span> : <span className="text-xs text-rc-muted">فیشی ندارد</span>}{row.receipt_path ? <a className="mb-2 block text-xs font-bold text-rc-blue" href={receiptPrivateUrl(row.receipt_path)} target="_blank" rel="noreferrer">مشاهده فیش</a> : null}{row.receipt_status === 'pending_review' ? <div className="space-y-2 rounded-xl border border-amber-200 bg-white p-2"><Input label="دلیل رد" value={reason} onChange={(e) => onReason(e.target.value)} /><div className="flex gap-2"><Button type="button" onClick={() => void onReview(row, true)} disabled={busy}>تأیید و ثبت واریز</Button><Button type="button" variant="danger" onClick={() => void onReview(row, false)} disabled={busy || !reason.trim()}>رد</Button></div></div> : null}{row.receipt_rejection_reason ? <p className="text-xs text-rose-700">{row.receipt_rejection_reason}</p> : null}</>
}

type EditForm = { amount: string; status: PaymentStatus; paymentMethod: 'online' | 'card_to_card'; note: string }
function EditInvoiceModal({ row, form, setForm, busy, onClose, onSave }: { row: FinanceRow; form: EditForm; setForm: React.Dispatch<React.SetStateAction<EditForm>>; busy: boolean; onClose: () => void; onSave: () => Promise<void> }) {
  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}><div className="w-full max-w-xl rounded-3xl border border-white bg-white p-6 shadow-2xl"><div className="mb-5 flex items-center justify-between"><div><p className="text-xs font-bold text-rc-blue">ویرایش فاکتور</p><h2 className="mt-1 font-black">{row.invoice_number}</h2></div><Button type="button" variant="ghost" onClick={onClose}>بستن</Button></div><div className="grid gap-4 sm:grid-cols-2"><Input label="مبلغ" type="number" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /><Select label="وضعیت پرداخت" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as PaymentStatus })}>{Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select><Select label="روش پرداخت" value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value as EditForm['paymentMethod'] })}><option value="online">آنلاین</option><option value="card_to_card">کارت‌به‌کارت</option></Select><div className="sm:col-span-2"><Textarea label="یادداشت داخلی حسابداری" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div></div><div className="mt-5 flex gap-2"><Button type="button" onClick={() => void onSave()} disabled={busy || !form.amount}>ذخیره تغییرات</Button><Button type="button" variant="secondary" onClick={onClose}>انصراف</Button></div></div></div>
}

function PaymentMethodLabel({ method }: { method: string }) {
  return method === 'card_to_card' ? <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-100 px-3 py-1 text-xs font-black text-amber-900"><span className="size-2 rounded-full bg-amber-500" />کارت‌به‌کارت</span> : <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-bold text-sky-800"><span className="size-2 rounded-full bg-sky-500" />پرداخت آنلاین</span>
}
