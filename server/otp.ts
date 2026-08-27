import { createHash, randomInt, randomUUID } from 'node:crypto'
import type { Request, Router } from 'express'
import { eq, sql } from 'drizzle-orm'
import { users } from '../db/schema.js'
import { config } from './config.js'
import { db, userFromRequest } from './db.js'
import { createOneTimeToken, getAuthSettings } from './auth.js'
import { sendKavenegarLookup, sendKavenegarText } from './kavenegar.js'
import { verifyCaptcha } from './captcha.js'
import { classifyOtpChallenge } from './otp-state.js'

const RESEND_COOLDOWN_MS = 60 * 1000
const MAX_ATTEMPTS = 5
const requestWindows = new Map<string, { count: number; resetAt: number }>()
const captchaGrants = new Map<string, number>()

function captchaGrantKey(request: Request, phone: string, purpose: string) {
  if (captchaGrants.size > 5000) {
    const now = Date.now()
    for (const [key, expiresAt] of captchaGrants) if (expiresAt <= now) captchaGrants.delete(key)
  }
  return `${request.ip ?? 'unknown'}:${phone}:${purpose}`
}

function ipRateLimited(ip: string | undefined): boolean {
  const key = ip ?? 'unknown'
  const now = Date.now()
  if (requestWindows.size > 5000) {
    for (const [windowKey, value] of requestWindows) {
      if (value.resetAt <= now) requestWindows.delete(windowKey)
    }
  }
  const current = requestWindows.get(key)
  if (!current || current.resetAt <= now) {
    requestWindows.set(key, { count: 1, resetAt: now + 15 * 60 * 1000 })
    return false
  }
  current.count += 1
  return current.count > 20
}

function normalizeIranPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('09')) return digits
  if (digits.length === 12 && digits.startsWith('98')) return `0${digits.slice(2)}`
  if (digits.length === 10 && digits.startsWith('9')) return `0${digits}`
  return null
}

function otpHash(phone: string, code: string): string {
  return createHash('sha256').update(`${phone}:${code}`).digest('hex')
}

async function sendOtp(phone: string, code: string): Promise<{ mock: boolean }> {
  const settings = await getAuthSettings(true)
  const provider = (settings.sms_provider ?? process.env.SMS_PROVIDER ?? 'ippanel').toLowerCase()
  const configuredKey = provider === 'kavenegar' ? settings.kavenegar_api_key : settings.ippanel_api_key
  if (config.smsMock && !configuredKey) {
    console.log(`[sms:mock] OTP for ${phone}: ${code}`)
    return { mock: true }
  }
  if (provider === 'kavenegar') {
    const template = settings.sms_patterns?.auth_otp ?? JSON.parse(process.env.SMS_PATTERNS ?? '{}').auth_otp
    if (!template) {
      await sendKavenegarText({ receptor: phone, message: `کد یک‌بارمصرف جام تبرستان: ${code}\nاعتبار: ۵ دقیقه` })
      return { mock: false }
    }
    try {
      await sendKavenegarLookup({ receptor: phone, template, token: code })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!/الگو|template/i.test(message)) throw error
      await sendKavenegarText({ receptor: phone, message: `کد یک‌بارمصرف جام تبرستان: ${code}\nاعتبار: ۵ دقیقه` })
    }
    return { mock: false }
  }
  const response = await fetch('https://api2.ippanel.com/api/v1/sms/pattern/normal/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `AccessKey ${settings.ippanel_api_key ?? process.env.IPPANEL_API_KEY ?? ''}`,
    },
    body: JSON.stringify({
      code: settings.sms_patterns?.auth_otp ?? JSON.parse(process.env.SMS_PATTERNS ?? process.env.IPPANEL_PATTERNS ?? '{}').auth_otp ?? 'auth_otp',
      sender: settings.ippanel_originator ?? process.env.IPPANEL_ORIGINATOR ?? '',
      recipient: phone,
      variable: { code },
    }),
  })
  if (!response.ok) throw new Error(`sms_provider_${response.status}`)
  return { mock: false }
}

