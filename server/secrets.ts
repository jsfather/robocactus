import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { config } from './config.js'
import { db } from './db.js'

export const SECRET_SETTING_FIELDS = ['email_api_key','ippanel_api_key','kavenegar_api_key','kavenegar_webhook_secret','arcaptcha_secret_key','zarinpal_merchant_id'] as const
const key = createHash('sha256').update(`tabarestan-settings:${config.uploadSecret}`).digest()

export function protectSecret(value: unknown): unknown {
  if (typeof value !== 'string' || !value || value.startsWith('enc:v1:')) return value
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return `enc:v1:${iv.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}:${encrypted.toString('base64url')}`
}

export function revealSecret(value: unknown): unknown {
  if (typeof value !== 'string' || !value.startsWith('enc:v1:')) return value
  const [,version,ivRaw,tagRaw,dataRaw] = value.split(':')
  if (version !== 'v1' || !ivRaw || !tagRaw || !dataRaw) throw new Error('invalid_encrypted_secret')
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivRaw, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(dataRaw, 'base64url')),decipher.final()]).toString('utf8')
}

export async function migrateStoredSecrets(): Promise<void> {
  const result = await db.execute(sql`select * from public.auth_settings where id=1 limit 1`)
  const row = result.rows[0] as Record<string, unknown> | undefined
  if (!row) return
  for (const field of SECRET_SETTING_FIELDS) {
    const current = row[field]
    const protectedValue = protectSecret(current)
    if (protectedValue !== current) await db.execute(sql`update public.auth_settings set ${sql.identifier(field)}=${protectedValue} where id=1`)
  }
}
