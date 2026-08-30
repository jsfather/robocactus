import fs from 'node:fs'
import path from 'node:path'
import cookieParser from 'cookie-parser'
import express from 'express'
import { sql } from 'drizzle-orm'
import { config } from './config.js'
import { db, pool, purgeExpiredSessions } from './db.js'
import { getAuthSettings, registerAuthRoutes } from './auth.js'
import { dispatchNotifications, registerNotificationRoutes } from './notifications.js'
import { registerOtpRoutes } from './otp.js'
import { checkRequestOrigin } from './origin.js'
import { registerPaymentRoutes } from './payment.js'
import { registerQueryRoutes } from './query.js'
import { initializeRealtime, registerRealtimeRoutes } from './realtime.js'
import { registerStorageRoutes } from './storage.js'
import { registerKavenegarRoutes } from './kavenegar.js'
import { registerCaptchaRoutes } from './captcha.js'

const app = express()
app.set('trust proxy', 1)
app.disable('x-powered-by')
app.use(cookieParser())
app.use(express.json({ limit: '2mb' }))
app.use(express.urlencoded({ extended: false, limit: '1mb' }))

app.use((request, response, next) => {
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.setHeader('X-Frame-Options', 'SAMEORIGIN')
  const trustedProviderWebhook = request.path.startsWith('/api/kavenegar/webhook/')
  if (!trustedProviderWebhook && !['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    const originCheck = checkRequestOrigin(request, [config.appUrl, ...config.allowedOrigins])
    if (config.isProduction && !originCheck.allowed) {
      console.warn('[security] rejected request origin', {
        method: request.method,
        path: request.path,
        receivedOrigin: originCheck.receivedOrigin,
        allowedOrigins: originCheck.allowedOrigins,
      })
      response.status(403).json({ error: 'origin_not_allowed' })
      return
    }
  }
  next()
})

const api = express.Router()
api.all('/health', async (_request, response) => {
  try {
    await db.execute(sql`select 1`)
    response.status(200).json({ status: 'ok' })
  } catch {
    response.status(503).json({ status: 'database_unavailable' })
  }
})
registerAuthRoutes(api)
registerOtpRoutes(api)
registerQueryRoutes(api)
registerStorageRoutes(api)
registerRealtimeRoutes(api)
registerNotificationRoutes(api)
registerPaymentRoutes(api)
registerKavenegarRoutes(api)
registerCaptchaRoutes(api)
app.use('/api', api)

app.get('/env.js', async (_request, response) => {
  const settings = await getAuthSettings().catch(() => null)
  const paymentProvider = settings?.payment_provider
    ?? process.env.PAYMENT_PROVIDER
    ?? process.env.VITE_PAYMENT_PROVIDER
    ?? 'mock'
  response.type('application/javascript').setHeader('Cache-Control', 'no-store')
  response.send(`window.__APP_CONFIG__ = ${JSON.stringify({
    VITE_API_URL: process.env.VITE_API_URL ?? '',
    VITE_PAYMENT_PROVIDER: paymentProvider,
  })};\n`)
})

if (config.isProduction) {
  const clientDir = path.resolve(process.cwd(), 'dist')
  app.use(express.static(clientDir, { index: false, maxAge: '1y', immutable: true }))
  app.get(/.*/, (_request, response) => {
    response.setHeader('Cache-Control', 'no-cache')
    response.sendFile(path.join(clientDir, 'index.html'))
  })
} else {
  const { createServer: createViteServer } = await import('vite')
  const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' })
  app.use(vite.middlewares)
}

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  console.error(error)
  response.status(500).json({ error: config.isProduction ? 'internal_server_error' : String(error) })
})

await initializeRealtime()
await fs.promises.mkdir(config.uploadDir, { recursive: true })
void purgeExpiredSessions()
const cleanup = setInterval(() => void purgeExpiredSessions().catch(console.error), 6 * 60 * 60 * 1000)
cleanup.unref()

if (process.env.NOTIFICATION_WORKER !== 'false') {
  const dispatchPending = () => void dispatchNotifications().catch((error) => console.error('[notifications]', error))
  setTimeout(dispatchPending, 5000).unref()
  const dispatcher = setInterval(dispatchPending, 60_000)
  dispatcher.unref()
  const enqueueReminders = () => void db.execute(sql`select public.enqueue_registration_deadline_reminders()`)
    .catch((error) => console.error('[deadline-reminders]', error))
  setTimeout(enqueueReminders, 10_000).unref()
  const reminders = setInterval(enqueueReminders, 60 * 60 * 1000)
  reminders.unref()
}

const server = app.listen(config.port, '0.0.0.0', () => {
  console.log(`[server] listening on http://0.0.0.0:${config.port}`)
})

async function shutdown(signal: string) {
  console.log(`[server] ${signal}, shutting down`)
  server.close(async () => {
    await pool.end()
    process.exit(0)
  })
}
process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))
