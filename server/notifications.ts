import type { Router } from 'express'
import { sql } from 'drizzle-orm'
import { config } from './config.js'
import { db } from './db.js'
import { getAuthSettings } from './auth.js'
import { requireSuperAdminRequest, sendKavenegarLookup, sendKavenegarText } from './kavenegar.js'

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
  const settings = await getAuthSettings(true)
  const patterns = settings.sms_patterns ?? JSON.parse(process.env.SMS_PATTERNS ?? process.env.IPPANEL_PATTERNS ?? '{}') as Record<string, string>
  const provider = (settings.sms_provider ?? process.env.SMS_PROVIDER ?? 'ippanel').toLowerCase()
  const configuredKey = provider === 'kavenegar' ? settings.kavenegar_api_key : settings.ippanel_api_key
  if (config.smsMock && !configuredKey) {
    console.log(`[sms:mock] ${row.template_key} -> ${row.phone}`, row.meta ?? {})
    return `MOCK-sms-${Date.now()}`
  }
  if (provider === 'kavenegar') {
    const values = Object.values(row.meta ?? {}).map(String)
    const template = patterns[row.template_key]
    const plainMessage = `جام تبرستان\n${row.template_key}\n${Object.entries(row.meta ?? {}).map(([key, value]) => `${key}: ${String(value)}`).join('\n')}`
    let result
    if (!template) {
      result = await sendKavenegarText({ receptor: row.phone, message: plainMessage })
    } else {
      try {
        result = await sendKavenegarLookup({ receptor: row.phone, template, token: values[0] ?? row.template_key, token2: values[1] ?? '', token3: values[2] ?? '' })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (!/الگو|template/i.test(message)) throw error
        result = await sendKavenegarText({ receptor: row.phone, message: plainMessage })
      }
    }
    const entries = Array.isArray(result.entries) ? result.entries : [result.entries]
    const messageId = (entries[0] as Record<string, unknown> | undefined)?.messageid
    return messageId ? String(messageId) : `kavenegar-${Date.now()}`
  }
  const response = await fetch('https://api2.ippanel.com/api/v1/sms/pattern/normal/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `AccessKey ${settings.ippanel_api_key ?? process.env.IPPANEL_API_KEY ?? ''}` },
    body: JSON.stringify({
      code: patterns[row.template_key] ?? row.template_key,
      sender: settings.ippanel_originator ?? process.env.IPPANEL_ORIGINATOR ?? '',
      recipient: row.phone,
      variable: Object.fromEntries(Object.entries(row.meta ?? {}).map(([key, value]) => [key, String(value)])),
    }),
  })
  if (!response.ok) throw new Error(`sms_provider_${response.status}`)
  return `ippanel-${Date.now()}`
}

async function sendEmail(row: Notification): Promise<string> {
  if (!row.email) throw new Error('missing_email')
  const settings = await getAuthSettings(true)
  const apiKey = settings.email_api_key || process.env.RESEND_API_KEY
  const text = [
    `Tabarestan Cup notification: ${row.template_key}`,
    ...Object.entries(row.meta ?? {}).map(([key, value]) => `${key}: ${String(value)}`),
  ].join('\n')
  if ((config.emailMock && !settings.email_api_key) || !apiKey) {
    console.log(`[email:mock] ${row.template_key} -> ${row.email}\n${text}`)
    return `MOCK-email-${Date.now()}`
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: settings.email_from || process.env.EMAIL_FROM || 'Tabarestan Cup <onboarding@resend.dev>',
      to: [row.email],
      subject: `Tabarestan Cup · ${row.template_key}`,
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
    if ((channel !== 'sms' && channel !== 'email') || !(await requireSuperAdminRequest(request))) {
      response.status(403).json({ error: 'forbidden' })
      return
    }
    const processed = await dispatch(channel, Number(request.body?.limit ?? 50))
    response.json({ processed })
  })
}
