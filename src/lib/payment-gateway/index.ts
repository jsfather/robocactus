import { getConfiguredGatewayKind, type PaymentGateway } from './types'
import { MockPaymentGateway } from './mock'
import { ZarinPalGateway } from './zarinpal'

export type {
  PaymentGateway,
  PaymentRequest,
  PaymentStartResult,
  PaymentVerifyRequest,
  PaymentVerifyResult,
  GatewayKind,
} from './types'

export { getConfiguredGatewayKind } from './types'
export { buildMockFailUrl } from './mock'

export function createPaymentGateway(): PaymentGateway {
  const kind = getConfiguredGatewayKind()
  if (kind === 'zarinpal') return new ZarinPalGateway()
  return new MockPaymentGateway()
}
