import type { Router } from 'express'
import { sql } from 'drizzle-orm'
import { config } from './config.js'
import { db, userFromRequest } from './db.js'

type Notification = {
  id: string
  channel: string
  template_key: string
  idempotency_key: string
  phone: string | null
  email: string | null
  meta: Record<string, unknown> | null
}

async function sendSms(row: Notification): Promise<string> {
  if (!row.phone) throw new Error('missing_phone')
  const patterns = JSON.parse(process.env.SMS_PATTERNS ?? process.env.IPPANEL_PATTERNS ?? '{}') as Record<string, string>
  if (config.smsMock) {
    console.log(`[sms:mock] ${row.template_key} -> ${row.phone}`, row.meta ?? {})
    return `MOCK-sms-${Date.now()}`
  }
  const provider = (process.env.SMS_PROVIDER ?? 'ippanel').toLowerCase()
  if (provider === 'kavenegar') {
    const values = Object.values(row.meta ?? {}).map(String)
    const query = new URLSearchParams({
      receptor: row.phone,
      template: patterns[row.template_key] ?? row.template_key,
      token: values[0] ?? row.template_key,
      token2: values[1] ?? '',
      token3: values[2] ?? '',
    })
    const response = await fetch(`https://api.kavenegar.com/v1/${process.env.KAVENEGAR_API_KEY ?? ''}/verify/lookup.json?${query}`)
    if (!response.ok) throw new Error(`sms_provider_${response.status}`)
    return `kavenegar-${Date.now()}`
  }
  const response = await fetch('https://api2.ippanel.com/api/v1/sms/pattern/normal/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `AccessKey ${process.env.IPPANEL_API_KEY ?? ''}` },
    body: JSON.stringify({
      code: patterns[row.template_key] ?? row.template_key,
      sender: process.env.IPPANEL_ORIGINATOR ?? '',
      recipient: row.phone,
      variable: Object.fromEntries(Object.entries(row.meta ?? {}).map(([key, value]) => [key, String(value)])),
    }),
  })
  if (!response.ok) throw new Error(`sms_provider_${response.status}`)
  return `ippanel-${Date.now()}`
}

async function sendEmail(row: Notification): Promise<string> {
  if (!row.email) throw new Error('missing_email')
  const text = [
    `RoboCup Tabarestan notification: ${row.template_key}`,
    ...Object.entries(row.meta ?? {}).map(([key, value]) => `${key}: ${String(value)}`),
  ].join('\n')
  if (config.emailMock || !process.env.RESEND_API_KEY) {
    console.log(`[email:mock] ${row.template_key} -> ${row.email}\n${text}`)
    return `MOCK-email-${Date.now()}`
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM ?? 'RoboCup Tabarestan <onboarding@resend.dev>',
      to: [row.email],
      subject: `RoboCup Tabarestan · ${row.template_key}`,
      text,
    }),
  })
  const body = await response.json().catch(() => ({})) as { id?: string }
  if (!response.ok) throw new Error(`email_provider_${response.status}`)
  return body.id ?? `resend-${Date.now()}`
}

async function dispatch(channel: 'sms' | 'email', limit: number) {
  const pending = await db.execute(sql`
    select * from public.notification_log
    where status = 'pending' and channel = ${channel}
    order by created_at asc nulls last
    limit ${Math.max(1, Math.min(limit, 200))}
  `)
  let processed = 0
  for (const raw of pending.rows) {
    const row = raw as unknown as Notification
    const claimed = await db.execute(sql`
      update public.notification_log set status = 'sending'
      where id = ${row.id}::uuid and status = 'pending' returning id
    `)
    if (!claimed.rows.length) continue
    try {
      const providerId = channel === 'sms' ? await sendSms(row) : await sendEmail(row)
      await db.execute(sql`
        update public.notification_log set status = 'sent', provider_message_id = ${providerId},
          error_message = null, sent_at = now() where id = ${row.id}::uuid
      `)
    } catch (error) {
      await db.execute(sql`
        update public.notification_log set status = 'failed', error_message = ${error instanceof Error ? error.message : String(error)},
          sent_at = now() where id = ${row.id}::uuid
      `)
    }
    processed += 1
  }
  return processed
}

export async function dispatchNotifications(limit = 50): Promise<void> {
  await dispatch('sms', limit)
  await dispatch('email', limit)
}

export function registerNotificationRoutes(router: Router): void {
  router.post('/notifications/:channel/dispatch', async (request, response) => {
    const channel = request.params.channel
    if ((channel !== 'sms' && channel !== 'email') || !(await userFromRequest(request))) {
      response.status(403).json({ error: 'forbidden' })
      return
    }
    const processed = await dispatch(channel, Number(request.body?.limit ?? 50))
    response.json({ processed })
  })
}
