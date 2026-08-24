import type {
  PaymentGateway,
  PaymentRequest,
  PaymentStartResult,
  PaymentVerifyRequest,
  PaymentVerifyResult,
} from './types'

/** ZarinPal adapter. Merchant credentials and provider calls stay on the Node server. */
export class ZarinPalGateway implements PaymentGateway {
  name = 'zarinpal'

  async startPayment(request: PaymentRequest): Promise<PaymentStartResult> {
    const response = await fetch('/api/payment/request', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })
    const body = (await response.json().catch(() => ({}))) as {
      authority?: string
      redirectUrl?: string
      error?: string
    }
    if (!response.ok || !body.authority || !body.redirectUrl) {
      return { success: false, error: body.error ?? 'ZarinPal request failed' }
    }
    return { success: true, reference: body.authority, redirectUrl: body.redirectUrl }
  }

  async verifyPayment(request: PaymentVerifyRequest): Promise<PaymentVerifyResult> {
    const response = await fetch('/api/payment/verify', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })
    const body = (await response.json().catch(() => ({}))) as {
      success?: boolean
      refId?: number
      error?: string
    }
    if (!response.ok || !body.success) {
      return { success: false, error: body.error ?? 'ZarinPal verification failed' }
    }
    return { success: true, reference: request.authority, refId: body.refId }
  }
}
