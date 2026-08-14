import type {
  PaymentGateway,
  PaymentRequest,
  PaymentStartResult,
  PaymentVerifyRequest,
  PaymentVerifyResult,
} from './types'

/**
 * Local/dev gateway: redirects to our callback with success/fail simulation.
 * Team status is never set here — only after `apply_payment_result` RPC.
 */
export class MockPaymentGateway implements PaymentGateway {
  name = 'mock'

  async startPayment(request: PaymentRequest): Promise<PaymentStartResult> {
    const invoiceId = request.metadata?.invoiceId
    if (!invoiceId) {
      return { success: false, error: 'missing invoiceId metadata' }
    }

    const authority = `MOCK-DEV-${invoiceId}`
    const url = new URL(request.callbackUrl)
    url.searchParams.set('Authority', authority)
    url.searchParams.set('Status', 'OK')
    url.searchParams.set('invoice', invoiceId)
    url.searchParams.set('provider', 'mock')

    return {
      success: true,
      redirectUrl: url.toString(),
      reference: authority,
    }
  }

  async verifyPayment(request: PaymentVerifyRequest): Promise<PaymentVerifyResult> {
    if (!request.authority.startsWith('MOCK-') && !request.authority.startsWith('MOCK-DEV-')) {
      return { success: false, error: 'invalid mock authority' }
    }
    return {
      success: true,
      reference: request.authority,
      refId: `MOCK-REF-${Date.now()}`,
    }
  }
}

/** Build a fail callback URL for UI "simulate failed payment" */
export function buildMockFailUrl(callbackUrl: string, invoiceId: string): string {
  const url = new URL(callbackUrl)
  url.searchParams.set('Authority', `MOCK-DEV-${invoiceId}`)
  url.searchParams.set('Status', 'NOK')
  url.searchParams.set('invoice', invoiceId)
  url.searchParams.set('provider', 'mock')
  return url.toString()
}
