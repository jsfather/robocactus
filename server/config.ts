import fs from 'node:fs'
import path from 'node:path'

const shellEnvironment = new Set(Object.keys(process.env))

for (const filename of ['.env', '.env.local']) {
  const envPath = path.resolve(process.cwd(), filename)
  if (!fs.existsSync(envPath)) continue
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const separator = trimmed.indexOf('=')
    if (separator < 1) continue
    const key = trimmed.slice(0, separator).trim()
    let value = trimmed.slice(separator + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!shellEnvironment.has(key)) process.env[key] = value
  }
}

const configuredSessionDays = Number(process.env.SESSION_DAYS ?? 30)

export const config = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: process.env.DATABASE_URL ?? '',
  databaseSsl: process.env.DATABASE_SSL === 'true',
  appUrl: (process.env.APP_URL ?? `http://localhost:${process.env.PORT ?? 3000}`).replace(/\/$/, ''),
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  sessionDays: Number.isFinite(configuredSessionDays) && configuredSessionDays >= 1 ? configuredSessionDays : 30,
  uploadDir: path.resolve(process.env.UPLOAD_DIR ?? './data/uploads'),
  uploadSecret: process.env.UPLOAD_SIGNING_SECRET ?? process.env.SESSION_SECRET ?? 'change-me-in-production',
  smsMock: (process.env.SMS_MOCK ?? 'true') === 'true',
  emailMock: (process.env.EMAIL_MOCK ?? 'true') === 'true',
  isProduction: process.env.NODE_ENV === 'production',
}

if (!config.databaseUrl && config.isProduction) {
  throw new Error('DATABASE_URL is required in production')
}
if (config.isProduction && config.uploadSecret === 'change-me-in-production') {
  throw new Error('UPLOAD_SIGNING_SECRET or SESSION_SECRET is required in production')
}
