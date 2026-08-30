import type { Router } from 'express'
import { sql } from 'drizzle-orm'
import { getAuthSettings } from './auth.js'
import { config } from './config.js'
import { db, userFromRequest, withRequestRole, type AuthUser } from './db.js'

type PayableInvoice = { id: string; team_id: string; amount: string | number; status: string; gateway_ref: string | null; terms_accepted_at: string | null; invoice_number: string | null }
type PaymentAttempt = { id: string; invoice_id: string; team_id: string; invoice_number: string | null; invoice_status: string; invoice_amount: string | number; authority: string; amount: string | number; status: string; ref_id: string | null }
type ZarinPalBody = { data?: { authority?: string; code?: number; ref_id?: number; message?: string }; errors?: { code?: number; message?: string } | Array<{ code?: number; message?: string }> }

async function visibleInvoice(user: AuthUser, invoiceId: string): Promise<PayableInvoice | null> {
  return withRequestRole(user, async (transaction) => {
    const result = await transaction.execute(sql`select id,team_id,amount,status,gateway_ref,terms_accepted_at,invoice_number from public.invoices where id=${invoiceId} limit 1`)
    return (result.rows[0] as PayableInvoice | undefined) ?? null
  })
}

const gatewayBase = (sandbox: boolean) => sandbox ? 'https://sandbox.zarinpal.com/pg/v4/payment' : 'https://api.zarinpal.com/pg/v4/payment'
const startPayBase = (sandbox: boolean) => sandbox ? 'https://sandbox.zarinpal.com/pg/StartPay/' : 'https://www.zarinpal.com/pg/StartPay/'

function providerError(body: ZarinPalBody, fallback: string) {
  const error = Array.isArray(body.errors) ? body.errors[0] : body.errors
  return { code: error?.code ?? body.data?.code ?? null, message: error?.message ?? body.data?.message ?? fallback }
}

async function providerPost(url: string, payload: Record<string, unknown>): Promise<{ ok: boolean; body: ZarinPalBody }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)
  try {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'TabarestanCup-Payment/1.0' }, body: JSON.stringify(payload), signal: controller.signal })
    return { ok: response.ok, body: await response.json().catch(() => ({})) as ZarinPalBody }
  } finally { clearTimeout(timeout) }
}

async function findAttempt(invoiceId: string, authority: string): Promise<PaymentAttempt | null> {
  const result = await db.execute(sql`
    select pa.id,pa.invoice_id,pa.authority,pa.amount,pa.status,pa.ref_id,
      i.team_id,i.invoice_number,i.status as invoice_status,i.amount as invoice_amount
    from public.payment_attempts pa join public.invoices i on i.id=pa.invoice_id
    where pa.invoice_id=${invoiceId} and pa.authority=${authority} limit 1
  `)
  return (result.rows[0] as PaymentAttempt | undefined) ?? null
}

function verificationPayload(attempt: PaymentAttempt, state: string, extra: Record<string, unknown> = {}) {
  return { success: state === 'paid', state, invoiceId: attempt.invoice_id, teamId: attempt.team_id, invoiceNumber: attempt.invoice_number, invoiceStatus: state === 'paid' ? 'paid' : attempt.invoice_status, refId: attempt.ref_id, ...extra }
}

