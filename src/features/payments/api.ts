import { backend } from '@/lib/backend'
import { createPaymentGateway, buildMockFailUrl, getConfiguredGatewayKind } from '@/lib/payment-gateway'
import type { Invoice, League, Team } from '@/types/database'

export type FinanceRow = Invoice & {
  team_name: string
  team_status: string
  league_id: string
  league_name: string
  company_name: string
  company_slug: string
}

export type FinanceDeposit = {
  id: string
  invoice_id: string
  transaction_type: 'deposit' | 'refund' | 'adjustment'
  status: 'posted' | 'reversed'
  amount: number
  payment_method: 'online' | 'card_to_card' | 'manual'
  reference: string | null
  occurred_at: string
  invoice_number: string | null
  invoice_status: string
  team_name: string
  league_id: string
  league_name: string
  company_id: string
  company_name: string
}

export async function createInvoiceForTeam(teamId: string): Promise<Invoice> {
  const { data, error } = await backend.rpc('create_invoice_for_team', {
    p_team_id: teamId,
  })
  if (error) throw new Error(error.message)
  return data as Invoice
}

export async function acceptInvoiceTerms(invoiceId: string): Promise<Invoice> {
  const { data, error } = await backend.rpc('accept_invoice_terms', { p_invoice_id: invoiceId, p_version: '2026-08' })
  if (error) throw new Error(error.message)
  return data as Invoice
}

