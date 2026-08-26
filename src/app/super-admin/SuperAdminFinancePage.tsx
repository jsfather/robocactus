import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Input, PanelCard, Select, StatusBadge } from '@/components/ui/FormControls'
import { fetchActiveLeagues } from '@/features/companies/api'
import { fetchFinanceRows, formatAmountToman, receiptPrivateUrl, reviewCardReceipt, type FinanceRow } from '@/features/payments/api'
import type { League } from '@/types/database'

export function SuperAdminFinancePage() {
  const { t } = useTranslation()
  const [rows, setRows] = useState<FinanceRow[]>([])
  const [leagues, setLeagues] = useState<League[]>([])
  const [status, setStatus] = useState('')
  const [leagueId, setLeagueId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [reviewingId, setReviewingId] = useState<string | null>(null)
  const [reasons, setReasons] = useState<Record<string, string>>({})

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const [finance, allLeagues] = await Promise.all([
        fetchFinanceRows({
          status: status || undefined,
          leagueId: leagueId || undefined,
        }),
        fetchActiveLeagues(),
      ])
      setRows(finance)
      setLeagues(allLeagues)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const paidCount = rows.filter((r) => r.status === 'paid').length
  const failedCount = rows.filter((r) => r.status === 'failed').length
  const pendingCount = rows.filter((r) => r.status === 'pending').length
  const paidSum = rows
    .filter((r) => r.status === 'paid')
    .reduce((sum, r) => sum + Number(r.amount), 0)
  const receiptPendingCount = rows.filter((row) => row.receipt_status === 'pending_review').length

  const reviewReceipt = async (row: FinanceRow, approved: boolean) => {
    setReviewingId(row.id)
    setError(null)
    try {
      await reviewCardReceipt(row.id, approved, reasons[row.id])
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setReviewingId(null)
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold md:text-3xl">{t('finance.title')}</h1>
        <p className="mt-1 text-sm text-rc-muted">{t('finance.subtitle')}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-5">
        {[
          { label: t('finance.paid'), value: String(paidCount) },
          { label: t('finance.failed'), value: String(failedCount) },
          { label: t('finance.pending'), value: String(pendingCount) },
          { label: t('finance.paidSum'), value: formatAmountToman(paidSum) },
          { label: 'فیش در انتظار بررسی', value: String(receiptPendingCount) },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3"
          >
            <p className="text-xs text-rc-muted">{card.label}</p>
            <p className="mt-1 font-mono text-lg text-rc-blue">{card.value}</p>
          </div>
        ))}
      </div>

      <PanelCard title={t('finance.filters')}>
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <Select
            label={t('payment.invoiceStatus')}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">{t('finance.allStatuses')}</option>
            <option value="paid">paid</option>
            <option value="failed">failed</option>
            <option value="pending">pending</option>
            <option value="refunded">refunded</option>
          </Select>
          <Select
            label={t('team.league')}
            value={leagueId}
            onChange={(e) => setLeagueId(e.target.value)}
          >
            <option value="">{t('finance.allLeagues')}</option>
            {leagues.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
          <Button type="button" onClick={() => void load()} disabled={loading}>
            {loading ? t('app.loading') : t('finance.applyFilters')}
          </Button>
        </div>
      </PanelCard>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <PanelCard title={t('finance.tableTitle')}>
        {loading ? (
          <p className="text-sm text-rc-muted">{t('app.loading')}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-rc-muted">{t('finance.empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-white/10 text-rc-muted">
                  <th className="px-2 py-2 text-start font-medium">{t('payment.invoiceNumber')}</th>
                  <th className="px-2 py-2 text-start font-medium">{t('finance.company')}</th>
                  <th className="px-2 py-2 text-start font-medium">{t('team.name')}</th>
                  <th className="px-2 py-2 text-start font-medium">{t('team.league')}</th>
                  <th className="px-2 py-2 text-start font-medium">{t('payment.amount')}</th>
                  <th className="px-2 py-2 text-start font-medium">{t('payment.invoiceStatus')}</th>
                  <th className="px-2 py-2 text-start font-medium">{t('team.status')}</th>
                  <th className="px-2 py-2 text-start font-medium">روش / عملیات</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-white/5">
                    <td className="px-2 py-2 font-mono text-xs text-rc-blue">
                      {row.invoice_number}
                    </td>
                    <td className="px-2 py-2">{row.company_name}</td>
                    <td className="px-2 py-2">{row.team_name}</td>
                    <td className="px-2 py-2">{row.league_name}</td>
                    <td className="px-2 py-2 font-mono">{formatAmountToman(Number(row.amount))}</td>
                    <td className="px-2 py-2 font-mono text-xs">{row.status}</td>
                    <td className="px-2 py-2">
                      <StatusBadge
                        status={row.team_status}
                        label={t(`team.statuses.${row.team_status}`, {
                          defaultValue: row.team_status,
                        })}
                      />
                    </td>
                    <td className="min-w-72 px-2 py-3">
                      <p className="mb-2 text-xs text-rc-muted">{row.payment_method === 'card_to_card' ? 'کارت‌به‌کارت' : 'آنلاین'} · {row.receipt_status ?? '—'}</p>
                      {row.receipt_path ? <a className="mb-2 inline-block text-xs text-rc-blue hover:underline" href={receiptPrivateUrl(row.receipt_path)} target="_blank" rel="noreferrer">مشاهده فیش</a> : null}
                      {row.receipt_status === 'pending_review' ? <div className="space-y-2 rounded-xl border border-rc-line bg-rc-surface p-2">
                        <Input label="دلیل رد (برای رد الزامی)" value={reasons[row.id] ?? ''} onChange={(event) => setReasons((current) => ({ ...current, [row.id]: event.target.value }))} />
                        <div className="flex gap-2">
                          <Button type="button" onClick={() => void reviewReceipt(row, true)} disabled={reviewingId === row.id}>تأیید واریز</Button>
                          <Button type="button" variant="danger" onClick={() => void reviewReceipt(row, false)} disabled={reviewingId === row.id || !(reasons[row.id]?.trim())}>رد فیش</Button>
                        </div>
                      </div> : null}
                      {row.receipt_status === 'rejected' ? <p className="text-xs text-red-400">{row.receipt_rejection_reason}</p> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PanelCard>
    </div>
  )
}
