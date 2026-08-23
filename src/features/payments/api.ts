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

export async function createInvoiceForTeam(teamId: string): Promise<Invoice> {
  const { data, error } = await backend.rpc('create_invoice_for_team', {
    p_team_id: teamId,
  })
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
    description: `RoboCup Tabarestan · ${input.league.name} · ${input.team.name}`,
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
  if (!input.gatewayStatusOk) {
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
  })

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

export function formatAmountToman(amount: number): string {
  return new Intl.NumberFormat('fa-IR').format(amount)
}