export async function fetchInvoice(invoiceId: string): Promise<Invoice | null> {
  const { data, error } = await backend
    .from('invoices')
    .select('*')
    .eq('id', invoiceId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data as Invoice | null
}

export async function fetchTeamInvoices(teamId: string): Promise<Invoice[]> {
  const { data, error } = await backend
    .from('invoices')
    .select('*')
    .eq('team_id', teamId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as Invoice[]
}

export async function fetchLatestInvoiceForTeam(teamId: string): Promise<Invoice | null> {
  const { data, error } = await backend
    .from('invoices')
    .select('*')
    .eq('team_id', teamId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data as Invoice | null
}

export async function submitCardReceipt(input: {
  invoiceId: string
  userId: string
  file: File
}): Promise<Invoice> {
  if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(input.file.type)) {
    throw new Error('فرمت فیش باید تصویر یا PDF باشد.')
  }
  if (input.file.size > 5 * 1024 * 1024) throw new Error('حجم فیش نباید بیشتر از ۵ مگابایت باشد.')
  const ext = input.file.name.split('.').pop() ?? 'bin'
  const path = `${input.userId}/${input.invoiceId}/receipt-${Date.now()}.${ext}`
  const { error: uploadError } = await backend.storage.from('payment-receipts').upload(path, input.file, {
    contentType: input.file.type,
    upsert: false,
  })
  if (uploadError) throw new Error(uploadError.message)
  const { data, error } = await backend.rpc('submit_card_receipt', {
    p_invoice_id: input.invoiceId,
    p_receipt_path: path,
  })
  if (error) throw new Error(error.message)
  return data as Invoice
}

export async function reviewCardReceipt(
  invoiceId: string,
  approved: boolean,
  reason?: string,
): Promise<Invoice> {
  const { data, error } = await backend.rpc('review_card_receipt', {
    p_invoice_id: invoiceId,
    p_approved: approved,
    p_reason: reason?.trim() || null,
  })
  if (error) throw new Error(error.message)
  return data as Invoice
}

export function receiptPrivateUrl(path: string): string {
  return backend.storage.from('payment-receipts').getPrivateUrl(path).data.privateUrl
}

export async function applyPaymentResult(input: {
  invoiceId: string
  authority: string
  success: boolean
  gatewayRef?: string
}): Promise<Invoice> {
  const { data, error } = await backend.rpc('apply_payment_result', {
    p_invoice_id: input.invoiceId,
    p_authority: input.authority,
    p_success: input.success,
    p_gateway_ref: input.gatewayRef ?? null,
  })
  if (error) throw new Error(error.message)
  return data as Invoice
}

export async function issueMockAuthority(invoiceId: string): Promise<string> {
  const { data, error } = await backend.rpc('issue_mock_payment_authority', {
    p_invoice_id: invoiceId,
  })
  if (error) throw new Error(error.message)
  return data as string
}

export function paymentCallbackUrl(invoiceId: string): string {
  const origin = window.location.origin
  return `${origin}/payments/callback?invoice=${encodeURIComponent(invoiceId)}`
}

export async function startTeamPayment(input: {
  team: Team
  league: League
  invoice: Invoice
}): Promise<{ redirectUrl: string; failUrl?: string }> {
  const gateway = createPaymentGateway()
  const callbackUrl = paymentCallbackUrl(input.invoice.id)
  const kind = getConfiguredGatewayKind()

  let metadata: Record<string, string> = {
    invoiceId: input.invoice.id,
    teamId: input.team.id,
  }

  if (kind === 'mock') {
    const authority = await issueMockAuthority(input.invoice.id)
    metadata = { ...metadata, authority }
  }

  const result = await gateway.startPayment({
    amount: Number(input.invoice.amount),
    description: `Tabarestan Cup · ${input.league.name} · ${input.team.name}`,
    callbackUrl,
    metadata,
  })

  if (!result.success || !result.redirectUrl) {
    throw new Error(result.error ?? 'payment start failed')
  }

  // For mock: prefer HMAC authority in redirect if gateway used MOCK-DEV
  if (kind === 'mock' && metadata.authority) {
    const url = new URL(result.redirectUrl)
    url.searchParams.set('Authority', metadata.authority)
    url.searchParams.set('Status', 'OK')
    url.searchParams.set('invoice', input.invoice.id)
    return {
      redirectUrl: url.toString(),
      failUrl: (() => {
        const fail = new URL(buildMockFailUrl(callbackUrl, input.invoice.id))
        fail.searchParams.set('Authority', metadata.authority)
        return fail.toString()
      })(),
    }
  }

  return { redirectUrl: result.redirectUrl }
}

export async function verifyGatewayThenApply(input: {
  invoice: Invoice
  authority: string
  gatewayStatusOk: boolean
}): Promise<Invoice> {
  const kind = getConfiguredGatewayKind()
  if (!input.gatewayStatusOk) {
    if (kind === 'zarinpal') return input.invoice
    return applyPaymentResult({
      invoiceId: input.invoice.id,
      authority: input.authority,
      success: false,
      gatewayRef: input.authority,
    })
  }

  const gateway = createPaymentGateway()
  const verified = await gateway.verifyPayment({
    authority: input.authority,
    amount: Number(input.invoice.amount),
    invoiceId: input.invoice.id,
  })

  if (kind === 'zarinpal') {
    if (!verified.success) throw new Error(verified.error ?? 'payment verification failed')
    const updated = await fetchInvoice(input.invoice.id)
    if (!updated) throw new Error('invoice not found after payment verification')
    return updated
  }

  // Still apply via RPC — never mutate team status from the client directly
  return applyPaymentResult({
    invoiceId: input.invoice.id,
    authority: input.authority,
    success: verified.success,
    gatewayRef: verified.refId != null ? String(verified.refId) : input.authority,
  })
}

export async function fetchFinanceRows(filters?: {
  status?: string
  leagueId?: string
  companyId?: string
}): Promise<FinanceRow[]> {
  let query = backend
    .from('invoice_finance_view')
    .select('*')
    .order('created_at', { ascending: false })

  if (filters?.status) query = query.eq('status', filters.status)
  if (filters?.leagueId) query = query.eq('league_id', filters.leagueId)
  if (filters?.companyId) query = query.eq('company_id', filters.companyId)

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []) as FinanceRow[]
}

export async function fetchFinanceDeposits(): Promise<FinanceDeposit[]> {
  const { data, error } = await backend.from('finance_deposit_view').select('*').order('occurred_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as FinanceDeposit[]
}

export async function adminUpdateInvoice(input: {
  invoiceId: string
  amount: number
  status: 'pending' | 'paid' | 'failed' | 'refunded'
  paymentMethod: 'online' | 'card_to_card'
  adminNote?: string | null
}): Promise<Invoice> {
  const { data, error } = await backend.rpc('admin_update_invoice', {
    p_invoice_id: input.invoiceId, p_amount: input.amount, p_status: input.status,
    p_payment_method: input.paymentMethod, p_admin_note: input.adminNote?.trim() || null,
  })
  if (error) throw new Error(error.message)
  return data as Invoice
}

export async function adminArchiveInvoice(invoiceId: string, archived = true): Promise<Invoice> {
  const { data, error } = await backend.rpc('admin_archive_invoice', { p_invoice_id: invoiceId, p_archived: archived })
  if (error) throw new Error(error.message)
  return data as Invoice
}

export async function adminDeleteInvoice(invoiceId: string): Promise<void> {
  const { error } = await backend.rpc('admin_delete_invoice', { p_invoice_id: invoiceId })
  if (error) throw new Error(error.message)
}

export function formatAmountToman(amount: number): string {
  return new Intl.NumberFormat('fa-IR').format(amount)
}
