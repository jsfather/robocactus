import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const server = readFileSync(new URL('../server/payment.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../db/migrations/0067_zarinpal_payment_attempts.sql', import.meta.url), 'utf8')
const routes = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const callback = readFileSync(new URL('../src/app/public/PaymentCallbackPage.tsx', import.meta.url), 'utf8')
const providerMigration = readFileSync(new URL('../db/migrations/0068_payment_provider_setting.sql', import.meta.url), 'utf8')
const serverIndex = readFileSync(new URL('../server/index.ts', import.meta.url), 'utf8')

test('every ZarinPal authority is persisted as an independent attempt', () => {
  assert.match(migration, /create table if not exists public\.payment_attempts/)
  assert.match(migration, /authority text not null unique/)
  assert.match(server, /insert into public\.payment_attempts/)
})

test('verification is session-independent but bound to invoice and authority', () => {
  assert.match(server, /where pa\.invoice_id=\$\{invoiceId\} and pa\.authority=\$\{authority\}/)
  const verifyRoute = server.slice(server.indexOf("router.post('/payment/verify'"), server.indexOf("router.post('/payment/reconcile'"))
  assert.doesNotMatch(verifyRoute, /userFromRequest/)
})

test('payment callback is public and exposes recovery states', () => {
  const publicIndex = routes.indexOf('<Route path="payments/callback"')
  const protectedIndex = routes.indexOf('<ProtectedRoute>')
  assert.ok(publicIndex > 0 && publicIndex < protectedIndex)
  assert.match(callback, /manual_review/)
  assert.match(callback, /استعلام مجدد پرداخت/)
})

test('provider and sandbox configuration are database-managed', () => {
  assert.match(providerMigration, /add column if not exists payment_provider text/)
  assert.match(serverIndex, /settings\?\.payment_provider/)
  assert.match(server, /settings\.zarinpal_sandbox/)
  assert.match(server, /sandbox\.zarinpal\.com\/pg\/v4\/payment/)
})
