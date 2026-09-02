import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('team people remain dependent records rather than CRM accounts', () => {
  const wizard = read('src/features/registration/TeamRegistrationWizard.tsx')
  const migration = read('db/migrations/0045_participants_team_people_multi_judge.sql')
  assert.match(wizard, /actual[\s\S]*captain[\s\S]*dependent team_member/)
  assert.match(migration, /team_members_role_check[\s\S]*captain','coach','member/)
})

test('password management exists for account owner and super admin', () => {
  const profilePage = read('src/app/panel/AccountProfilePage.tsx')
  const passwordField = read('src/components/auth/PasswordField.tsx')
  assert.match(profilePage, /autoComplete="current-password"[\s\S]*showStrength=\{false\}/)
  assert.match(passwordField, /autoComplete = 'new-password'/)
  assert.match(read('server/auth.ts'), /admin\/users\/:userId\/password[\s\S]*transaction\.delete\(sessions\)/)
})

test('collaborators have a dedicated secure creation flow', () => {
  assert.match(read('server/auth.ts'), /admin\/collaborators[\s\S]*internal_collaborator/)
  assert.match(read('src/app/super-admin/SuperAdminCollaboratorsPage.tsx'), /adminCreateCollaborator/)
})

test('incomplete registration settings table is query-allowed', () => {
  assert.match(read('server/query.ts'), /registration_reminder_settings/)
})

test('checkout acceptance is enforced by UI, RPC and payment server', () => {
  const checkout = read('src/app/public/TeamPaymentPage.tsx')
  const migration = read('db/migrations/0048_terms_checkout_content.sql')
  assert.match(checkout, /termsAccepted[\s\S]*acceptInvoiceTerms/)
  assert.match(migration, /terms_not_accepted/g)
  assert.match(read('server/payment.ts'), /terms_accepted_at[\s\S]*terms_not_accepted/)
})

test('terms and registration guide are public, bilingual and CMS-managed', () => {
  const app = read('src/App.tsx')
  assert.match(app, /path="terms"/)
  assert.match(app, /path="registration-guide"/)
  assert.match(read('src/app/super-admin/SuperAdminPagesPage.tsx'), /'terms', 'registration-guide'/)
  assert.match(read('db/migrations/0048_terms_checkout_content.sql'), /title_en[\s\S]*body_en/)
})

test('chat launcher still waits twenty seconds with cleanup', () => {
  const chat = read('src/components/live-chat/LiveChatWidget.tsx')
  assert.match(chat, /20_000/)
  assert.match(chat, /clearTimeout/)
})
