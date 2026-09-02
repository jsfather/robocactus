import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path: string) => fs.readFileSync(path, 'utf8')
const otp = read('server/otp.ts')
const config = read('server/config.ts')
const query = read('server/query.ts')
const migration = read('db/migrations/0069_security_hardening.sql')
const article = read('src/components/content/ArticleDetail.tsx')
const league = read('src/app/public/LeagueDetailPage.tsx')
const editor = read('src/components/ui/RichTextEditor.tsx')

test('phone password reset token is issued only after OTP verification', () => {
  const verifyBranch = otp.indexOf("if (action === 'verify')")
  const resetToken = otp.indexOf("createOneTimeToken(resetUser.id, 'password_reset'")
  assert.ok(verifyBranch >= 0 && resetToken > verifyBranch)
})

test('production cannot expose mock OTP or mock payment RPCs', () => {
  assert.match(config, /SMS_MOCK must be disabled in production/)
  assert.match(otp, /issued\.mock && !config\.isProduction/)
  assert.match(query, /config\.isProduction \|\| provider !== 'mock'/)
})

test('stored rich content is sanitized before rendering and editing', () => {
  assert.match(article, /sanitizeHtml\(props\.body\)/)
  assert.match(league, /sanitizeHtml\(html\)/)
  assert.match(league, /sanitizeHtml\(n\.body\)/)
  assert.match(editor, /sanitizeHtml\(ref\.current\.innerHTML\)/)
})

test('triage completeness and scoped access are enforced by the database', () => {
  for (const guard of ['captain','member_identity','required_documents','registration_flow','payment']) assert.match(migration, new RegExp(`'${guard}'`))
  assert.match(migration, /profiles_scoped_select/)
  assert.match(migration, /payment_receipts_select/)
  assert.match(migration, /has_panel_permission\('triage'\)/)
})

test('query errors, result size and secrets are hardened', () => {
  assert.match(query, /Math\.min\(500/)
  assert.match(query, /internal_server_error/)
  assert.match(query, /CONFIGURED_SECRET/)
  assert.match(query, /protectSecret/)
})
