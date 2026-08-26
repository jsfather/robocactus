import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import type { CookieOptions, Request, Response, Router } from 'express'
import { and, eq, gt, isNull, or, sql } from 'drizzle-orm'
import { oneTimeTokens, sessions, users } from '../db/schema.js'
import { config } from './config.js'
import { db, hashToken, type AuthUser, userFromRequest } from './db.js'
import { verifyCaptcha } from './captcha.js'

const scrypt = promisify(scryptCallback)
const attempts = new Map<string, { count: number; resetAt: number }>()
const cookieOptions: CookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: config.isProduction,
  path: '/',
  maxAge: config.sessionDays * 24 * 60 * 60 * 1000,
}

function publicUser(row: typeof users.$inferSelect): AuthUser {
  return {
    id: row.id,
    email: row.email,
    phone: row.phone,
    user_metadata: (row.rawUserMetaData ?? {}) as Record<string, unknown>,
    created_at: row.createdAt.toISOString(),
  }
}

function rateLimited(key: string, maximum: number, windowMs: number): boolean {
  const now = Date.now()
  if (attempts.size > 5000) {
    for (const [attemptKey, value] of attempts) {
      if (value.resetAt <= now) attempts.delete(attemptKey)
    }
  }
  const current = attempts.get(key)
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + windowMs })
    return false
  }
  current.count += 1
  return current.count > maximum
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex')
  const derived = (await scrypt(password, salt, 64)) as Buffer
  return `scrypt:${salt}:${derived.toString('hex')}`
}

async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false
  const [algorithm, salt, expectedHex] = stored.split(':')
  if (algorithm !== 'scrypt' || !salt || !expectedHex) return false
  const actual = (await scrypt(password, salt, 64)) as Buffer
  const expected = Buffer.from(expectedHex, 'hex')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

async function createSession(response: Response, user: typeof users.$inferSelect) {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + config.sessionDays * 24 * 60 * 60 * 1000)
  await db.insert(sessions).values({
    id: randomUUID(),
    userId: user.id,
    tokenHash: hashToken(token),
    expiresAt,
  })
  response.cookie('rc_session', token, cookieOptions)
  return {
    access_token: 'http-only-cookie',
    expires_at: Math.floor(expiresAt.getTime() / 1000),
    user: publicUser(user),
  }
}

async function findUserByEmail(email: string) {
  return (await db.select().from(users).where(eq(users.email, email)).limit(1))[0] ?? null
}

export type AuthSettings = {
  otp_login_enabled: boolean
  password_login_enabled: boolean
  email_magic_login_enabled: boolean
  email_signup_enabled: boolean
  phone_signup_enabled: boolean
  online_payment_enabled: boolean
  card_to_card_enabled: boolean
  bank_card_number: string | null
  bank_iban: string | null
  bank_account_owner: string | null
  email_provider?: string
  email_from?: string | null
  email_api_key?: string | null
  sms_provider?: 'ippanel' | 'kavenegar'
  ippanel_api_key?: string | null
  ippanel_originator?: string | null
  kavenegar_api_key?: string | null
  kavenegar_sender?: string | null
  kavenegar_default_type?: number
  kavenegar_default_tag?: string | null
  kavenegar_default_policy?: string | null
  kavenegar_webhook_secret?: string | null
  captcha_provider?: 'arcaptcha'
  captcha_enabled?: boolean
  arcaptcha_site_key?: string | null
  arcaptcha_secret_key?: string | null
  captcha_on_login?: boolean
  captcha_on_signup?: boolean
  captcha_on_password_reset?: boolean
  captcha_on_contact?: boolean
  captcha_on_live_chat?: boolean
  sms_patterns?: Record<string, string> | null
  zarinpal_merchant_id?: string | null
  zarinpal_sandbox?: boolean
}

const defaultAuthSettings: AuthSettings = {
  otp_login_enabled: true,
  password_login_enabled: true,
  email_magic_login_enabled: true,
  email_signup_enabled: true,
  phone_signup_enabled: true,
  online_payment_enabled: true,
  card_to_card_enabled: false,
  bank_card_number: null,
  bank_iban: null,
  bank_account_owner: null,
}