async function verifyAttempt(invoiceId: string, authority: string, gatewayReturnedOk: boolean) {
  const attempt = await findAttempt(invoiceId, authority)
  if (!attempt) return { http: 404, body: { success: false, state: 'invalid', error: 'payment_authority_not_found' } }
  if (attempt.invoice_status === 'paid' || attempt.status === 'paid') return { http: 200, body: verificationPayload(attempt, 'paid') }
  if (!gatewayReturnedOk) {
    await db.execute(sql`update public.payment_attempts set status='cancelled',returned_at=coalesce(returned_at,now()),updated_at=now() where id=${attempt.id} and status not in ('paid','manual_review')`)
    return { http: 200, body: verificationPayload(attempt, 'cancelled', { recoverable: true }) }
  }

  await db.execute(sql`update public.payment_attempts set status='verifying',returned_at=coalesce(returned_at,now()),updated_at=now() where id=${attempt.id} and status<>'paid'`)
  const settings = await getAuthSettings(true)
  const merchantId = settings.zarinpal_merchant_id ?? process.env.ZARINPAL_MERCHANT_ID ?? ''
  const sandbox = settings.zarinpal_sandbox ?? process.env.ZARINPAL_SANDBOX === 'true'
  if (!merchantId) return { http: 503, body: verificationPayload(attempt, 'error', { recoverable: true, error: 'zarinpal_not_configured' }) }

  let upstream: { ok: boolean; body: ZarinPalBody }
  try { upstream = await providerPost(`${gatewayBase(sandbox)}/verify.json`, { merchant_id: merchantId, amount: Math.round(Number(attempt.amount)), authority }) }
  catch (error) {
    const message = error instanceof Error && error.name === 'AbortError' ? 'zarinpal_timeout' : 'zarinpal_unreachable'
    await db.execute(sql`update public.payment_attempts set status='error',provider_message=${message},updated_at=now() where id=${attempt.id}`)
    return { http: 503, body: verificationPayload(attempt, 'error', { recoverable: true, error: message }) }
  }

  const code = upstream.body.data?.code
  if (!upstream.ok || (code !== 100 && code !== 101)) {
    const detail = providerError(upstream.body, 'zarinpal_verification_failed')
    await db.execute(sql`update public.payment_attempts set status='failed',provider_code=${detail.code},provider_message=${detail.message},updated_at=now() where id=${attempt.id}`)
    return { http: 422, body: verificationPayload(attempt, 'failed', { recoverable: true, code: detail.code, error: detail.message }) }
  }

  const refId = String(upstream.body.data?.ref_id ?? authority)
  if (Number(attempt.invoice_amount) !== Number(attempt.amount)) {
    await db.execute(sql`update public.payment_attempts set status='manual_review',provider_code=${code ?? null},ref_id=${refId},provider_message='invoice_amount_changed',verified_at=now(),updated_at=now() where id=${attempt.id}`)
    return { http: 409, body: verificationPayload({ ...attempt, ref_id: refId }, 'manual_review', { error: 'invoice_amount_changed' }) }
  }

  await db.transaction(async (transaction) => {
    await transaction.execute(sql`update public.payment_attempts set status='paid',provider_code=${code ?? null},ref_id=${refId},provider_message=${upstream.body.data?.message ?? null},verified_at=now(),updated_at=now() where id=${attempt.id}`)
    await transaction.execute(sql`update public.invoices set status='paid',paid_at=coalesce(paid_at,now()),gateway_ref=${refId} where id=${attempt.invoice_id} and status<>'paid'`)
    await transaction.execute(sql`update public.teams set status='submitted',submitted_at=coalesce(submitted_at,now()) where id=${attempt.team_id} and status='draft'`)
  })
  return { http: 200, body: verificationPayload({ ...attempt, ref_id: refId }, 'paid') }
}

