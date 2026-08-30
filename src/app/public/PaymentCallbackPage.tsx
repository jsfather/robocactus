import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/FormControls'
import { fetchInvoice, verifyGatewayThenApply, verifyOnlinePayment, type OnlinePaymentState, type OnlinePaymentVerification } from '@/features/payments/api'
import { dispatchPendingSms } from '@/features/notifications/api'
import { getConfiguredGatewayKind } from '@/lib/payment-gateway'

type ViewState = OnlinePaymentState | 'verifying'

export function PaymentCallbackPage() {
  const { i18n } = useTranslation()
  const fa = i18n.language.startsWith('fa')
  const [params] = useSearchParams()
  const [result, setResult] = useState<OnlinePaymentVerification | null>(null)
  const [viewState, setViewState] = useState<ViewState>('verifying')
  const [retry, setRetry] = useState(0)

  const authority = params.get('Authority') ?? params.get('authority') ?? ''
  const status = (params.get('Status') ?? params.get('status') ?? '').toUpperCase()
  const invoiceId = params.get('invoice') ?? ''

  const verify = useCallback(async () => {
    setViewState('verifying')
    if (!invoiceId || !authority) {
      setResult({ success: false, state: 'invalid', error: 'callback_parameters_missing' })
      setViewState('invalid')
      return
    }
    try {
      if (getConfiguredGatewayKind() === 'zarinpal') {
        const verified = await verifyOnlinePayment({ invoiceId, authority, gatewayStatusOk: status === 'OK' })
        setResult(verified)
        setViewState(verified.state)
        if (verified.success) void dispatchPendingSms()
        return
      }
      const invoice = await fetchInvoice(invoiceId)
      if (!invoice) throw new Error('invoice_not_found')
      const updated = await verifyGatewayThenApply({ invoice, authority, gatewayStatusOk: status === 'OK' })
      const state: OnlinePaymentState = updated.status === 'paid' ? 'paid' : status === 'OK' ? 'failed' : 'cancelled'
      setResult({ success: state === 'paid', state, invoiceId: updated.id, teamId: updated.team_id, invoiceNumber: updated.invoice_number, invoiceStatus: updated.status, refId: updated.gateway_ref, recoverable: state !== 'paid' })
      setViewState(state)
      if (state === 'paid') void dispatchPendingSms()
    } catch (error) {
      setResult({ success: false, state: 'error', recoverable: true, error: error instanceof Error ? error.message : 'payment_verification_failed' })
      setViewState('error')
    }
  }, [authority, invoiceId, status, retry])

  useEffect(() => { void verify() }, [verify])

  const content = copyFor(viewState, fa)
  const tone = viewState === 'paid' ? 'emerald' : viewState === 'verifying' ? 'sky' : viewState === 'manual_review' ? 'amber' : 'rose'
  return <main className="mx-auto w-full max-w-2xl px-4 py-12 sm:py-20" dir={fa ? 'rtl' : 'ltr'}>
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_24px_80px_rgb(15_23_42/0.10)]">
      <div className={`h-1.5 ${tone === 'emerald' ? 'bg-emerald-500' : tone === 'sky' ? 'bg-sky-500' : tone === 'amber' ? 'bg-amber-500' : 'bg-rose-500'}`} />
      <div className="p-6 text-center sm:p-10">
        <StateIcon state={viewState} />
        <p className="mt-6 text-xs font-black tracking-[.16em] text-slate-400">PAYMENT STATUS</p>
        <h1 className="mt-2 text-2xl font-black text-slate-900 sm:text-3xl">{content.title}</h1>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-7 text-slate-600">{content.description}</p>
        {result?.invoiceNumber ? <div className="mx-auto mt-6 grid max-w-md gap-2 rounded-2xl bg-slate-50 p-4 text-sm sm:grid-cols-2"><span className="text-slate-500">{fa ? 'شماره صورتحساب' : 'Invoice'}</span><strong className="font-mono text-slate-800">{result.invoiceNumber}</strong>{result.refId ? <><span className="text-slate-500">{fa ? 'کد پیگیری' : 'Reference'}</span><strong className="font-mono text-emerald-700" dir="ltr">{result.refId}</strong></> : null}</div> : null}
        {result?.error && viewState !== 'cancelled' ? <p className="mx-auto mt-4 max-w-md rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-500" dir="ltr">{friendlyError(result.error, fa)}</p> : null}
        {viewState !== 'verifying' ? <div className="mt-7 flex flex-wrap justify-center gap-3">
          {(viewState === 'error' || viewState === 'failed') && invoiceId && authority ? <Button type="button" onClick={() => setRetry((value) => value + 1)}>{fa ? 'استعلام مجدد پرداخت' : 'Check payment again'}</Button> : null}
          {result?.teamId ? <Link to={`/payments/teams/${result.teamId}`}><Button type="button" variant={viewState === 'paid' ? 'primary' : 'secondary'}>{viewState === 'paid' ? (fa ? 'مشاهده رسید و عضویت' : 'View receipt') : (fa ? 'بازگشت و تلاش مجدد' : 'Return and retry')}</Button></Link> : null}
          <Link to="/account/invoices"><Button type="button" variant="ghost">{fa ? 'صورتحساب‌های من' : 'My invoices'}</Button></Link>
        </div> : null}
      </div>
    </section>
  </main>
}