export async function getAuthSettings(includeSecrets = false): Promise<AuthSettings> {
  const result = await db.execute(sql.raw(`select * from public.auth_settings where id = 1 limit 1`))
    .catch(() => ({ rows: [] as Record<string, unknown>[] }))
  const row = result.rows[0] as Partial<AuthSettings> | undefined
  const settings = { ...defaultAuthSettings, ...(row ?? {}) }
  if (!includeSecrets) {
    delete settings.email_api_key
    delete settings.email_provider
    delete settings.email_from
    delete settings.ippanel_api_key
    delete settings.ippanel_originator
    delete settings.kavenegar_api_key
    delete settings.kavenegar_sender
    delete settings.kavenegar_default_type
    delete settings.kavenegar_default_tag
    delete settings.kavenegar_default_policy
    delete settings.kavenegar_webhook_secret
    delete settings.arcaptcha_secret_key
    delete settings.sms_patterns
    delete settings.sms_provider
    delete settings.zarinpal_merchant_id
    delete settings.zarinpal_sandbox
  }
  return settings
}

async function findUserByIdentifier(identifier: string) {
  const normalized = identifier.trim().toLowerCase()
  const phone = normalized.replace(/\D/g, '')
  const normalizedPhone = phone.length === 12 && phone.startsWith('98') ? `0${phone.slice(2)}` : phone
  return (await db.select().from(users).where(or(
    eq(users.email, normalized),
    eq(users.username, normalized),
    eq(users.phone, normalizedPhone),
  )).limit(1))[0] ?? null
}

async function createOneTimeToken(userId: string, kind: string, redirectTo?: string | null) {
  const token = randomBytes(32).toString('base64url')
  await db.insert(oneTimeTokens).values({
    id: randomUUID(),
    userId,
    tokenHash: hashToken(token),
    kind,
    redirectTo: redirectTo ?? null,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
  })
  return token
}

async function sendMagicLink(email: string, link: string): Promise<void> {
  const emailSettings = await getAuthSettings(true)
  const apiKey = emailSettings.email_api_key || process.env.RESEND_API_KEY
  if ((config.emailMock && !emailSettings.email_api_key) || !apiKey) {
    console.log(`[email:mock] magic link for ${email}: ${link}`)
    return
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: emailSettings.email_from || process.env.EMAIL_FROM || 'Tabarestan Cup <onboarding@resend.dev>',
      to: [email],
      subject: 'Sign in to Tabarestan Cup',
      text: `Open this secure link to continue: ${link}`,
    }),
  })
  if (!response.ok) throw new Error(`email_provider_${response.status}`)
}

async function sendPasswordResetLink(email: string, link: string): Promise<void> {
  const emailSettings = await getAuthSettings(true)
  const apiKey = emailSettings.email_api_key || process.env.RESEND_API_KEY
  if ((config.emailMock && !emailSettings.email_api_key) || !apiKey) {
    console.log(`[email:mock] password reset for ${email}: ${link}`)
    return
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: emailSettings.email_from || process.env.EMAIL_FROM || 'Tabarestan Cup <onboarding@resend.dev>',
      to: [email],
      subject: 'بازیابی رمز عبور جام تبرستان',
      text: `برای تعیین رمز عبور جدید، این پیوند امن را باز کنید. اعتبار پیوند ۱۵ دقیقه است:\n${link}`,
    }),
  })
  if (!response.ok) throw new Error(`email_provider_${response.status}`)
}

async function emailDeliveryIsMock(): Promise<boolean> {
  const settings = await getAuthSettings(true)
  const apiKey = settings.email_api_key || process.env.RESEND_API_KEY
  return !apiKey || (config.emailMock && !settings.email_api_key)
}