export function registerPaymentRoutes(router: Router): void {
  router.post('/payment/request', async (request, response) => {
    const user = await userFromRequest(request)
    if (!user) return void response.status(401).json({ error: 'authentication_required' })
    if (!(await getAuthSettings()).online_payment_enabled) return void response.status(403).json({ error: 'online_payment_disabled' })
    const invoiceId = String(request.body?.metadata?.invoiceId ?? '')
    const invoice = invoiceId ? await visibleInvoice(user, invoiceId) : null
    if (!invoice || !['pending', 'failed'].includes(invoice.status)) return void response.status(404).json({ error: 'payable_invoice_not_found' })
    if (!invoice.terms_accepted_at) return void response.status(409).json({ error: 'terms_not_accepted' })

    const settings = await getAuthSettings(true)
    const configuredProvider = settings.payment_provider ?? process.env.PAYMENT_PROVIDER ?? process.env.VITE_PAYMENT_PROVIDER ?? 'mock'
    if (configuredProvider !== 'zarinpal') return void response.status(409).json({ error: 'zarinpal_provider_not_enabled' })
    const merchantId = settings.zarinpal_merchant_id ?? process.env.ZARINPAL_MERCHANT_ID ?? ''
    const sandbox = settings.zarinpal_sandbox ?? process.env.ZARINPAL_SANDBOX === 'true'
    if (!merchantId) return void response.status(503).json({ error: 'zarinpal_not_configured' })
    const held = await db.execute(sql`select 1 from public.payment_attempts where invoice_id=${invoice.id} and status='manual_review' limit 1`)
    if (held.rows.length) return void response.status(409).json({ error: 'payment_under_financial_review' })
    const reusable = await db.execute(sql`select authority from public.payment_attempts where invoice_id=${invoice.id} and amount=${invoice.amount} and status in ('requested','verifying') and requested_at>now()-interval '15 minutes' order by requested_at desc limit 1`)
    const reusableAuthority = String(reusable.rows[0]?.authority ?? '')
    if (reusableAuthority) return void response.json({ authority: reusableAuthority, redirectUrl: `${startPayBase(sandbox)}${reusableAuthority}`, reused: true })

    let upstream: { ok: boolean; body: ZarinPalBody }
    try {
      upstream = await providerPost(`${gatewayBase(sandbox)}/request.json`, { merchant_id: merchantId, amount: Math.round(Number(invoice.amount)), description: String(request.body?.description ?? 'Tabarestan Cup registration'), callback_url: `${config.appUrl}/payments/callback?invoice=${encodeURIComponent(invoice.id)}`, metadata: { invoice_id: invoice.id, user_id: user.id } })
    } catch (error) {
      const message = error instanceof Error && error.name === 'AbortError' ? 'zarinpal_timeout' : 'zarinpal_unreachable'
      return void response.status(503).json({ error: message })
    }
    const authority = upstream.body.data?.authority
    if (!upstream.ok || upstream.body.data?.code !== 100 || !authority) {
      const detail = providerError(upstream.body, 'zarinpal_request_failed')
      return void response.status(502).json({ error: detail.message, code: detail.code })
    }
    await db.transaction(async (transaction) => {
      await transaction.execute(sql`insert into public.payment_attempts(invoice_id,user_id,authority,amount,status,provider_code) values(${invoice.id},${user.id}::uuid,${authority},${invoice.amount},'requested',100) on conflict(authority) do nothing`)
      await transaction.execute(sql`update public.invoices set payment_method='online',gateway_ref=${authority},status='pending' where id=${invoice.id}`)
    })
    response.json({ authority, redirectUrl: `${startPayBase(sandbox)}${authority}` })
  })

  // Public by design: the persisted invoice/authority pair plus provider-side
  // merchant and amount verification are the trust boundary, not a browser session.
  router.post('/payment/verify', async (request, response) => {
    const invoiceId = String(request.body?.invoiceId ?? '')
    const authority = String(request.body?.authority ?? '')
    if (!invoiceId || !authority) return void response.status(400).json({ success: false, state: 'invalid', error: 'callback_parameters_missing' })
    const result = await verifyAttempt(invoiceId, authority, request.body?.gatewayStatusOk !== false)
    response.status(result.http).json(result.body)
  })

  router.post('/payment/reconcile', async (request, response) => {
    const user = await userFromRequest(request)
    if (!user) return void response.status(401).json({ error: 'authentication_required' })
    const invoiceId = String(request.body?.invoiceId ?? '')
    const invoice = invoiceId ? await visibleInvoice(user, invoiceId) : null
    if (!invoice) return void response.status(404).json({ error: 'invoice_not_found' })
    if (invoice.status === 'paid') return void response.json({ success: true,state: 'paid',invoiceId,teamId: invoice.team_id,invoiceNumber: invoice.invoice_number,refId: invoice.gateway_ref })
    const latest = await db.execute(sql`select authority from public.payment_attempts where invoice_id=${invoice.id} order by requested_at desc limit 1`)
    const authority = String(latest.rows[0]?.authority ?? '')
    if (!authority) return void response.status(404).json({ success: false,state: 'not_started',error: 'payment_attempt_not_found' })
    const result = await verifyAttempt(invoice.id, authority, true)
    response.status(result.http).json(result.body)
  })
}
