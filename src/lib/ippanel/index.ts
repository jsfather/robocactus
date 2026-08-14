/** SMS providers: IPPanel + Kavenegar (+ mock) */

import { getPublicEnvMap } from '@/lib/env'

export type SmsProviderKind = 'ippanel' | 'kavenegar'

export type SmsPayload = {
  phone: string
  templateKey: string
  vars?: Record<string, string>
  /** Plain message fallback for providers that need free-text */
  message?: string
}

export type SmsSendResult = {
  success: boolean
  providerMessageId?: string
  skipped?: boolean
  error?: string
  mock?: boolean
  provider?: SmsProviderKind
}

export type SmsProviderConfig = {
  provider: SmsProviderKind
  apiKey: string
  originator: string
  patternCodes: Record<string, string>
  mock: boolean
}

const DEFAULT_PATTERNS: Record<string, string> = {
  registration_submitted: 'registration_submitted',
  payment_confirmed: 'payment_confirmed',
  registration_approved: 'registration_approved',
  registration_rejected: 'registration_rejected',
  registration_waitlisted: 'registration_waitlisted',
  registration_deadline_reminder: 'registration_deadline_reminder',
  result_announced: 'result_announced',
  auth_otp: 'auth_otp',
  account_approved: 'account_approved',
  account_issue: 'account_issue',
  incomplete_profile: 'incomplete_profile',
  league_joined: 'league_joined',
  manual_broadcast: 'manual_broadcast',
}

export function normalizeIranPhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('09')) return digits
  if (digits.length === 12 && digits.startsWith('98')) return `0${digits.slice(2)}`
  if (digits.length === 10 && digits.startsWith('9')) return `0${digits}`
  return null
}

export function loadSmsConfigFromEnv(
  env: Record<string, string | undefined> = getPublicEnvMap(),
): SmsProviderConfig {
  const provider = (env.VITE_SMS_PROVIDER ?? env.SMS_PROVIDER ?? 'ippanel').toLowerCase() as SmsProviderKind
  const useKavenegar = provider === 'kavenegar'
  const apiKey = useKavenegar
    ? (env.VITE_KAVENEGAR_API_KEY ?? env.KAVENEGAR_API_KEY ?? '')
    : (env.VITE_IPPANEL_API_KEY ?? env.IPPANEL_API_KEY ?? '')
  const originator = useKavenegar
    ? (env.VITE_KAVENEGAR_SENDER ?? env.KAVENEGAR_SENDER ?? '')
    : (env.VITE_IPPANEL_ORIGINATOR ?? env.IPPANEL_ORIGINATOR ?? '')
  const mockFlag = (
    env.VITE_SMS_MOCK ??
    env.SMS_MOCK ??
    env.VITE_IPPANEL_MOCK ??
    env.IPPANEL_MOCK ??
    'true'
  ).toLowerCase()

  let patternCodes = { ...DEFAULT_PATTERNS }
  const patternsRaw = env.VITE_SMS_PATTERNS ?? env.SMS_PATTERNS ?? env.VITE_IPPANEL_PATTERNS
  if (patternsRaw) {
    try {
      patternCodes = { ...patternCodes, ...(JSON.parse(patternsRaw) as Record<string, string>) }
    } catch {
      /* keep defaults */
    }
  }

  return {
    provider: useKavenegar ? 'kavenegar' : 'ippanel',
    apiKey,
    originator,
    patternCodes,
    mock: mockFlag === 'true' || !apiKey,
  }
}

/** @deprecated use loadSmsConfigFromEnv */
export const loadIppanelConfigFromEnv = loadSmsConfigFromEnv
export type IppanelConfig = SmsProviderConfig