function StateIcon({ state }: { state: ViewState }) {
  if (state === 'verifying') return <span className="mx-auto grid size-20 place-items-center rounded-full bg-sky-50"><span className="size-9 animate-spin rounded-full border-4 border-sky-200 border-t-sky-600" /></span>
  if (state === 'paid') return <span className="mx-auto grid size-20 place-items-center rounded-full bg-emerald-50 text-4xl font-black text-emerald-600">✓</span>
  if (state === 'manual_review') return <span className="mx-auto grid size-20 place-items-center rounded-full bg-amber-50 text-3xl font-black text-amber-600">!</span>
  return <span className="mx-auto grid size-20 place-items-center rounded-full bg-rose-50 text-3xl font-black text-rose-600">×</span>
}

function copyFor(state: ViewState, fa: boolean) {
  const faCopy: Record<ViewState, [string,string]> = {
    verifying: ['در حال تأیید پرداخت','در حال تطبیق امن مبلغ و شناسه تراکنش با زرین‌پال هستیم. این صفحه را نبندید.'],
    paid: ['پرداخت با موفقیت تأیید شد','صورتحساب پرداخت و عضویت تیم در لیگ قطعی شد. کد پیگیری را برای سوابق خود نگه دارید.'],
    cancelled: ['پرداخت انجام نشد','پرداخت توسط شما لغو شده یا در درگاه تکمیل نشده است. ثبت‌نام و صورتحساب محفوظ است و می‌توانید دوباره تلاش کنید.'],
    failed: ['تأیید پرداخت ناموفق بود','زرین‌پال این تراکنش را تأیید نکرد. اگر مبلغ از حساب کسر شده است، استعلام مجدد را بزنید.'],
    error: ['ارتباط با درگاه کامل نشد','وضعیت نهایی هنوز مشخص نیست. ثبت‌نام حذف نشده و می‌توانید همین حالا دوباره استعلام بگیرید.'],
    manual_review: ['پرداخت نیازمند بررسی مالی است','پرداخت در درگاه تأیید شده اما مبلغ فاکتور تغییر کرده است. اطلاعات برای بررسی حسابداری محفوظ مانده است.'],
    invalid: ['اطلاعات بازگشت معتبر نیست','شناسه فاکتور یا Authority ناقص یا نامعتبر است. از صفحه صورتحساب‌ها وضعیت را بررسی کنید.'],
    not_started: ['تلاشی برای پرداخت ثبت نشده','برای این صورتحساب هنوز درخواست معتبری به درگاه ارسال نشده است.'],
  }
  const enCopy: Record<ViewState, [string,string]> = {
    verifying:['Verifying payment','We are securely matching the amount and transaction authority with ZarinPal.'], paid:['Payment confirmed','Your invoice is paid and the team registration is now confirmed.'], cancelled:['Payment was not completed','The registration and invoice are preserved, so you can safely try again.'], failed:['Payment could not be verified','ZarinPal did not confirm this transaction. Recheck it if your account was charged.'], error:['Gateway connection was interrupted','The final status is not known yet. Your registration is safe and can be checked again.'], manual_review:['Payment requires financial review','The gateway confirmed payment but the invoice amount changed. The transaction is preserved for review.'], invalid:['Invalid callback information','The invoice or payment authority is missing or invalid.'], not_started:['No payment attempt found','No valid gateway request exists for this invoice.'],
  }
  const [title,description] = (fa ? faCopy : enCopy)[state]
  return { title,description }
}

function friendlyError(error: string, fa: boolean) {
  const labels: Record<string,string> = { zarinpal_timeout: fa ? 'پاسخ زرین‌پال بیش از حد زمان برد؛ دوباره استعلام بگیرید.' : 'ZarinPal timed out; check again.', zarinpal_unreachable: fa ? 'ارتباط با زرین‌پال برقرار نشد.' : 'Could not reach ZarinPal.', invoice_amount_changed: fa ? 'مبلغ فاکتور بعد از شروع پرداخت تغییر کرده است.' : 'The invoice amount changed after payment started.' }
  return labels[error] ?? error
}
