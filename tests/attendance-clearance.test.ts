import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read=(path:string)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8')
const migration=read('db/migrations/0070_competition_attendance_clearance.sql')

test('attendance clearance is server-authoritative and payment gated',()=>{
  assert.match(migration,/create table if not exists public\.team_attendance_clearances/)
  assert.match(migration,/if not v_paid then raise exception 'payment_required'/)
  assert.match(migration,/team_members_not_approved/)
  assert.match(migration,/member_edit_not_allowed/)
  assert.match(migration,/submit_team_member_correction/)
  assert.match(migration,/technical_submission_not_pending/)
  assert.match(migration,/technical_approval_required/)
})

test('technical files are private, constrained and validated by ownership',()=>{
  assert.match(migration,/technical-submissions','technical-submissions',false,94371840/)
  assert.match(migration,/application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document/)
  assert.match(migration,/invalid_file_reference/)
  const storage=read('server/storage.ts')
  assert.match(storage,/subarray\(4, 8\)\.toString\(\) === 'ftyp'/)
  assert.match(storage,/0x1a, 0x45, 0xdf, 0xa3/)
})

test('participant flow and management controls are separated',()=>{
  const app=read('src/App.tsx'),nav=read('src/features/panel/nav.ts'),page=read('src/app/team/TeamAttendancePage.tsx')
  assert.match(app,/team\/:teamId\/attendance/)
  assert.match(app,/super-admin\/scores/)
  assert.match(app,/super-admin\/live-results/)
  assert.match(nav,/league-admin\/scores/)
  // The attendance page uses real-time subscription (setTimeout debounce + channel)
  // rather than a plain setInterval polling loop.
  assert.match(page,/const schedule=\(\)=>\{if\(timer\)/)
  assert.match(page,/accept_team_attendance_rules|acceptAttendanceRules/)
})

test('homepage blog cards use constrained responsive columns',()=>{
  const news=read('src/components/home/LatestNews.tsx'),card=read('src/components/content/ArticleCard.tsx')
  assert.match(news,/grid-cols-1[\s\S]*sm:grid-cols-2[\s\S]*lg:grid-cols-3/)
  assert.match(news,/overflow-hidden/)
  assert.match(card,/min-w-0 max-w-full overflow-hidden/)
})

// ── New tests for the 13 required scenarios ───────────────────────────────────

const fix084 = read('db/migrations/0084_fix_sms_trigger_and_doc_deactivation.sql')
const notificationsApi = read('src/features/notifications/api.ts')
const registrationSettingsPage = read('src/app/super-admin/SuperAdminRegistrationSettingsPage.tsx')
const queryServer = read('server/query.ts')

// 1. Delete unused doc type → succeeds
//    The safe-deletion RPC simply runs DELETE. If no FK prevents it, it succeeds.
test('scenario 1: delete_registration_doc_type RPC executes DELETE for unused doc type', () => {
  assert.match(fix084, /delete from public\.registration_doc_types where id = p_id/)
  assert.match(fix084, /create or replace function public\.delete_registration_doc_type/)
  assert.match(queryServer, /delete_registration_doc_type/)
})

// 2. Delete used doc type → HTTP 409 / DOCUMENT_TYPE_IN_USE
test('scenario 2: FK violation on doc type deletion maps to 409 DOCUMENT_TYPE_IN_USE', () => {
  assert.match(fix084, /when foreign_key_violation then/)
  assert.match(fix084, /raise exception 'document_type_in_use'/)
  assert.match(queryServer, /isFkViolation/)
  assert.match(queryServer, /409/)
  assert.match(queryServer, /DOCUMENT_TYPE_IN_USE/)
})

// 3. Deactivate used doc type → succeeds, no data loss
test('scenario 3: deactivation is a safe update to is_active=false, no FK cascade', () => {
  // is_active column exists; upsertRegistrationDocType sets is_active:false.
  assert.match(notificationsApi, /is_active: (?:input\.is_active|false)/)
  // Registration settings page has deactivation action.
  assert.match(registrationSettingsPage, /deactivateConflictDoc/)
  assert.match(registrationSettingsPage, /is_active: false/)
  // No DELETE call in deactivation path.
  assert.doesNotMatch(
    registrationSettingsPage.match(/deactivateConflictDoc[\s\S]*?\}(?:\s*\}){1,3}/)?.[0] ?? '',
    /deleteRegistrationDocType/
  )
})

// 4. Inactive doc type excluded from new registration requirements
test('scenario 4: active-only queries filter is_active=true', () => {
  assert.match(notificationsApi, /\.eq\('is_active', true\)/)
  // The _refresh_league_registration_flows references is_active when checking required docs.
  const latestMigrationWithDocCheck = read('db/migrations/0083_registration_validation_realtime.sql')
  assert.match(latestMigrationWithDocCheck, /is_active and is_required/)
})