async function sendIppanel(
  payload: SmsPayload,
  config: SmsProviderConfig,
): Promise<SmsSendResult> {
  const code = config.patternCodes[payload.templateKey] ?? payload.templateKey
  const res = await fetch('https://api2.ippanel.com/api/v1/sms/pattern/normal/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `AccessKey ${config.apiKey}`,
    },
    body: JSON.stringify({
      code,
      sender: config.originator,
      recipient: payload.phone,
      variable: payload.vars ?? {},
    }),
  })

  const json = (await res.json().catch(() => ({}))) as {
    data?: { message_id?: string | number }
    meta?: { status?: boolean; message?: string }
    message?: string
  }

  const ok = res.ok && json.meta?.status !== false
  if (!ok) {
    return {
      success: false,
      provider: 'ippanel',
      error: json.meta?.message ?? json.message ?? `IPPanel HTTP ${res.status}`,
    }
  }

  return {
    success: true,
    provider: 'ippanel',
    providerMessageId: json.data?.message_id != null ? String(json.data.message_id) : undefined,
  }
}

async function sendKavenegar(
  payload: SmsPayload,
  config: SmsProviderConfig,
): Promise<SmsSendResult> {
  const template = config.patternCodes[payload.templateKey] ?? payload.templateKey
  const vars = payload.vars ?? {}
  const token = vars.token ?? vars.code ?? vars.otp ?? Object.values(vars)[0] ?? ''
  const token2 = vars.token2 ?? vars.name ?? ''
  const token3 = vars.token3 ?? vars.extra ?? ''

  // Prefer pattern/lookup when we have a token; else free-text send
  if (token) {
    const qs = new URLSearchParams({
      receptor: payload.phone,
      template,
      token: String(token),
    })
    if (token2) qs.set('token2', String(token2))
    if (token3) qs.set('token3', String(token3))

    const res = await fetch(
      `https://api.kavenegar.com/v1/${config.apiKey}/verify/lookup.json?${qs.toString()}`,
    )
    const json = (await res.json().catch(() => ({}))) as {
      return?: { status?: number; message?: string }
      entries?: Array<{ messageid?: number }>
    }
    const status = json.return?.status
    if (!res.ok || (status != null && status >= 400)) {
      return {
        success: false,
        provider: 'kavenegar',
        error: json.return?.message ?? `Kavenegar HTTP ${res.status}`,
      }
    }
    return {
      success: true,
      provider: 'kavenegar',
      providerMessageId: json.entries?.[0]?.messageid != null ? String(json.entries[0].messageid) : undefined,
    }
  }

  const message =
    payload.message ||
    `[${payload.templateKey}] ${Object.entries(vars)
      .map(([k, v]) => `${k}=${v}`)
      .join(' ')}`.trim()

  const qs = new URLSearchParams({
    receptor: payload.phone,
    message,
  })
  if (config.originator) qs.set('sender', config.originator)

  const res = await fetch(
    `https://api.kavenegar.com/v1/${config.apiKey}/sms/send.json?${qs.toString()}`,
  )
  const json = (await res.json().catch(() => ({}))) as {
    return?: { status?: number; message?: string }
    entries?: Array<{ messageid?: number }>
  }
  const status = json.return?.status
  if (!res.ok || (status != null && status >= 400)) {
    return {
      success: false,
      provider: 'kavenegar',
      error: json.return?.message ?? `Kavenegar HTTP ${res.status}`,
    }
  }
  return {
    success: true,
    provider: 'kavenegar',
    providerMessageId: json.entries?.[0]?.messageid != null ? String(json.entries[0].messageid) : undefined,
  }
}

export async function sendSms(
  payload: SmsPayload,
  config: SmsProviderConfig = loadSmsConfigFromEnv(),
): Promise<SmsSendResult> {
  const phone = normalizeIranPhone(payload.phone)
  if (!phone) {
    return { success: false, error: 'invalid phone', provider: config.provider }
  }

  if (config.mock) {
    return {
      success: true,
      mock: true,
      skipped: false,
      provider: config.provider,
      providerMessageId: `MOCK-${config.provider}-${payload.templateKey}-${Date.now()}`,
    }
  }

  const normalized = { ...payload, phone }
  if (config.provider === 'kavenegar') {
    return sendKavenegar(normalized, config)
  }
  return sendIppanel(normalized, config)
}

export const SMS_TEMPLATES = Object.keys(DEFAULT_PATTERNS)
export const SMS_PROVIDERS: SmsProviderKind[] = ['ippanel', 'kavenegar']
