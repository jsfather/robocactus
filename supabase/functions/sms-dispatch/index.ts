// Deno Edge Function: dispatch pending SMS (IPPanel + Kavenegar)
// Secrets: SUPABASE_*, SMS_PROVIDER|IPPANEL_*|KAVENEGAR_*, SMS_MOCK, SMS_PATTERNS

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type NotificationRow = {
  id: string
  team_id: string | null
  template_key: string
  status: string
  idempotency_key: string
  phone: string | null
  meta: Record<string, unknown> | null
}

type SmsRuntime = {
  provider: 'ippanel' | 'kavenegar'
  apiKey: string
  originator: string
  patternCodes: Record<string, string>
  mock: boolean
}

function normalizeIranPhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('09')) return digits
  if (digits.length === 12 && digits.startsWith('98')) return `0${digits.slice(2)}`
  if (digits.length === 10 && digits.startsWith('9')) return `0${digits}`
  return null
}

function metaToVars(meta: Record<string, unknown> | null): Record<string, string> {
  const vars: Record<string, string> = {}
  if (!meta) return vars
  for (const [k, v] of Object.entries(meta)) {
    if (v == null) continue
    vars[k] = String(v)
  }
  return vars
}

async function loadRuntime(supabase: ReturnType<typeof createClient>): Promise<SmsRuntime> {
  const { data } = await supabase.from('sms_settings').select('*').eq('id', 1).maybeSingle()
  const row = data as Record<string, unknown> | null

  const providerEnv = (Deno.env.get('SMS_PROVIDER') ?? '').toLowerCase()
  const provider =
    (row?.provider as string) === 'kavenegar' || providerEnv === 'kavenegar'
      ? 'kavenegar'
      : 'ippanel'

  let patternCodes: Record<string, string> = {}
  try {
    const fromDb = row?.pattern_codes
    if (fromDb && typeof fromDb === 'object') {
      patternCodes = { ...(fromDb as Record<string, string>) }
    }
  } catch {
    /* ignore */
  }
  try {
    patternCodes = {
      ...patternCodes,
      ...(JSON.parse(Deno.env.get('SMS_PATTERNS') ?? Deno.env.get('IPPANEL_PATTERNS') ?? '{}') as Record<
        string,
        string
      >),
    }
  } catch {
    /* ignore */
  }

  const mockEnv = (Deno.env.get('SMS_MOCK') ?? Deno.env.get('IPPANEL_MOCK') ?? 'true').toLowerCase()
  const dbMock = row?.mock_mode === true

  if (provider === 'kavenegar') {
    const apiKey = Deno.env.get('KAVENEGAR_API_KEY') ?? ''
    const originator =
      Deno.env.get('KAVENEGAR_SENDER') ?? (row?.kavenegar_sender as string) ?? (row?.originator as string) ?? ''
    return {
      provider,
      apiKey,
      originator,
      patternCodes,
      mock: mockEnv === 'true' || dbMock || !apiKey,
    }
  }

  const apiKey = Deno.env.get('IPPANEL_API_KEY') ?? ''
  const originator = Deno.env.get('IPPANEL_ORIGINATOR') ?? (row?.originator as string) ?? ''
  return {
    provider,
    apiKey,
    originator,
    patternCodes,
    mock: mockEnv === 'true' || dbMock || !apiKey,
  }
}

async function sendIppanel(
  runtime: SmsRuntime,
  phone: string,
  templateKey: string,
  vars: Record<string, string>,
): Promise<{ success: boolean; providerMessageId?: string; error?: string; mock?: boolean }> {
  if (runtime.mock) {
    return { success: true, mock: true, providerMessageId: `MOCK-ippanel-${templateKey}-${Date.now()}` }
  }
  const code = runtime.patternCodes[templateKey] ?? templateKey
  const res = await fetch('https://api2.ippanel.com/api/v1/sms/pattern/normal/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `AccessKey ${runtime.apiKey}`,
    },
    body: JSON.stringify({
      code,
      sender: runtime.originator,
      recipient: phone,
      variable: vars,
    }),
  })
  const json = await res.json().catch(() => ({}))
  const ok = res.ok && json?.meta?.status !== false
  if (!ok) {
    return { success: false, error: json?.meta?.message ?? json?.message ?? `HTTP ${res.status}` }
  }
  return {
    success: true,
    providerMessageId: json?.data?.message_id != null ? String(json.data.message_id) : undefined,
  }
}

