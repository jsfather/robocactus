import type { Router } from 'express'
import { sql } from 'drizzle-orm'
import { getAuthSettings } from './auth.js'
import { config } from './config.js'
import { db, userFromRequest, withRequestRole, type AuthUser } from './db.js'

type PayableInvoice = {
  id: string
  team_id: string
  amount: string | number
  status: string
  gateway_ref: string | null
}

async function visibleInvoice(user: AuthUser, invoiceId: string): Promise<PayableInvoice | null> {
  return withRequestRole(user, async (transaction) => {
    const result = await transaction.execute(sql`
      select id, team_id, amount, status, gateway_ref
      from public.invoices
      where id = ${invoiceId}
      limit 1
    `)
    return (result.rows[0] as PayableInvoice | undefined) ?? null
  })
}

function gatewayBase(): string {
  return process.env.ZARINPAL_SANDBOX === 'true'
    ? 'https://sandbox.zarinpal.com/pg/v4/payment'
    : 'https://api.zarinpal.com/pg/v4/payment'
}

export function registerPaymentRoutes(router: Router): void {
  router.post('/payment/request', async (request, response) => {
    const user = await userFromRequest(request)
    if (!user) {
      response.status(401).json({ error: 'authentication_required' })
      return
    }
    if (!(await getAuthSettings()).online_payment_enabled) {
      response.status(403).json({ error: 'online_payment_disabled' })
      return
    }
    const invoiceId = String(request.body?.metadata?.invoiceId ?? '')
    const invoice = invoiceId ? await visibleInvoice(user, invoiceId) : null
    if (!invoice || !['pending', 'failed'].includes(invoice.status)) {
      response.status(404).json({ error: 'payable_invoice_not_found' })
      return
    }
    const merchantId = process.env.ZARINPAL_MERCHANT_ID ?? ''
    if (!merchantId) {
      response.status(503).json({ error: 'ZARINPAL_MERCHANT_ID is not configured' })
      return
    }
    const upstream = await fetch(`${gatewayBase()}/request.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        merchant_id: merchantId,
        amount: Math.round(Number(invoice.amount)),
        description: String(request.body?.description ?? 'Tabarestan Cup registration'),
        callback_url: `${config.appUrl.replace(/\/$/, '')}/payments/callback?invoice=${encodeURIComponent(invoice.id)}`,
        metadata: { invoice_id: invoice.id, user_id: user.id },
      }),
    })
    const body = await upstream.json().catch(() => ({})) as { data?: { authority?: string; code?: number; message?: string } }
    if (!upstream.ok || body.data?.code !== 100 || !body.data.authority) {
      response.status(502).json({ error: body.data?.message ?? 'ZarinPal request failed' })
      return
    }
    const startBase = process.env.ZARINPAL_SANDBOX === 'true'
      ? 'https://sandbox.zarinpal.com/pg/StartPay/'
      : 'https://www.zarinpal.com/pg/StartPay/'
    await db.execute(sql`
      update public.invoices
      set payment_method = 'online', gateway_ref = ${body.data.authority}, status = 'pending'
      where id = ${invoice.id}
    `)
    response.json({ authority: body.data.authority, redirectUrl: `${startBase}${body.data.authority}` })
  })

  router.post('/payment/verify', async (request, response) => {
    const user = await userFromRequest(request)
    if (!user) {
      response.status(401).json({ error: 'authentication_required' })
      return
    }
    if (!(await getAuthSettings()).online_payment_enabled) {
      response.status(403).json({ error: 'online_payment_disabled' })
      return
    }
    const invoiceId = String(request.body?.invoiceId ?? '')
    const authority = String(request.body?.authority ?? '')
    const invoice = invoiceId ? await visibleInvoice(user, invoiceId) : null
    if (!invoice || !authority) {
      response.status(404).json({ error: 'payment_authority_not_found' })
      return
    }
    if (invoice.status === 'paid') {
      response.json({ success: true, refId: invoice.gateway_ref })
      return
    }
    if (invoice.gateway_ref !== authority) {
      response.status(404).json({ error: 'payment_authority_not_found' })
      return
    }
    const upstream = await fetch(`${gatewayBase()}/verify.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        merchant_id: process.env.ZARINPAL_MERCHANT_ID ?? '',
        amount: Math.round(Number(invoice.amount)),
        authority,
      }),
    })
    const body = await upstream.json().catch(() => ({})) as { data?: { code?: number; ref_id?: number; message?: string } }
    if (!upstream.ok || (body.data?.code !== 100 && body.data?.code !== 101)) {
      response.status(502).json({ error: body.data?.message ?? 'ZarinPal verification failed' })
      return
    }
    const refId = String(body.data.ref_id ?? authority)
    await db.transaction(async (transaction) => {
      await transaction.execute(sql`
        update public.invoices
        set status = 'paid', paid_at = coalesce(paid_at, now()), gateway_ref = ${refId}
        where id = ${invoice.id} and status <> 'paid'
      `)
      await transaction.execute(sql`
        update public.teams
        set status = 'submitted', submitted_at = coalesce(submitted_at, now())
        where id = ${invoice.team_id} and status = 'draft'
      `)
    })
    response.json({ success: true, refId })
  })
}
