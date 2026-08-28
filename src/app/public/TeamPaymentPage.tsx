import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, FieldError, PanelCard, StatusBadge } from '@/components/ui/FormControls'
import { useAuth } from '@/hooks/useAuth'
import { fetchActiveLeagues } from '@/features/companies/api'
import { fetchTeamById, fetchTeamMembers } from '@/features/registration/api'
import {
  createInvoiceForTeam,
  acceptInvoiceTerms,
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
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [registrationBlock, setRegistrationBlock] = useState<string | null>(null)

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

        const [leagues, companyRes, existing, optionResponse, members] = await Promise.all([
          fetchActiveLeagues(),
          backend.from('companies').select('*').eq('id', row.company_id).maybeSingle(),
          fetchLatestInvoiceForTeam(row.id),
          backend.auth.getOptions(),
          fetchTeamMembers(row.id),
        ])

        const selectedLeague = leagues.find((l) => l.id === row.league_id) ?? null
        setLeague(selectedLeague)
        setCompany((companyRes.data as Company | null) ?? null)
        setInvoice(existing)
        setTermsAccepted(Boolean(existing?.terms_accepted_at))
        setOptions(optionResponse.data)

        const hasCaptain = members.some((member) => member.role === 'captain')
        const hasIncompletePerson = members.some((member) => !member.first_name_fa || !member.last_name_fa || !member.birth_date || !member.photo_url || !member.national_id_doc_path)
        const belowMinimum = selectedLeague?.team_size_min != null && members.length < selectedLeague.team_size_min
        const aboveMaximum = selectedLeague?.team_size_max != null && members.length > selectedLeague.team_size_max
        const reachedPayment = row.lifecycle_status === 'awaiting_payment' || ['invoice', 'payment', 'completed'].includes(row.registration_stage ?? '')
        const blockReason = !hasCaptain
          ? 'اطلاعات سرپرست تیم هنوز ثبت نشده است.'
          : !members.length
            ? 'اعضای تیم هنوز ثبت نشده‌اند.'
            : hasIncompletePerson
              ? 'اطلاعات هویتی یا مدارک یک یا چند نفر کامل نشده است.'
              : belowMinimum
                ? `حداقل تعداد افراد این لیگ ${selectedLeague?.team_size_min?.toLocaleString('fa-IR')} نفر است.`
                : aboveMaximum
                  ? `حداکثر تعداد افراد این لیگ ${selectedLeague?.team_size_max?.toLocaleString('fa-IR')} نفر است.`
                  : !reachedPayment
                    ? 'ثبت‌نام هنوز به مرحله تأیید نهایی و صدور صورتحساب نرسیده است.'
                    : null
        setRegistrationBlock(existing?.status === 'paid' ? null : blockReason)

        if (!blockReason && row.status === 'draft' && (!existing || existing.status !== 'paid')) {
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
    if (!termsAccepted) return setError(t('payment.termsRequired', { defaultValue: 'پذیرش قوانین و مقررات برای ادامه پرداخت الزامی است.' }))
    setBusy(true)
    setError(null)
    try {
      const acceptedInvoice = invoice.terms_accepted_at ? invoice : await acceptInvoiceTerms(invoice.id)
      setInvoice(acceptedInvoice)
      const { redirectUrl, failUrl: mockFail } = await startTeamPayment({ team, league, invoice: acceptedInvoice })
      setFailUrl(mockFail ?? null)
      window.location.href = redirectUrl
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
      setBusy(false)
    }
  }

  const uploadReceipt = async () => {
    if (!invoice || !user || !receiptFile) return
    if (!termsAccepted) return setError(t('payment.termsRequired', { defaultValue: 'پذیرش قوانین و مقررات برای ارسال فیش الزامی است.' }))
    setBusy(true)
    setError(null)
    try {
      const acceptedInvoice = invoice.terms_accepted_at ? invoice : await acceptInvoiceTerms(invoice.id)
      setInvoice(await submitCardReceipt({ invoiceId: acceptedInvoice.id, userId: user.id, file: receiptFile }))
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

  if (registrationBlock) {
    return <div className="mx-auto max-w-2xl px-4 py-12"><section className="rounded-3xl border border-amber-200 bg-white p-6 shadow-lg sm:p-8"><span className="grid size-12 place-items-center rounded-2xl bg-amber-100 text-xl font-black text-amber-700">!</span><h1 className="mt-5 text-2xl font-black text-slate-900">ثبت‌نام برای پرداخت آماده نیست</h1><p className="mt-3 text-sm leading-7 text-slate-600">{registrationBlock} ابتدا ثبت‌نام تیم را تکمیل و اطلاعات را تأیید کنید؛ پس از آن مبلغ نهایی براساس سرپرست، مربی و اعضا محاسبه می‌شود.</p><Link to="/company/competitions" className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-gradient-to-l from-sky-600 to-emerald-600 px-5 py-2.5 text-sm font-bold text-white">ادامه و تکمیل ثبت‌نام</Link></section></div>
  }

  const isPaid = invoice?.status === 'paid' || team.status !== 'draft'
  const amount = Number(invoice?.amount ?? league.registration_fee ?? 0)

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-10">
      <section className="overflow-hidden rounded-[2rem] bg-gradient-to-l from-[#063d59] via-[#087eb8] to-[#087a58] p-6 text-white shadow-[0_24px_70px_rgb(8_126_184/0.2)] sm:p-8"><p className="text-xs font-black tracking-[.2em] text-cyan-200">CHECKOUT · {invoice?.invoice_number}</p><h1 className="mt-2 text-3xl font-black sm:text-4xl">{t('payment.title')}</h1><p className="mt-3 max-w-2xl text-sm leading-7 text-white/75">{t('payment.subtitle')}</p></section>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-6">

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
          <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-2xl bg-slate-50 p-4"><span className="text-xs text-slate-400">شرکت‌کننده</span><strong className="mt-1 block text-slate-800">{company?.name ?? '—'}</strong></div><div className="rounded-2xl bg-slate-50 p-4"><span className="text-xs text-slate-400">تیم</span><strong className="mt-1 block text-slate-800">{team.name}</strong></div><div className="rounded-2xl bg-slate-50 p-4"><span className="text-xs text-slate-400">لیگ</span><strong className="mt-1 block text-slate-800">{league.name}</strong></div></div>
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
                <Button type="button" onClick={() => void uploadReceipt()} disabled={!receiptFile || busy || !termsAccepted}>ارسال فیش</Button>
              </div>
            )}
            {invoice?.receipt_status === 'rejected' ? <div className="mt-3 rounded-xl bg-red-950/30 p-3 text-sm"><p>فیش رد شده است: {invoice.receipt_rejection_reason}</p><p className="mt-1 text-xs text-white/60">فیش اصلاح‌شده را دوباره بارگذاری کنید.</p></div> : null}
          </div>
        </div>
      ) : null}

      </div>
      <aside className="space-y-4 lg:sticky lg:top-28"><section className="rounded-[1.75rem] border border-sky-100 bg-white p-5 shadow-[0_18px_55px_rgb(7_59_85/0.1)]"><p className="text-xs font-black text-sky-600">خلاصه پرداخت</p><div className="mt-4 space-y-3 border-b border-slate-100 pb-4 text-sm"><div className="flex justify-between"><span className="text-slate-500">شماره فاکتور</span><b className="font-mono text-slate-800">{invoice?.invoice_number}</b></div><div className="flex justify-between"><span className="text-slate-500">روش</span><b>{getConfiguredGatewayKind() === 'zarinpal' ? 'پرداخت آنلاین' : 'درگاه آزمایشی'}</b></div></div><div className="mt-5 flex items-end justify-between"><span className="text-sm font-bold text-slate-500">مبلغ نهایی</span><p className="text-end"><strong className="block text-2xl font-black text-emerald-700">{formatAmountToman(amount)}</strong><span className="text-xs text-slate-400">{t('payment.currency')}</span></p></div></section>
      {!isPaid ? <label className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 text-sm leading-7 transition ${termsAccepted ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}><input type="checkbox" className="mt-1 size-5 accent-emerald-600" checked={termsAccepted} onChange={(event) => { setTermsAccepted(event.target.checked); setError(null) }} /><span>{t('payment.acceptTermsPrefix', { defaultValue: 'قوانین و مقررات را مطالعه کرده‌ام و' })} <Link to="/terms" target="_blank" className="font-black underline">{t('nav.terms')}</Link> {t('payment.acceptTermsSuffix', { defaultValue: 'را می‌پذیرم.' })}</span></label> : null}

      <div className="flex flex-col gap-2">
        {!isPaid && invoice?.status !== 'paid' && options?.online_payment_enabled !== false ? (
          <Button type="button" className="w-full" onClick={() => void pay()} disabled={busy || !invoice || !termsAccepted}>
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
      </aside>
      </div>

      {invoice?.status === 'failed' ? (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          {t('payment.failedKeptDraft')}
        </p>
      ) : null}
    </div>
  )
}