export function registerAuthRoutes(router: Router): void {
  router.get('/auth/options', async (_request, response) => {
    response.json({ options: await getAuthSettings(false) })
  })

  router.get('/auth/session', async (request, response) => {
    const user = await userFromRequest(request)
    response.json({ session: user ? { access_token: 'http-only-cookie', user } : null, user })
  })

  router.post('/auth/sign-in', async (request, response) => {
    const settings = await getAuthSettings()
    if (!settings.password_login_enabled) {
      response.status(403).json({ error: 'password_login_disabled' })
      return
    }
    const captcha = await verifyCaptcha(request, 'login')
    if (!captcha.ok) return void response.status(400).json({ error: captcha.error })
    if (rateLimited(`sign-in:${request.ip}`, 15, 15 * 60 * 1000)) {
      response.status(429).json({ error: 'too_many_attempts' })
      return
    }
    const identifier = String(request.body?.identifier ?? request.body?.email ?? '').trim().toLowerCase()
    const password = String(request.body?.password ?? '')
    const user = await findUserByIdentifier(identifier)
    if (!user || !(await verifyPassword(password, user.encryptedPassword))) {
      response.status(400).json({ error: 'invalid_credentials' })
      return
    }
    if (!user.emailConfirmedAt) {
      response.status(400).json({ error: 'email_not_confirmed' })
      return
    }
    response.json({ session: await createSession(response, user), user: publicUser(user) })
  })

  router.post('/auth/sign-up', async (request, response) => {
    const settings = await getAuthSettings()
    if (!settings.email_signup_enabled) {
      response.status(403).json({ error: 'email_signup_disabled' })
      return
    }
    const captcha = await verifyCaptcha(request, 'signup')
    if (!captcha.ok) return void response.status(400).json({ error: captcha.error })
    if (rateLimited(`sign-up:${request.ip}`, 10, 60 * 60 * 1000)) {
      response.status(429).json({ error: 'too_many_attempts' })
      return
    }
    const email = String(request.body?.email ?? '').trim().toLowerCase()
    const password = String(request.body?.password ?? '')
    const requestedMetadata = (request.body?.metadata ?? {}) as Record<string, unknown>
    const username = String(requestedMetadata.username ?? '').trim().toLowerCase() || null
    const metadata = {
      full_name: String(requestedMetadata.full_name ?? '').trim() || 'کاربر جدید',
      username,
      phone: String(requestedMetadata.phone ?? '').trim(),
      auth_channel: requestedMetadata.auth_channel === 'phone' ? 'phone' : 'email',
      email,
    }
    if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 8) {
      response.status(400).json({ error: 'invalid_signup' })
      return
    }
    if (await findUserByEmail(email)) {
      response.status(409).json({ error: 'user_already_exists' })
      return
    }
    if (username && await findUserByIdentifier(username)) {
      response.status(409).json({ error: 'username_already_exists' })
      return
    }
    const inserted = await db
      .insert(users)
      .values({
        id: randomUUID(),
        email,
        username,
        phone: metadata.phone ? String(metadata.phone) : null,
        encryptedPassword: await hashPassword(password),
        rawUserMetaData: metadata,
        emailConfirmedAt: null,
      })
      .returning()
    const user = inserted[0]
    if (!user) throw new Error('signup_failed')
    const token = await createOneTimeToken(user.id, 'email_confirmation', request.body?.redirectTo)
    const requested = new URL(String(request.body?.redirectTo ?? '/auth/callback'), config.appUrl)
    const callback = requested.origin === new URL(config.appUrl).origin
      ? requested
      : new URL('/auth/callback', config.appUrl)
    callback.searchParams.set('code', token)
    const link = callback.toString()
    await sendMagicLink(email, link)
    response.status(201).json({ session: null, user: publicUser(user), ...(!config.isProduction && (await emailDeliveryIsMock()) ? { dev_link: link } : {}) })
  })

  router.post('/auth/magic-link', async (request, response) => {
    const settings = await getAuthSettings()
    if (!settings.email_magic_login_enabled) {
      response.status(403).json({ error: 'email_magic_login_disabled' })
      return
    }
    const captcha = await verifyCaptcha(request, 'login')
    if (!captcha.ok) return void response.status(400).json({ error: captcha.error })
    const email = String(request.body?.email ?? '').trim().toLowerCase()
    if (rateLimited(`magic-link:${request.ip}:${email}`, 5, 15 * 60 * 1000)) {
      response.status(429).json({ error: 'too_many_attempts' })
      return
    }
    const user = await findUserByEmail(email)
    if (user) {
      const token = await createOneTimeToken(user.id, 'magic_link', request.body?.redirectTo)
      const requested = new URL(String(request.body?.redirectTo ?? '/auth/callback'), config.appUrl)
      const callback = requested.origin === new URL(config.appUrl).origin
        ? requested
        : new URL('/auth/callback', config.appUrl)
      callback.searchParams.set('code', token)
      const link = callback.toString()
      await sendMagicLink(email, link)
      response.json({ ok: true, ...(!config.isProduction && (await emailDeliveryIsMock()) ? { dev_link: link } : {}) })
      return
    }
    response.json({ ok: true })
  })

  router.post('/auth/password-reset/request', async (request, response) => {
    const captcha = await verifyCaptcha(request, 'password_reset')
    if (!captcha.ok) return void response.status(400).json({ error: captcha.error })
    const email = String(request.body?.email ?? '').trim().toLowerCase()
    if (rateLimited(`password-reset:${request.ip}:${email}`, 5, 15 * 60 * 1000)) {
      response.status(429).json({ error: 'too_many_attempts' })
      return
    }
    const user = /^\S+@\S+\.\S+$/.test(email) ? await findUserByEmail(email) : null
    if (!user) {
      response.json({ ok: true })
      return
    }
    const token = await createOneTimeToken(user.id, 'password_reset', '/reset-password')
    const link = new URL('/reset-password', config.appUrl)
    link.searchParams.set('code', token)
    await sendPasswordResetLink(email, link.toString())
    response.json({ ok: true, ...(!config.isProduction && (await emailDeliveryIsMock()) ? { dev_link: link.toString() } : {}) })
  })

  router.post('/auth/password-reset/confirm', async (request, response) => {
    const code = String(request.body?.code ?? '')
    const password = String(request.body?.password ?? '')
    if (!code || password.length < 8) {
      response.status(400).json({ error: 'invalid_password_reset' })
      return
    }
    const tokenHash = hashToken(code)
    const changed = await db.transaction(async (transaction) => {
      const rows = await transaction
        .select({ token: oneTimeTokens, user: users })
        .from(oneTimeTokens)
        .innerJoin(users, eq(oneTimeTokens.userId, users.id))
        .where(and(
          eq(oneTimeTokens.tokenHash, tokenHash),
          eq(oneTimeTokens.kind, 'password_reset'),
          isNull(oneTimeTokens.consumedAt),
          gt(oneTimeTokens.expiresAt, new Date()),
        ))
        .limit(1)
      const row = rows[0]
      if (!row) return false
      await transaction.update(oneTimeTokens).set({ consumedAt: new Date() }).where(eq(oneTimeTokens.id, row.token.id))
      await transaction.update(users).set({
        encryptedPassword: await hashPassword(password),
        emailConfirmedAt: row.user.emailConfirmedAt ?? new Date(),
        updatedAt: new Date(),
      }).where(eq(users.id, row.user.id))
      await transaction.delete(sessions).where(eq(sessions.userId, row.user.id))
      return true
    })
    if (!changed) {
      response.status(400).json({ error: 'invalid_or_expired_token' })
      return
    }
    response.json({ ok: true })
  })

  router.post('/auth/exchange', async (request, response) => {
    const tokenHash = hashToken(String(request.body?.code ?? request.body?.token_hash ?? ''))
    const result = await db.transaction(async (transaction) => {
      const rows = await transaction
        .select({ token: oneTimeTokens, user: users })
        .from(oneTimeTokens)
        .innerJoin(users, eq(oneTimeTokens.userId, users.id))
        .where(
          and(
            eq(oneTimeTokens.tokenHash, tokenHash),
            isNull(oneTimeTokens.consumedAt),
            gt(oneTimeTokens.expiresAt, new Date()),
          ),
        )
        .limit(1)
      const row = rows[0]
      if (!row) return null
      if (row.token.kind !== 'email_confirmation' && row.token.kind !== 'magic_link') return null
      await transaction
        .update(oneTimeTokens)
        .set({ consumedAt: new Date() })
        .where(eq(oneTimeTokens.id, row.token.id))
      if (row.token.kind === 'email_confirmation' || row.token.kind === 'magic_link') {
        const confirmedAt = new Date()
        await transaction.update(users).set({ emailConfirmedAt: confirmedAt }).where(eq(users.id, row.user.id))
        row.user.emailConfirmedAt = confirmedAt
      }
      return row.user
    })
    if (!result) {
      response.status(400).json({ error: 'invalid_or_expired_token' })
      return
    }
    response.json({ session: await createSession(response, result), user: publicUser(result) })
  })

  router.post('/auth/sign-out', async (request: Request, response) => {
    const token = request.cookies?.rc_session as string | undefined
    if (token) await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)))
    response.clearCookie('rc_session', { ...cookieOptions, maxAge: undefined })
    response.json({ ok: true })
  })
}

export { createOneTimeToken, createSession, findUserByEmail, hashPassword, publicUser }
