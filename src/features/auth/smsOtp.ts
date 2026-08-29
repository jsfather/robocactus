import { isBackendConfigured, backend } from '@/lib/backend'
import { getPublicEnv } from '@/lib/env'
import { normalizeIranPhone } from '@/lib/ippanel'

type OtpRequestResult =
  | { ok: true; challenge_id: string; expires_in_sec: number; resend_after_sec: number; dev_code?: string }
  | { ok: false; error: string; retry_after_sec?: number }

type OtpVerifyResult =
  | { ok: true; token_hash: string; email: string; registration_required: boolean; next_path: string }
  | { ok: true; profile_verified: true }
  | { ok: true; password_reset_token: string }
  | { ok: false; error: string }

async function callSmsOtp(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const url = getPublicEnv('VITE_API_URL')?.replace(/\/$/, '') ?? ''

  try {
    const res = await fetch(`${url}/api/auth/sms-otp`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body),
    })
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) return { ...json, error: String(json.error ?? (res.status >= 500 ? 'server_error' : `http_${res.status}`)) }
    return json
  } catch {
    return { error: 'server_error' }
  }
}

export type OtpPurpose = 'login' | 'signup' | 'profile' | 'password_reset'

export async function requestSmsOtp(phoneRaw: string, purpose: OtpPurpose = 'login', captchaToken?: string): Promise<OtpRequestResult> {
  if (!isBackendConfigured()) return { ok: false, error: 'backend_missing' }
  const phone = normalizeIranPhone(phoneRaw)
  if (!phone) return { ok: false, error: 'invalid_phone' }

  const json = await callSmsOtp({ action: 'request', phone, purpose, captchaToken })
  if (json.error) {
    return {
      ok: false,
      error: String(json.error),
      retry_after_sec: json.retry_after_sec != null ? Number(json.retry_after_sec) : undefined,
    }
  }
  if (!json.challenge_id) return { ok: false, error: 'server_error' }
  return {
    ok: true,
    challenge_id: String(json.challenge_id),
    expires_in_sec: Number(json.expires_in_sec ?? 300),
    resend_after_sec: Number(json.resend_after_sec ?? 60),
    dev_code: json.dev_code != null ? String(json.dev_code) : undefined,
  }
}

export async function verifySmsOtp(input: {
  phone: string
  code: string
  fullName?: string
  purpose?: OtpPurpose
  challengeId: string
}): Promise<OtpVerifyResult> {
  if (!isBackendConfigured()) return { ok: false, error: 'backend_missing' }
  const phone = normalizeIranPhone(input.phone)
  if (!phone) return { ok: false, error: 'invalid_phone' }

  const json = await callSmsOtp({
    action: 'verify',
    phone,
    code: input.code,
    full_name: input.fullName ?? '',
    purpose: input.purpose ?? 'login',
    challenge_id: input.challengeId,
  })

  if (json.profile_verified === true) return { ok: true, profile_verified: true }
  if (json.password_reset_token) return { ok: true, password_reset_token: String(json.password_reset_token) }
  if (json.error || !json.token_hash) {
    return { ok: false, error: String(json.error ?? 'server_error') }
  }

  return {
    ok: true,
    token_hash: String(json.token_hash),
    email: String(json.email ?? ''),
    registration_required: json.registration_required === true,
    next_path: String(json.next_path ?? '/dashboard'),
  }
}

export async function completeSmsOtpSession(tokenHash: string): Promise<{ error: string | null }> {
  const { error } = await backend.auth.verifyOtp({
    type: 'sms_otp',
    token_hash: tokenHash,
  })
  if (error) return { error: error.message }
  return { error: null }
}
