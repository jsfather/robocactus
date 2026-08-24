import type { Router } from 'express'
import { userFromRequest } from './db.js'

function gatewayBase(): string {
  return process.env.ZARINPAL_SANDBOX === 'true'
    ? 'https://sandbox.zarinpal.com/pg/v4/payment'
    : 'https://api.zarinpal.com/pg/v4/payment'
}

export function registerPaymentRoutes(router: Router): void {
  router.post('/payment/request', async (request, response) => {
    if (!(await userFromRequest(request))) {
      response.status(401).json({ error: 'authentication_required' })
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
        amount: Math.round(Number(request.body?.amount)),
        description: request.body?.description,
        callback_url: request.body?.callbackUrl,
        metadata: request.body?.metadata,
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
    response.json({ authority: body.data.authority, redirectUrl: `${startBase}${body.data.authority}` })
  })

  router.post('/payment/verify', async (request, response) => {
    if (!(await userFromRequest(request))) {
      response.status(401).json({ error: 'authentication_required' })
      return
    }
    const upstream = await fetch(`${gatewayBase()}/verify.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        merchant_id: process.env.ZARINPAL_MERCHANT_ID ?? '',
        amount: Math.round(Number(request.body?.amount)),
        authority: request.body?.authority,
      }),
    })
    const body = await upstream.json().catch(() => ({})) as { data?: { code?: number; ref_id?: number; message?: string } }
    if (!upstream.ok || (body.data?.code !== 100 && body.data?.code !== 101)) {
      response.status(502).json({ error: body.data?.message ?? 'ZarinPal verification failed' })
      return
    }
    response.json({ success: true, refId: body.data.ref_id })
  })
}
