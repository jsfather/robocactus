/** Payment gateway adapter — ZarinPal + mock implementations */

import { getPublicEnv } from '@/lib/env'

export type PaymentRequest = {
  amount: number
  description: string
  callbackUrl: string
  metadata?: Record<string, string>
}

export type PaymentVerifyRequest = {
  authority: string
  amount: number
  invoiceId?: string
}

export type PaymentStartResult = {
  success: boolean
  redirectUrl?: string
  reference?: string
  error?: string
}

export type PaymentVerifyResult = {
  success: boolean
  reference?: string
  refId?: string | number
  error?: string
}

export type PaymentGateway = {
  name: string
  startPayment(request: PaymentRequest): Promise<PaymentStartResult>
  verifyPayment(request: PaymentVerifyRequest): Promise<PaymentVerifyResult>
}

export type GatewayKind = 'mock' | 'zarinpal'

export function getConfiguredGatewayKind(): GatewayKind {
  const raw = getPublicEnv('VITE_PAYMENT_PROVIDER')?.toLowerCase()
  if (raw === 'zarinpal') return 'zarinpal'
  return 'mock'
}