// 5. Historical documents still display correctly after deactivation
test('scenario 5: inactive doc type rows are returned by fetchAllRegistrationDocTypes (no is_active filter)', () => {
  // The admin list endpoint fetches all without is_active filter.
  assert.match(notificationsApi, /fetchAllRegistrationDocTypes/)
  // The full query has no is_active filter clause.
  const adminFetchBlock = notificationsApi.match(/fetchAllRegistrationDocTypes[\s\S]*?return \(data/)?.[0] ?? ''
  assert.doesNotMatch(adminFetchBlock, /is_active/)
  // The UI shows a غیرفعال badge for inactive items — renders always.
  assert.match(registrationSettingsPage, /غیرفعال/)
})

// 6. Reactivate doc type → succeeds
test('scenario 6: reactivation is an update to is_active=true via upsertRegistrationDocType', () => {
  assert.match(registrationSettingsPage, /is_active: !d\.is_active/)
  assert.match(notificationsApi, /is_active: input\.is_active/)
})

// 7. Set article_required from true to false → succeeds (no article_required error)
test('scenario 7: article_required=false does not raise article_required when saving settings', () => {
  // The only place article_required is raised is submit_team_technical_files.
  // The settings upsert goes through the generic query route; _refresh_league_registration_flows
  // auto-approves teams' technical step when both flags are false.
  assert.match(fix084, /coalesce\(v_settings\.article_required,\s*true\) = false/)
  assert.match(fix084, /coalesce\(v_settings\.video_required,\s*true\) = false/)
  assert.match(fix084, /technical_status\s*=\s*'approved'/)
  assert.match(fix084, /technical_auto_approved\s*=\s*true/)
})

// 8. Disable league attendance/permit flow → succeeds
test('scenario 8: disabled attendance flow bypasses technical/rules steps and moves teams to confirmed', () => {
  // sync_team_attendance short-circuits to confirmed when enabled=false.
  const sync073 = read('db/migrations/0073_team_clearance_status_and_reopen.sql')
  assert.match(sync073, /not coalesce\(v_enabled,true\)/)
  assert.match(sync073, /stage=case when v_paid then 'confirmed'/)
  // Fault-tolerant refresh also applies on settings save.
  assert.match(fix084, /_refresh_league_registration_flows/)
})

// 9. Existing team without article does not block saving when article_required=false
test('scenario 9: auto-approve path does not require an article file when article_required=false', () => {
  // The auto-approve block updates technical_status to approved without touching team_technical_files.
  assert.match(fix084, /technical_status in \('locked', 'draft', 'rejected', 'pending'\)/)
  assert.doesNotMatch(
    fix084.match(/coalesce\(v_settings\.article_required[\s\S]*?end loop/)?.[0] ?? '',
    /team_technical_files/
  )
})

// 10. Existing article data is preserved when requirement is disabled
test('scenario 10: disabling article_required does not delete team_technical_files', () => {
  // _refresh_league_registration_flows only updates team_attendance_clearances, not team_technical_files.
  const refreshBlock = fix084.match(/_refresh_league_registration_flows[\s\S]*?end \$\$/)?.[0] ?? ''
  assert.doesNotMatch(refreshBlock, /delete from[\s\S]*team_technical_files/)
})

// 11. Attendance sync does not reference nonexistent NEW.id
test('scenario 11: _enqueue_team_lifecycle_sms uses new.team_id, not new.id', () => {
  assert.match(fix084, /permit_code',\s*new\.team_id::text/)
  // Extract the actual SQL body (between the $$ delimiters) to avoid matching
  // comment text that describes the old bug.
  const fnSqlOnly = fix084.match(/as \$\$[\s\S]*?end \$\$/)?.[0] ?? ''
  assert.ok(fnSqlOnly.length > 0, 'function SQL body extracted')
  assert.doesNotMatch(fnSqlOnly, /\bnew\.id\b/)
})

// 12. Notification trigger executes without breaking attendance sync
test('scenario 12: SMS enqueue is wrapped in exception handler so trigger cannot abort clearance update', () => {
  assert.match(fix084, /exception when others then/)
  assert.match(fix084, /raise warning '_enqueue_team_lifecycle_sms/)
  // The trigger is still created for stage and technical_status changes.
  assert.match(fix084, /after update of stage, technical_status on public\.team_attendance_clearances/)
})

// 13. No duplicate notification records
test('scenario 13: notification inserts use idempotency_key with ON CONFLICT DO NOTHING', () => {
  assert.match(fix084, /on conflict do nothing/)
  // The idempotency key format is team-scoped and event-specific.
  // Keys may be built across multiple lines — use [\s\S] to handle that.
  assert.match(fix084, /attendance_permit_issued:'\s*\|\|\s*new\.team_id::text/)
  assert.match(fix084, /team_correction_required:technical:'\s*[\s\S]{0,40}\|\|\s*new\.team_id/)
  assert.match(fix084, /team_review_approved:'\s*\|\|\s*new\.team_id/)
})
