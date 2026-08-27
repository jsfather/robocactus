import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { registrationLifecycleForStep } from '../src/features/registration/lifecycle.ts'

const migration = readFileSync(new URL('../db/migrations/0044_registration_lifecycle.sql', import.meta.url), 'utf8')
const appRoutes = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const wizard = readFileSync(new URL('../src/features/registration/TeamRegistrationWizard.tsx', import.meta.url), 'utf8')
const liveResultsAdmin = readFileSync(new URL('../src/app/league-admin/LeagueAdminPage.tsx', import.meta.url), 'utf8')

test('registration stages advance without skipping document and review states', () => {
  assert.deepEqual(registrationLifecycleForStep(0), { stage: 'team_info', progress: 10, lifecycleStatus: 'incomplete' })
  assert.deepEqual(registrationLifecycleForStep(2), { stage: 'documents', progress: 60, lifecycleStatus: 'awaiting_documents' })
  assert.deepEqual(registrationLifecycleForStep(3), { stage: 'review', progress: 75, lifecycleStatus: 'awaiting_review' })
  assert.deepEqual(registrationLifecycleForStep(5), { stage: 'payment', progress: 85, lifecycleStatus: 'awaiting_payment' })
  assert.deepEqual(registrationLifecycleForStep(6), { stage: 'completed', progress: 100, lifecycleStatus: 'completed' })
})

test('registration stage is clamped for corrupt persisted step values', () => {
  assert.equal(registrationLifecycleForStep(-9).stage, 'team_info')
  assert.equal(registrationLifecycleForStep(99).stage, 'completed')
})

test('backend draft model persists resume progress and activity', () => {
  for (const column of ['registration_draft', 'last_completed_step', 'last_activity_at', 'registration_progress']) {
    assert.match(migration, new RegExp(`add column if not exists ${column}`))
  }
  assert.match(wizard, /loadRegistrationDraft/)
  assert.match(wizard, /persistRegistrationDraft/)
})

test('duplicate league registration is guarded on the backend', () => {
  assert.match(migration, /guard_duplicate_league_registration/)
  assert.match(migration, /duplicate_league_registration/)
  assert.match(migration, /t\.captain_id = new\.captain_id/)
})

test('invoice has a required registration relation and synchronizes payment completion', () => {
  assert.match(migration, /add column if not exists registration_id uuid references public\.teams/)
  assert.match(migration, /invoice_registration_mismatch/)
  assert.match(migration, /alter column registration_id set not null/)
  assert.match(migration, /invoices_select_team_captain/)
  assert.match(migration, /new\.status = 'paid'/)
  assert.match(migration, /lifecycle_status = 'completed'/)
})

test('reminders enforce delay, send caps, intervals, and terminal-state stop', () => {
  assert.match(migration, /v_team\.last_activity_at > now\(\) - make_interval/)
  assert.match(migration, /v_count >= v_setting\.max_sends/)
  assert.match(migration, /v_last > now\(\) - make_interval/)
  assert.match(migration, /lifecycle_status not in \('completed','cancelled'\)/)
})

test('user invoice list/detail and admin incomplete-registration routes exist', () => {
  assert.match(appRoutes, /account\/invoices\/:invoiceId/)
  assert.match(appRoutes, /super-admin\/incomplete-registrations/)
})

test('live result publishing requires preview in the admin workflow', () => {
  assert.match(liveResultsAdmin, /showResultPreview/)
  assert.match(liveResultsAdmin, /previewAndPublish/)
  assert.match(liveResultsAdmin, /onSaveResult\(true\)/)
})
