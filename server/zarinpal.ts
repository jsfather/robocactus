export function paymentMerchantId(saved: string | null | undefined, environment: string | undefined): string {
  return saved?.trim() || environment?.trim() || ''
}

export function paymentAmount(value: string | number): number {
  const amount = Number(value)
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('invalid_payment_amount')
  return amount
}

export function paymentRequestPayload(input: {
  merchantId: string; amount: number; invoiceId: string; callbackOrigin: string; description: string
}) {
  return {
    merchant_id: input.merchantId,
    amount: paymentAmount(input.amount),
    // Invoice amounts throughout the application are Iranian rials.
    currency: 'IRR',
    description: input.description.trim().slice(0, 500) || 'Tabarestan Cup registration',
    callback_url: `${input.callbackOrigin}/payments/callback?invoice=${encodeURIComponent(input.invoiceId)}`,
  }
}
