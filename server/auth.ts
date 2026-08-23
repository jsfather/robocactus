import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import type { CookieOptions, Request, Response, Router } from 'express'
import { and, eq, gt, isNull } from 'drizzle-orm'
import { oneTimeTokens, sessions, users } from '../db/schema.js'
import { config } from './config.js'
import { db, hashToken, type AuthUser, userFromRequest } from './db.js'

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
  const apiKey = process.env.RESEND_API_KEY
  if (config.emailMock || !apiKey) {
    console.log(`[email:mock] magic link for ${email}: ${link}`)
    return
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM ?? 'RoboCup Tabarestan <onboarding@resend.dev>',
      to: [email],
      subject: 'Sign in to RoboCup Tabarestan',
      text: `Open this secure link to continue: ${link}`,
    }),
  })
  if (!response.ok) throw new Error(`email_provider_${response.status}`)
}

export function registerAuthRoutes(router: Router): void {
  router.get('/auth/session', async (request, response) => {
    const user = await userFromRequest(request)
    response.json({ session: user ? { access_token: 'http-only-cookie', user } : null, user })
  })

  router.post('/auth/sign-in', async (request, response) => {
    if (rateLimited(`sign-in:${request.ip}`, 15, 15 * 60 * 1000)) {
      response.status(429).json({ error: 'too_many_attempts' })
      return
    }
    const email = String(request.body?.email ?? '').trim().toLowerCase()
    const password = String(request.body?.password ?? '')
    const user = await findUserByEmail(email)
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
    if (rateLimited(`sign-up:${request.ip}`, 10, 60 * 60 * 1000)) {
      response.status(429).json({ error: 'too_many_attempts' })
      return
    }
    const email = String(request.body?.email ?? '').trim().toLowerCase()
    const password = String(request.body?.password ?? '')
    const requestedMetadata = (request.body?.metadata ?? {}) as Record<string, unknown>
    const metadata = {
      full_name: String(requestedMetadata.full_name ?? '').trim() || 'کاربر جدید',
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
    const inserted = await db
      .insert(users)
      .values({
        id: randomUUID(),
        email,
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
    response.status(201).json({ session: null, user: publicUser(user), ...(config.emailMock ? { dev_link: link } : {}) })
  })

  router.post('/auth/magic-link', async (request, response) => {
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
      response.json({ ok: true, ...(config.emailMock ? { dev_link: link } : {}) })
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
