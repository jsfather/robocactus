import type { Request, Router } from 'express'
import { sql } from 'drizzle-orm'
import { db, hashToken } from './db.js'

export type CaptchaContext = 'login' | 'signup' | 'password_reset' | 'contact' | 'live_chat'

type CaptchaSettings = {
  captcha_enabled?: boolean
  arcaptcha_site_key?: string | null
  arcaptcha_secret_key?: string | null
  captcha_on_login?: boolean
  captcha_on_signup?: boolean
  captcha_on_password_reset?: boolean
  captcha_on_contact?: boolean
  captcha_on_live_chat?: boolean
}

const formAttempts = new Map<string, { count: number; resetAt: number }>()
function formRateLimited(key: string, maximum: number, windowMs: number): boolean {
  const now = Date.now()
  const current = formAttempts.get(key)
  if (!current || current.resetAt <= now) {
    formAttempts.set(key, { count: 1, resetAt: now + windowMs })
    return false
  }
  current.count += 1
  return current.count > maximum
}

async function getCaptchaSettings(): Promise<CaptchaSettings> {
  const result = await db.execute(sql`select captcha_enabled, arcaptcha_site_key, arcaptcha_secret_key,
    captcha_on_login, captcha_on_signup, captcha_on_password_reset, captcha_on_contact, captcha_on_live_chat
    from public.auth_settings where id = 1 limit 1`)
  return (result.rows[0] ?? {}) as CaptchaSettings
}

function enabledFor(settings: CaptchaSettings, context: CaptchaContext): boolean {
  if (!settings.captcha_enabled) return false
  const toggles: Record<CaptchaContext, boolean | undefined> = {
    login: settings.captcha_on_login,
    signup: settings.captcha_on_signup,
    password_reset: settings.captcha_on_password_reset,
    contact: settings.captcha_on_contact,
    live_chat: settings.captcha_on_live_chat,
  }
  return toggles[context] !== false
}

async function logVerification(request: Request, context: CaptchaContext, success: boolean, errorCode?: string) {
  const ipHash = request.ip ? hashToken(`captcha:${request.ip}`) : null
  await db.execute(sql`
    insert into public.captcha_verification_log (context, success, ip_hash, error_code)
    values (${context}, ${success}, ${ipHash}, ${errorCode ?? null})
  `).catch(() => undefined)
}

export async function verifyCaptcha(request: Request, context: CaptchaContext): Promise<{ ok: true } | { ok: false; error: string }> {
  const settings = await getCaptchaSettings()
  if (!enabledFor(settings, context)) return { ok: true }
  const siteKey = settings.arcaptcha_site_key?.trim()
  const secretKey = settings.arcaptcha_secret_key?.trim()
  if (!siteKey || !secretKey) {
    await logVerification(request, context, false, 'captcha_not_configured')
    return { ok: false, error: 'captcha_not_configured' }
  }
  const challenge = String(request.body?.captchaToken ?? request.body?.captcha_token ?? '').trim()
  if (!challenge) {
    await logVerification(request, context, false, 'captcha_required')
    return { ok: false, error: 'captcha_required' }
  }
  try {
    const response = await fetch('https://arcaptcha.co/2/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ secret: secretKey, sitekey: siteKey, response: challenge }),
      signal: AbortSignal.timeout(12_000),
    })
    const body = await response.json().catch(() => ({})) as { success?: boolean; error_codes?: string[]; error?: string }
    const ok = response.ok && body.success === true
    const error = body.error_codes?.join(',') || body.error || (response.ok ? 'captcha_invalid' : `captcha_provider_${response.status}`)
    await logVerification(request, context, ok, ok ? undefined : error)
    return ok ? { ok: true } : { ok: false, error: 'captcha_invalid' }
  } catch (error) {
    await logVerification(request, context, false, error instanceof Error ? error.message : 'captcha_unavailable')
    return { ok: false, error: 'captcha_unavailable' }
  }
}

export function registerCaptchaRoutes(router: Router): void {
  router.get('/captcha/config', async (_request, response) => {
    const settings = await getCaptchaSettings()
    response.setHeader('Cache-Control', 'no-store')
    response.json({
      provider: 'arcaptcha',
      enabled: Boolean(settings.captcha_enabled && settings.arcaptcha_site_key),
      siteKey: settings.arcaptcha_site_key ?? null,
      contexts: {
        login: enabledFor(settings, 'login'), signup: enabledFor(settings, 'signup'),
        password_reset: enabledFor(settings, 'password_reset'), contact: enabledFor(settings, 'contact'),
        live_chat: enabledFor(settings, 'live_chat'),
      },
    })
  })

  router.post('/forms/contact', async (request, response) => {
    if (formRateLimited(`contact:${request.ip}`, 10, 60 * 60 * 1000)) {
      return void response.status(429).json({ error: 'rate_limited' })
    }
    const captcha = await verifyCaptcha(request, 'contact')
    if (!captcha.ok) return void response.status(400).json({ error: captcha.error })
    const fullName = String(request.body?.full_name ?? '').trim()
    const email = String(request.body?.email ?? '').trim().toLowerCase()
    const phone = String(request.body?.phone ?? '').trim() || null
    const subject = String(request.body?.subject ?? '').trim()
    const body = String(request.body?.body ?? '').trim()
    if (fullName.length < 2 || !/^\S+@\S+\.\S+$/.test(email) || subject.length < 2 || body.length < 5 || body.length > 5000) {
      return void response.status(400).json({ error: 'invalid_contact_form' })
    }
    await db.execute(sql`
      insert into public.contact_messages (full_name, email, phone, subject, body)
      values (${fullName}, ${email}, ${phone}, ${subject}, ${body})
    `)
    response.status(201).json({ ok: true })
  })

  router.post('/forms/live-chat/start', async (request, response) => {
    if (formRateLimited(`live-chat:${request.ip}`, 10, 15 * 60 * 1000)) {
      return void response.status(429).json({ error: 'rate_limited' })
    }
    const captcha = await verifyCaptcha(request, 'live_chat')
    if (!captcha.ok) return void response.status(400).json({ error: captcha.error })
    const name = String(request.body?.name ?? '').trim()
    const phone = String(request.body?.phone ?? '').trim()
    const locale = String(request.body?.locale ?? 'fa')
    if (name.length < 2 || !/^0?9\d{9}$/.test(phone.replace(/\D/g, ''))) {
      return void response.status(400).json({ error: 'invalid_chat_identity' })
    }
    const result = await db.execute(sql`select public.start_live_chat(${name}, ${phone}, ${locale}) as data`)
    response.status(201).json(result.rows[0]?.data ?? {})
  })
}
