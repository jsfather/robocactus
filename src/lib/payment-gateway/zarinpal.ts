import type {
  PaymentGateway,
  PaymentRequest,
  PaymentStartResult,
  PaymentVerifyRequest,
  PaymentVerifyResult,
} from './types'
import { getPublicEnv } from '@/lib/env'

type ZarinpalRequestResponse = {
  data?: { authority?: string; code?: number; message?: string }
  errors?: unknown
}

type ZarinpalVerifyResponse = {
  data?: { code?: number; ref_id?: number; message?: string }
  errors?: unknown
}

/**
 * ZarinPal REST (v4). Merchant id from VITE_ZARINPAL_MERCHANT_ID.
 * Verification for production should run in Edge Function; browser verify is best-effort.
 */
export class ZarinPalGateway implements PaymentGateway {
  name = 'zarinpal'

  private get merchantId(): string {
    return getPublicEnv('VITE_ZARINPAL_MERCHANT_ID') ?? ''
  }

  private get sandbox(): boolean {
    return getPublicEnv('VITE_ZARINPAL_SANDBOX') === 'true'
  }

  private get baseUrl(): string {
    return this.sandbox
      ? 'https://sandbox.zarinpal.com/pg/v4/payment'
      : 'https://api.zarinpal.com/pg/v4/payment'
  }

  private get startPayUrl(): string {
    return this.sandbox
      ? 'https://sandbox.zarinpal.com/pg/StartPay/'
      : 'https://www.zarinpal.com/pg/StartPay/'
  }

  async startPayment(request: PaymentRequest): Promise<PaymentStartResult> {
    if (!this.merchantId) {
      return { success: false, error: 'VITE_ZARINPAL_MERCHANT_ID is not set' }
    }

    const res = await fetch(`${this.baseUrl}/request.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        merchant_id: this.merchantId,
        amount: Math.round(request.amount),
        description: request.description,
        callback_url: request.callbackUrl,
        metadata: request.metadata,
      }),
    })

    const json = (await res.json()) as ZarinpalRequestResponse
    const authority = json.data?.authority
    if (!authority || json.data?.code !== 100) {
      return {
        success: false,
        error: json.data?.message ?? 'ZarinPal request failed',
      }
    }

    return {
      success: true,
      reference: authority,
      redirectUrl: `${this.startPayUrl}${authority}`,
    }
  }

  async verifyPayment(request: PaymentVerifyRequest): Promise<PaymentVerifyResult> {
    if (!this.merchantId) {
      return { success: false, error: 'VITE_ZARINPAL_MERCHANT_ID is not set' }
    }

    const res = await fetch(`${this.baseUrl}/verify.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        merchant_id: this.merchantId,
        amount: Math.round(request.amount),
        authority: request.authority,
      }),
    })

    const json = (await res.json()) as ZarinpalVerifyResponse
    const code = json.data?.code
    if (code === 100 || code === 101) {
      return {
        success: true,
        reference: request.authority,
        refId: json.data?.ref_id,
      }
    }

    return {
      success: false,
      error: json.data?.message ?? 'ZarinPal verify failed',
    }
  }
}
