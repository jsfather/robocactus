import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { getPublicEnv } from '@/lib/env'
import { normalizeIranPhone } from '@/lib/ippanel'

type OtpRequestResult =
  | { ok: true; expires_in_sec: number; dev_code?: string }
  | { ok: false; error: string; retry_after_sec?: number }

type OtpVerifyResult =
  | { ok: true; token_hash: string; email: string }
  | { ok: false; error: string }

async function callSmsOtp(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const url = getPublicEnv('VITE_SUPABASE_URL')
  const anon = getPublicEnv('VITE_SUPABASE_ANON_KEY')
  if (!url || !anon) throw new Error('supabase_missing')

  const res = await fetch(`${url}/functions/v1/sms-otp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${anon}`,
      apikey: anon,
    },
    body: JSON.stringify(body),
  })

  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    return { error: String(json.error ?? `http_${res.status}`), ...json }
  }
  return json
}

export async function requestSmsOtp(phoneRaw: string): Promise<OtpRequestResult> {
  if (!isSupabaseConfigured()) return { ok: false, error: 'supabase_missing' }
  const phone = normalizeIranPhone(phoneRaw)
  if (!phone) return { ok: false, error: 'invalid_phone' }

  const json = await callSmsOtp({ action: 'request', phone })
  if (json.error) {
    return {
      ok: false,
      error: String(json.error),
      retry_after_sec: json.retry_after_sec != null ? Number(json.retry_after_sec) : undefined,
    }
  }
  return {
    ok: true,
    expires_in_sec: Number(json.expires_in_sec ?? 300),
    dev_code: json.dev_code != null ? String(json.dev_code) : undefined,
  }
}

export async function verifySmsOtp(input: {
  phone: string
  code: string
  fullName?: string
}): Promise<OtpVerifyResult> {
  if (!isSupabaseConfigured()) return { ok: false, error: 'supabase_missing' }
  const phone = normalizeIranPhone(input.phone)
  if (!phone) return { ok: false, error: 'invalid_phone' }

  const json = await callSmsOtp({
    action: 'verify',
    phone,
    code: input.code,
    full_name: input.fullName ?? '',
  })

  if (json.error || !json.token_hash) {
    return { ok: false, error: String(json.error ?? 'verify_failed') }
  }

  return {
    ok: true,
    token_hash: String(json.token_hash),
    email: String(json.email ?? ''),
  }
}

export async function completeSmsOtpSession(tokenHash: string): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.verifyOtp({
    type: 'email',
    token_hash: tokenHash,
  })
  if (error) return { error: error.message }
  return { error: null }
}