async function sendKavenegar(
  runtime: SmsRuntime,
  phone: string,
  templateKey: string,
  vars: Record<string, string>,
): Promise<{ success: boolean; providerMessageId?: string; error?: string; mock?: boolean }> {
  if (runtime.mock) {
    return { success: true, mock: true, providerMessageId: `MOCK-kavenegar-${templateKey}-${Date.now()}` }
  }
  const template = runtime.patternCodes[templateKey] ?? templateKey
  const token = vars.token ?? vars.code ?? vars.otp ?? Object.values(vars)[0] ?? ''
  const token2 = vars.token2 ?? vars.name ?? ''
  const token3 = vars.token3 ?? vars.hint ?? ''

  if (token) {
    const qs = new URLSearchParams({ receptor: phone, template, token: String(token) })
    if (token2) qs.set('token2', String(token2))
    if (token3) qs.set('token3', String(token3))
    const res = await fetch(
      `https://api.kavenegar.com/v1/${runtime.apiKey}/verify/lookup.json?${qs.toString()}`,
    )
    const json = await res.json().catch(() => ({}))
    const status = json?.return?.status
    if (!res.ok || (status != null && status >= 400)) {
      return { success: false, error: json?.return?.message ?? `HTTP ${res.status}` }
    }
    return {
      success: true,
      providerMessageId: json?.entries?.[0]?.messageid != null ? String(json.entries[0].messageid) : undefined,
    }
  }

  const message = `[${templateKey}] ${Object.entries(vars)
    .map(([k, v]) => `${k}=${v}`)
    .join(' ')}`.trim()
  const qs = new URLSearchParams({ receptor: phone, message })
  if (runtime.originator) qs.set('sender', runtime.originator)
  const res = await fetch(`https://api.kavenegar.com/v1/${runtime.apiKey}/sms/send.json?${qs.toString()}`)
  const json = await res.json().catch(() => ({}))
  const status = json?.return?.status
  if (!res.ok || (status != null && status >= 400)) {
    return { success: false, error: json?.return?.message ?? `HTTP ${res.status}` }
  }
  return {
    success: true,
    providerMessageId: json?.entries?.[0]?.messageid != null ? String(json.entries[0].messageid) : undefined,
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const runtime = await loadRuntime(supabase)
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
    const limit = Number(body.limit ?? 50)
    const onlyKey = body.idempotency_key as string | undefined

    let pending: NotificationRow[] = []

    if (onlyKey) {
      const { data, error } = await supabase
        .from('notification_log')
        .select('*')
        .eq('idempotency_key', onlyKey)
        .maybeSingle()
      if (error) throw error
      if (data) pending = [data as NotificationRow]
    } else {
      const { data, error } = await supabase.rpc('list_pending_notifications', {
        p_limit: limit,
        p_channel: 'sms',
      })
      if (error) throw error
      pending = (data ?? []) as NotificationRow[]
    }

    const results: Array<Record<string, unknown>> = []

    for (const row of pending) {
      if ((row as { channel?: string }).channel === 'email') {
        results.push({ idempotency_key: row.idempotency_key, skipped: true, reason: 'email_channel' })
        continue
      }

      const { data: claimed, error: claimError } = await supabase.rpc('claim_notification_for_send', {
        p_idempotency_key: row.idempotency_key,
      })
      if (claimError) {
        results.push({ idempotency_key: row.idempotency_key, error: claimError.message })
        continue
      }

      const claimedRow = claimed as NotificationRow | null
      if (!claimedRow) {
        results.push({ idempotency_key: row.idempotency_key, skipped: true, reason: 'not_found' })
        continue
      }

      if (claimedRow.status === 'sent' || claimedRow.status === 'failed') {
        results.push({
          idempotency_key: claimedRow.idempotency_key,
          skipped: true,
          reason: `already_${claimedRow.status}`,
        })
        continue
      }

      if (claimedRow.status !== 'sending') {
        results.push({
          idempotency_key: claimedRow.idempotency_key,
          skipped: true,
          reason: `status_${claimedRow.status}`,
        })
        continue
      }

      if (claimedRow.meta && (claimedRow.meta as { skip?: string }).skip === 'missing_phone') {
        await supabase.rpc('finalize_notification', {
          p_idempotency_key: claimedRow.idempotency_key,
          p_success: false,
          p_error_message: 'missing_phone',
        })
        results.push({
          idempotency_key: claimedRow.idempotency_key,
          skipped: true,
          reason: 'missing_phone',
        })
        continue
      }

      const phone = normalizeIranPhone(claimedRow.phone ?? '')
      if (!phone) {
        await supabase.rpc('finalize_notification', {
          p_idempotency_key: claimedRow.idempotency_key,
          p_success: false,
          p_error_message: 'invalid_phone',
        })
        results.push({
          idempotency_key: claimedRow.idempotency_key,
          success: false,
          error: 'invalid_phone',
        })
        continue
      }

      const vars = metaToVars(claimedRow.meta)
      const sendResult =
        runtime.provider === 'kavenegar'
          ? await sendKavenegar(runtime, phone, claimedRow.template_key, vars)
          : await sendIppanel(runtime, phone, claimedRow.template_key, vars)

      await supabase.rpc('finalize_notification', {
        p_idempotency_key: claimedRow.idempotency_key,
        p_success: sendResult.success,
        p_provider_message_id: sendResult.providerMessageId ?? null,
        p_error_message: sendResult.error ?? null,
      })

      results.push({
        idempotency_key: claimedRow.idempotency_key,
        success: sendResult.success,
        mock: sendResult.mock ?? false,
        provider: runtime.provider,
        providerMessageId: sendResult.providerMessageId,
        error: sendResult.error,
      })
    }

    return new Response(
      JSON.stringify({ processed: results.length, provider: runtime.provider, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
