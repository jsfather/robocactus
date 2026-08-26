import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, FieldError, PanelCard, StatusBadge } from '@/components/ui/FormControls'
import { useAuth } from '@/hooks/useAuth'
import { fetchActiveLeagues } from '@/features/companies/api'
import { fetchTeamById } from '@/features/registration/api'
import {
  createInvoiceForTeam,
  fetchLatestInvoiceForTeam,
  formatAmountToman,
  submitCardReceipt,
  startTeamPayment,
} from '@/features/payments/api'
import { downloadInvoicePdf } from '@/features/payments/invoicePdf'
import { backend } from '@/lib/backend'
import { getConfiguredGatewayKind } from '@/lib/payment-gateway'
import type { Company, Invoice, League, Team } from '@/types/database'
import type { BackendAuthOptions } from '@/lib/backend'

export function TeamPaymentPage() {
  const { teamId } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()

  const [team, setTeam] = useState<Team | null>(null)
  const [league, setLeague] = useState<League | null>(null)
  const [company, setCompany] = useState<Company | null>(null)
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [failUrl, setFailUrl] = useState<string | null>(null)
  const [options, setOptions] = useState<BackendAuthOptions | null>(null)
  const [receiptFile, setReceiptFile] = useState<File | null>(null)

  useEffect(() => {
    if (!teamId || authLoading || !user) return

    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        const row = await fetchTeamById(teamId)
        if (!row) {
          setError(t('payment.teamNotFound'))
          return
        }
        setTeam(row)

        const [leagues, companyRes, existing, optionResponse] = await Promise.all([
          fetchActiveLeagues(),
          backend.from('companies').select('*').eq('id', row.company_id).maybeSingle(),
          fetchLatestInvoiceForTeam(row.id),
          backend.auth.getOptions(),
        ])

        setLeague(leagues.find((l) => l.id === row.league_id) ?? null)
        setCompany((companyRes.data as Company | null) ?? null)
        setInvoice(existing)
        setOptions(optionResponse.data)

        if (row.status === 'draft' && (!existing || existing.status !== 'paid')) {
          const created = await createInvoiceForTeam(row.id)
          setInvoice(created)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : t('common.error'))
      } finally {
        setLoading(false)
      }
    }

    void run()
  }, [teamId, user, authLoading, t])

  const pay = async () => {
    if (!team || !league || !invoice) return
    setBusy(true)
    setError(null)
    try {
      const { redirectUrl, failUrl: mockFail } = await startTeamPayment({ team, league, invoice })
      setFailUrl(mockFail ?? null)
      window.location.href = redirectUrl
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
      setBusy(false)
    }
  }

  const uploadReceipt = async () => {
    if (!invoice || !user || !receiptFile) return
    setBusy(true)
    setError(null)
    try {
      setInvoice(await submitCardReceipt({ invoiceId: invoice.id, userId: user.id, file: receiptFile }))
      setReceiptFile(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  if (authLoading || loading) {
    return <div className="px-4 py-12 text-center text-rc-muted">{t('app.loading')}</div>
  }

  if (!team || !league) {
    return (
      <div className="mx-auto max-w-lg px-4 py-12">
        <p className="text-red-400">{error ?? t('payment.teamNotFound')}</p>
        <Link to="/company" className="mt-4 inline-block text-rc-blue hover:underline">
          {t('company.panelTitle')}
        </Link>
      </div>
    )
  }

  const isPaid = invoice?.status === 'paid' || team.status !== 'draft'
  const amount = Number(invoice?.amount ?? league.registration_fee ?? 0)

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-10">
      <div>
        <h1 className="text-3xl font-semibold">{t('payment.title')}</h1>
        <p className="mt-1 text-rc-muted">{t('payment.subtitle')}</p>
      </div>

      <PanelCard title={team.name} description={league.name}>
        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-rc-muted">{t('team.status')}:</span>
            <StatusBadge
              status={team.status}
              label={t(`team.statuses.${team.status}`, { defaultValue: team.status })}
            />
          </div>
          {invoice ? (
            <>
              <p>
                <span className="text-rc-muted">{t('payment.invoiceNumber')}: </span>
                <span className="font-mono text-rc-blue">{invoice.invoice_number}</span>
              </p>
              <p>
                <span className="text-rc-muted">{t('payment.invoiceStatus')}: </span>
                <span className="font-mono">{invoice.status}</span>
              </p>
            </>
          ) : null}
          <p className="text-2xl font-semibold text-rc-accent">
            {formatAmountToman(amount)}{' '}
            <span className="text-sm font-normal text-rc-muted">{t('payment.currency')}</span>
          </p>
          <p className="text-xs text-rc-muted">
            {t('payment.provider')}: {getConfiguredGatewayKind()}
          </p>
        </div>
      </PanelCard>

      <FieldError message={error ?? undefined} />

      {isPaid ? (
        <div className="relative overflow-hidden rounded-3xl border border-emerald-400/30 bg-gradient-to-br from-emerald-500/15 to-sky-500/10 p-6">
          <div className="absolute -left-10 -top-10 size-32 rounded-full bg-emerald-400/10 blur-2xl" />
          <p className="text-xs font-bold tracking-[0.2em] text-emerald-500">MEMBERSHIP CONFIRMED</p>
          <h2 className="mt-2 text-2xl font-black">عضویت تیم در لیگ تأیید شد</h2>
          <p className="mt-2 text-sm leading-7 text-rc-muted">تیم «{team.name}» برای دوره {team.season_year ?? league.current_season_year} لیگ «{league.name}» ثبت قطعی شده است.</p>
        </div>
      ) : null}

      {!isPaid && options?.card_to_card_enabled ? (
        <div className="space-y-4 rounded-3xl border border-sky-300/20 bg-gradient-to-br from-sky-600 via-blue-700 to-indigo-900 p-5 text-white shadow-2xl shadow-blue-950/20">
          <div className="flex items-start justify-between gap-4">
            <div><p className="text-xs text-white/60">TABARESTAN CUP</p><h2 className="mt-1 text-lg font-black">پرداخت کارت‌به‌کارت</h2></div>
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs">IR BANK</span>
          </div>
          <button type="button" className="block w-full text-start font-mono text-xl tracking-[0.16em]" dir="ltr" onClick={() => void navigator.clipboard.writeText(options.bank_card_number ?? '')}>{options.bank_card_number || 'شماره کارت ثبت نشده'} <span className="text-[10px] tracking-normal text-white/60">کپی</span></button>
          <button type="button" className="block w-full text-start font-mono text-sm" dir="ltr" onClick={() => void navigator.clipboard.writeText(options.bank_iban ?? '')}>{options.bank_iban || 'شماره شبا ثبت نشده'} <span className="text-[10px] text-white/60">کپی</span></button>
          <p className="text-sm font-bold">{options.bank_account_owner || 'نام صاحب حساب ثبت نشده'}</p>
          <div className="rounded-2xl bg-black/15 p-3">
            {invoice?.receipt_status === 'pending_review' ? <p className="text-sm">فیش شما ارسال شده و در حال بررسی حسابداری است.</p> : (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <input type="file" accept="image/*,application/pdf" onChange={(event) => setReceiptFile(event.target.files?.[0] ?? null)} className="min-w-0 flex-1 text-xs" />
                <Button type="button" onClick={() => void uploadReceipt()} disabled={!receiptFile || busy}>ارسال فیش</Button>
              </div>
            )}
            {invoice?.receipt_status === 'rejected' ? <div className="mt-3 rounded-xl bg-red-950/30 p-3 text-sm"><p>فیش رد شده است: {invoice.receipt_rejection_reason}</p><p className="mt-1 text-xs text-white/60">فیش اصلاح‌شده را دوباره بارگذاری کنید.</p></div> : null}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {!isPaid && invoice?.status !== 'paid' && options?.online_payment_enabled !== false ? (
          <Button type="button" onClick={() => void pay()} disabled={busy || !invoice}>
            {busy ? t('app.loading') : t('payment.payCta')}
          </Button>
        ) : null}

        {invoice?.status === 'paid' && company ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              downloadInvoicePdf({ invoice, team, company, league })
            }
          >
            {t('payment.downloadInvoice')}
          </Button>
        ) : null}

        {failUrl && getConfiguredGatewayKind() === 'mock' && !isPaid ? (
          <Button
            type="button"
            variant="danger"
            onClick={() => {
              window.location.href = failUrl
            }}
          >
            {t('payment.simulateFail')}
          </Button>
        ) : null}

        <Button type="button" variant="ghost" onClick={() => void navigate(`/team/${team.id}`)}>
          {t('team.backToList')}
        </Button>
      </div>

      {invoice?.status === 'failed' ? (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          {t('payment.failedKeptDraft')}
        </p>
      ) : null}
    </div>
  )
}
