import { createHash, randomInt, randomUUID } from 'node:crypto'
import type { Request, Router } from 'express'
import { eq, sql } from 'drizzle-orm'
import { users } from '../db/schema.js'
import { config } from './config.js'
import { db, userFromRequest } from './db.js'
import { createOneTimeToken, getAuthSettings } from './auth.js'
import { sendKavenegarLookup, sendKavenegarText } from './kavenegar.js'
import { verifyCaptcha } from './captcha.js'

const OTP_TTL_MS = 5 * 60 * 1000
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
        const recent = await db.execute(sql`
          select created_at from public.auth_otp_challenges
          where phone = ${phone} order by created_at desc limit 1
        `)
        if (recent.rows[0]?.created_at) {
          const age = Date.now() - new Date(String(recent.rows[0].created_at)).getTime()
          if (age < RESEND_COOLDOWN_MS) {
            response.status(429).json({
              error: 'cooldown',
              retry_after_sec: Math.ceil((RESEND_COOLDOWN_MS - age) / 1000),
            })
            return
          }
        }
        const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
        await db.execute(sql`
          insert into public.auth_otp_challenges(phone, code_hash, expires_at)
          values (${phone}, ${otpHash(phone, code)}, ${new Date(Date.now() + OTP_TTL_MS)})
        `)
        const sent = await sendOtp(phone, code)
        response.json({ ok: true, expires_in_sec: OTP_TTL_MS / 1000, ...(sent.mock ? { dev_code: code } : {}) })
        return
      }

      if (action === 'verify') {
        const code = String(request.body?.code ?? '').replace(/\D/g, '')
        const challengeResult = await db.execute(sql`
          select * from public.auth_otp_challenges
          where phone = ${phone} and consumed_at is null
          order by created_at desc limit 1
        `)
        const challenge = challengeResult.rows[0]
        if (!challenge) throw new Error('no_challenge')
        if (new Date(String(challenge.expires_at)).getTime() < Date.now()) throw new Error('expired')
        if (Number(challenge.attempts) >= MAX_ATTEMPTS) throw new Error('too_many_attempts')
        if (code.length !== 6 || otpHash(phone, code) !== challenge.code_hash) {
          await db.execute(sql`update public.auth_otp_challenges set attempts = attempts + 1 where id = ${challenge.id}`)
          throw new Error('invalid_code')
        }
        await db.execute(sql`update public.auth_otp_challenges set consumed_at = now() where id = ${challenge.id}`)

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
        const fullName = String(request.body?.full_name ?? '').trim()
        if (!user) {
          if (purpose === 'login') throw new Error('account_not_found')
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
        response.json({ ok: true, token_hash: token, email: user.email })
        return
      }

      response.status(400).json({ error: 'invalid_action' })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      response.status(message === 'too_many_attempts' ? 429 : 400).json({ error: message })
    }
  })
}
