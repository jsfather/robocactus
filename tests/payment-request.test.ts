import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { paymentAmount, paymentMerchantId, paymentRequestPayload } from '../server/zarinpal.ts'
import { paymentRequestError } from '../src/lib/payment-gateway/errors.ts'

test('merchant settings trim whitespace and empty database values use environment fallback', () => {
  assert.equal(paymentMerchantId('  saved  ', 'env'), 'saved')
  assert.equal(paymentMerchantId(' ', ' env '), 'env')
  assert.equal(paymentMerchantId(null, undefined), '')
})

test('gateway requests use the canonical callback and exact rial amount, without private metadata', () => {
  const payload = paymentRequestPayload({ merchantId: 'merchant', amount: 125000, invoiceId: 'invoice', callbackOrigin: 'https://tabaresancup.com', description: ' Team registration ' })
  assert.deepEqual(payload, {
    merchant_id: 'merchant', amount: 125000, currency: 'IRR', description: 'Team registration',
    callback_url: 'https://tabaresancup.com/payments/callback?invoice=invoice',
  })
})

test('invalid invoice amounts are rejected rather than silently rounded', () => {
  for (const amount of [0, -1, 'NaN', Infinity, 12.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => paymentAmount(amount), /invalid_payment_amount/)
  }
  assert.equal(paymentAmount('125000.00'), 125000)
})

test('provider rejections retain the diagnostic code without exposing raw upstream messages', () => {
  assert.match(paymentRequestError('zarinpal_request_failed', -9), /-9/)
  assert.doesNotMatch(paymentRequestError('private upstream data'), /private/)
  assert.match(paymentRequestError('zarinpal_timeout'), /زمان/)
})

test('new attempts persist their environment and only matching requested attempts are reused', () => {
  const source = readFileSync(new URL('../server/payment.ts', import.meta.url), 'utf8')
  assert.match(source, /and sandbox=\$\{sandbox\} and status='requested'/)
  assert.match(source, /provider_code,sandbox/)
  assert.match(source, /const sandbox = attempt\.sandbox \?\? settings\.zarinpal_sandbox/)
})