export function registerOtpRoutes(router: Router): void {
  router.post('/auth/sms-otp', async (request: Request, response) => {
    try {
      const action = String(request.body?.action ?? '')
      const requestedPurpose = String(request.body?.purpose ?? 'login')
      const purpose = requestedPurpose === 'profile' || requestedPurpose === 'signup' ? requestedPurpose : 'login'
      const phone = normalizeIranPhone(String(request.body?.phone ?? ''))
      if (!phone) {
        response.status(400).json({ error: 'invalid_phone' })
        return
      }

      if (action === 'request') {
        if (purpose !== 'profile') {
          const grantKey = captchaGrantKey(request, phone, purpose)
          const grantedUntil = captchaGrants.get(grantKey) ?? 0
          if (grantedUntil <= Date.now()) {
            const captcha = await verifyCaptcha(request, purpose === 'signup' ? 'signup' : 'login')
            if (!captcha.ok) {
              response.status(400).json({ error: captcha.error })
              return
            }
            captchaGrants.set(grantKey, Date.now() + 10 * 60 * 1000)
          }
        }
        const settings = await getAuthSettings()
        if (purpose === 'login' && !settings.otp_login_enabled) {
          response.status(403).json({ error: 'otp_login_disabled' })
          return
        }
        if (purpose === 'signup' && !settings.phone_signup_enabled) {
          response.status(403).json({ error: 'phone_signup_disabled' })
          return
        }
        if (purpose === 'profile') {
          const currentUser = await userFromRequest(request)
          if (!currentUser) {
            response.status(401).json({ error: 'authentication_required' })
            return
          }
          const occupied = await db.execute(sql`
            select 1 from auth.users where phone = ${phone} and id <> ${currentUser.id}::uuid limit 1
          `)
          if (occupied.rows.length) {
            response.status(409).json({ error: 'phone_in_use' })
            return
          }
        }
        if (ipRateLimited(request.ip)) {
          response.status(429).json({ error: 'too_many_attempts' })
          return
        }
        const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
        const issued = await db.transaction(async (transaction) => {
          // Serialize requests for the same phone/purpose so concurrent clicks
          // cannot create two active challenges or bypass the cooldown.
          await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${`${phone}:${purpose}`}))`)
          const recent = await transaction.execute(sql`
            select greatest(0,ceil(extract(epoch from (created_at + interval '60 seconds' - now()))))::integer retry_after_sec
            from public.auth_otp_challenges where phone=${phone} and purpose=${purpose}
            order by created_at desc limit 1
          `)
          const retryAfter = Number(recent.rows[0]?.retry_after_sec ?? 0)
          if (retryAfter > 0) return { error: 'cooldown' as const, retryAfter }

          await transaction.execute(sql`
            update public.auth_otp_challenges set invalidated_at=now()
            where phone=${phone} and purpose=${purpose} and consumed_at is null and invalidated_at is null
          `)
          const inserted = await transaction.execute(sql`
            insert into public.auth_otp_challenges(phone,code_hash,expires_at,purpose)
            values(${phone},${otpHash(phone, code)},now() + interval '5 minutes',${purpose})
            returning id
          `)
          const sent = await sendOtp(phone, code)
          // Calculate the remaining lifetime with the database clock after the
          // provider call. The browser never compares its clock with PostgreSQL.
          const timing = await transaction.execute(sql`
            select id,expires_at,now() server_time,
              greatest(0,ceil(extract(epoch from (expires_at - now()))))::integer expires_in_sec
            from public.auth_otp_challenges where id=${inserted.rows[0]?.id}::uuid
          `)
          return { row: timing.rows[0], mock: sent.mock }
        })
        if ('error' in issued) {
          response.status(429).json({ error: issued.error, retry_after_sec: issued.retryAfter })
          return
        }
        response.json({
          ok: true,
          challenge_id: issued.row?.id,
          expires_at: issued.row?.expires_at,
          server_time: issued.row?.server_time,
          expires_in_sec: Number(issued.row?.expires_in_sec ?? 0),
          resend_after_sec: RESEND_COOLDOWN_MS / 1000,
          ...(issued.mock ? { dev_code: code } : {}),
        })
        return
      }

      if (action === 'verify') {
        const code = String(request.body?.code ?? '').replace(/\D/g, '')
        const challengeId = String(request.body?.challenge_id ?? '')
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(challengeId)) {
          response.status(400).json({ error: 'invalid_session' })
          return
        }
        const verification = await db.transaction(async (transaction) => {
          const challengeResult = await transaction.execute(sql`
            select *,expires_at <= now() is_expired from public.auth_otp_challenges
            where id=${challengeId}::uuid and phone=${phone} and purpose=${purpose}
            for update
          `)
          const challenge = challengeResult.rows[0]
          const codeMatches = challenge != null && code.length === 6 && otpHash(phone, code) === challenge.code_hash
          const stateError = classifyOtpChallenge(challenge ? { consumed: Boolean(challenge.consumed_at), invalidated: Boolean(challenge.invalidated_at), expired: Boolean(challenge.is_expired), attempts: Number(challenge.attempts) } : null, codeMatches, MAX_ATTEMPTS)
          if (stateError === 'invalid_code') {
            const updated = await transaction.execute(sql`update public.auth_otp_challenges set attempts=attempts+1 where id=${challengeId}::uuid returning attempts`)
            return { error: Number(updated.rows[0]?.attempts) >= MAX_ATTEMPTS ? 'too_many_attempts' as const : 'invalid_code' as const }
          }
          if (stateError) return { error: stateError }
          await transaction.execute(sql`update public.auth_otp_challenges set consumed_at=now() where id=${challengeId}::uuid`)
          return { ok: true as const }
        })
        if ('error' in verification) {
          response.status(verification.error === 'too_many_attempts' ? 429 : verification.error === 'already_used' ? 409 : 400).json({ error: verification.error })
          return
        }

        if (purpose === 'profile') {
          const currentUser = await userFromRequest(request)
          if (!currentUser) throw new Error('authentication_required')
          const occupied = await db.execute(sql`
            select 1 from auth.users where phone = ${phone} and id <> ${currentUser.id}::uuid limit 1
          `)
          if (occupied.rows.length) throw new Error('phone_in_use')
          await db.execute(sql`update auth.users set phone = ${phone}, updated_at = now() where id = ${currentUser.id}::uuid`)
          await db.execute(sql`update public.profiles set phone = ${phone}, phone_verified_at = now() where id = ${currentUser.id}::uuid`)
          response.json({ ok: true, profile_verified: true })
          return
        }

        let user = (await db.select().from(users).where(eq(users.phone, phone)).limit(1))[0]
        const isNewUser = !user
        const fullName = String(request.body?.full_name ?? '').trim()
        if (!user) {
          const settings = await getAuthSettings()
          if (!settings.phone_signup_enabled) throw new Error('phone_signup_disabled')
          const inserted = await db.insert(users).values({
            id: randomUUID(),
            email: `${phone.replace(/^0/, '98')}@phone.tabarestancup.local`,
            phone,
            rawUserMetaData: { full_name: fullName || 'کاربر جدید', phone, auth_channel: 'phone' },
            emailConfirmedAt: new Date(),
          }).returning()
          user = inserted[0]
        }
        if (!user) throw new Error('session_failed')
        await db.execute(sql`update public.profiles set phone = ${phone}, phone_verified_at = now() where id = ${user.id}`)
        if (fullName) {
          await db.execute(sql`update public.profiles set full_name = ${fullName} where id = ${user.id} and full_name = 'کاربر جدید'`)
        }
        const token = await createOneTimeToken(user.id, 'sms_otp')
        response.json({
          ok: true,
          token_hash: token,
          email: user.email,
          registration_required: isNewUser,
          next_path: isNewUser ? '/signup?onboarding=phone' : '/dashboard',
        })
        return
      }

      response.status(400).json({ error: 'invalid_action' })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const known = new Set(['authentication_required', 'phone_in_use', 'account_not_found', 'phone_signup_disabled', 'session_failed'])
      if (known.has(message)) {
        response.status(message === 'phone_in_use' ? 409 : message === 'authentication_required' ? 401 : 400).json({ error: message })
        return
      }
      console.error('[otp] unexpected failure', error)
      response.status(500).json({ error: 'server_error' })
    }
  })
}
