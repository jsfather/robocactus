import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { registrationLifecycleForStep } from '../src/features/registration/lifecycle.ts'
import { classifyOtpChallenge } from '../server/otp-state.ts'

const migration = readFileSync(new URL('../db/migrations/0044_registration_lifecycle.sql', import.meta.url), 'utf8')
const unifiedEnrollmentMigration = readFileSync(new URL('../db/migrations/0072_unified_team_enrollment_flow.sql', import.meta.url), 'utf8')
const appRoutes = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const wizard = readFileSync(new URL('../src/features/registration/TeamRegistrationWizard.tsx', import.meta.url), 'utf8')
const liveResultsAdmin = readFileSync(new URL('../src/app/league-admin/LeagueAdminPage.tsx', import.meta.url), 'utf8')
const participantMigration = readFileSync(new URL('../db/migrations/0045_participants_team_people_multi_judge.sql', import.meta.url), 'utf8')
const profilePage = readFileSync(new URL('../src/app/panel/AccountProfilePage.tsx', import.meta.url), 'utf8')
const liveTable = readFileSync(new URL('../src/components/live-results/LiveStandingsTable.tsx', import.meta.url), 'utf8')
const otpServer = readFileSync(new URL('../server/otp.ts', import.meta.url), 'utf8')
const otpLogin = readFileSync(new URL('../src/app/public/LoginPage.tsx', import.meta.url), 'utf8')
const signupPage = readFileSync(new URL('../src/app/public/SignupPage.tsx', import.meta.url), 'utf8')
const registrationStepper = readFileSync(new URL('../src/components/auth/RegistrationStepper.tsx', import.meta.url), 'utf8')
const authEntryMigration = readFileSync(new URL('../db/migrations/0047_auth_registration_entry.sql', import.meta.url), 'utf8')
const mobileNavigation = readFileSync(new URL('../src/components/layout/MobileBottomNavigation.tsx', import.meta.url), 'utf8')
const publicLayout = readFileSync(new URL('../src/components/layout/PublicLayout.tsx', import.meta.url), 'utf8')
const contactPage = readFileSync(new URL('../src/app/public/ContactPage.tsx', import.meta.url), 'utf8')
const leagueDetailPage = readFileSync(new URL('../src/app/public/LeagueDetailPage.tsx', import.meta.url), 'utf8')
const competitionStats = readFileSync(new URL('../src/components/home/CompetitionStats.tsx', import.meta.url), 'utf8')
const sponsorsSlider = readFileSync(new URL('../src/components/home/SponsorsSlider.tsx', import.meta.url), 'utf8')
const authServer = readFileSync(new URL('../server/auth.ts', import.meta.url), 'utf8')
const smsOtpClient = readFileSync(new URL('../src/features/auth/smsOtp.ts', import.meta.url), 'utf8')

test('registration stages advance without skipping document and review states', () => {
  assert.deepEqual(registrationLifecycleForStep(0), { stage: 'team_info', progress: 8, lifecycleStatus: 'incomplete' })
  assert.deepEqual(registrationLifecycleForStep(2), { stage: 'documents', progress: 34, lifecycleStatus: 'awaiting_documents' })
  assert.deepEqual(registrationLifecycleForStep(3), { stage: 'review', progress: 44, lifecycleStatus: 'awaiting_review' })
  assert.deepEqual(registrationLifecycleForStep(5), { stage: 'technical_review', progress: 64, lifecycleStatus: 'awaiting_technical_review' })
  assert.deepEqual(registrationLifecycleForStep(7), { stage: 'invoice', progress: 82, lifecycleStatus: 'awaiting_payment' })
  assert.deepEqual(registrationLifecycleForStep(9), { stage: 'completed', progress: 100, lifecycleStatus: 'completed' })
})

test('unified enrollment enforces technical approval and rules before payment', () => {
  assert.match(unifiedEnrollmentMigration, /team_documents_enabled boolean not null default true/)
  assert.match(unifiedEnrollmentMigration, /technical_status='approved' and rules_accepted_at is not null/)
  assert.match(unifiedEnrollmentMigration, /v_flow\.stage not in \('payment','confirmed'\)/)
  assert.match(unifiedEnrollmentMigration, /registration_incomplete:approval/)
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

test('team people remain dependent records and include captain, coach and member roles', () => {
  assert.match(participantMigration, /team_members_role_check/)
  assert.match(participantMigration, /role in \('captain','coach','member'\)/)
  assert.match(wizard, /const captainId = user\.id/)
  assert.doesNotMatch(wizard, /resolveCaptainId/)
  assert.match(wizard, /uploadMemberPhoto/)
})

test('participant identity is normalized, configurable and password changes are secure', () => {
  assert.match(participantMigration, /normalize_iran_mobile/)
  assert.match(participantMigration, /participant_field_rules/)
  assert.match(profilePage, /changePassword/)
  assert.match(profilePage, /participantErrors/)
  assert.match(profilePage, /profile-avatars/)
})

test('official result requires independent judge submissions', () => {
  assert.match(participantMigration, /unique\(team_id,judge_id,season_year\)/)
  assert.match(participantMigration, /judge_score_already_submitted/)
  assert.match(participantMigration, /judge_scores_incomplete/)
  assert.match(participantMigration, /official_multi_judge_engine/)
  assert.match(liveResultsAdmin, /saveJudgeScore/)
  assert.match(liveResultsAdmin, /publishOfficialTeamResult/)
})

test('final results reveal once per logical result set and standings animate', () => {
  assert.match(liveTable, /localStorage\.getItem\(revealKey\)/)
  assert.match(liveTable, /setCountdown/)
  assert.match(liveTable, /motion\.tr/)
})

test('OTP verification states are distinct and correctly prioritized', () => {
  assert.equal(classifyOtpChallenge(null, true, 5), 'invalid_session')
  assert.equal(classifyOtpChallenge({ consumed: true, invalidated: false, expired: false, attempts: 0 }, true, 5), 'already_used')
  assert.equal(classifyOtpChallenge({ consumed: false, invalidated: true, expired: false, attempts: 0 }, true, 5), 'invalid_session')
  assert.equal(classifyOtpChallenge({ consumed: false, invalidated: false, expired: true, attempts: 0 }, true, 5), 'expired')
  assert.equal(classifyOtpChallenge({ consumed: false, invalidated: false, expired: false, attempts: 5 }, true, 5), 'too_many_attempts')
  assert.equal(classifyOtpChallenge({ consumed: false, invalidated: false, expired: false, attempts: 0 }, false, 5), 'invalid_code')
  assert.equal(classifyOtpChallenge({ consumed: false, invalidated: false, expired: false, attempts: 0 }, true, 5), null)
})

test('OTP expiration uses database time, challenge locking, and a client challenge id', () => {
  assert.match(otpServer, /expires_at <= now\(\) is_expired/)
  assert.match(otpServer, /for update/)
  assert.match(otpServer, /pg_advisory_xact_lock/)
  assert.match(otpServer, /challenge_id/)
  assert.match(otpLogin, /otpExpired/)
  assert.match(otpLogin, /otpUsed/)
  assert.match(otpLogin, /otpInvalidSession/)
  assert.match(otpLogin, /otpServerError/)
})

test('SMS OTP exchange accepts the issued token kind and consumes it atomically', () => {
  assert.match(otpServer, /createOneTimeToken\(user\.id, 'sms_otp'\)/)
  assert.match(smsOtpClient, /type: 'sms_otp'/)
  assert.match(authServer, /row\.token\.kind === 'sms_otp'/)
  assert.match(authServer, /requestedType === 'sms_otp'/)
  assert.match(authServer, /Older deployed clients sent SMS token_hash/)
  assert.match(authServer, /\.for\('update'\)/)
})

test('OTP keeps a five-minute validity window and rate-limits resend to one minute', () => {
  assert.match(otpServer, /created_at \+ interval '1 minute'/)
  assert.match(otpServer, /resend_after_sec: 60/)
  assert.match(otpLogin, /otpResendAfterExpiry/)
  assert.doesNotMatch(otpLogin, /otpResendCountdown/)
  assert.doesNotMatch(signupPage, /otpResendCountdown/)
})

test('verified phone login routes new users into server-authorized registration', () => {
  assert.match(otpServer, /const isNewUser = !user/)
  assert.match(otpServer, /registration_required: isNewUser/)
  assert.match(otpServer, /next_path: isNewUser/)
  assert.doesNotMatch(otpServer, /if \(purpose === 'login'\) throw new Error\('account_not_found'\)/)
  assert.match(otpLogin, /result\.registrationRequired/)
  assert.match(signupPage, /phoneOnboardingRequested/)
  assert.match(signupPage, /completeVerifiedPhoneIdentity/)
})

test('registration link visibility and localized responsive stepper are configurable', () => {
  assert.match(authEntryMigration, /show_registration_link boolean not null default true/)
  assert.match(otpLogin, /options\?\.show_registration_link/)
  assert.match(registrationStepper, /transition-\[width\]/)
  assert.match(registrationStepper, /aria-current/)
  assert.match(signupPage, /auth\.registrationSteps\.type/)
  assert.doesNotMatch(signupPage, /0\$\{i \+ 1\} \{s\}/)
})

test('mobile bottom navigation is safe-area aware and leaves content clearance', () => {
  assert.match(mobileNavigation, /fixed inset-x-0 bottom-0/)
  assert.match(mobileNavigation, /safe-area-inset-bottom/)
  assert.match(mobileNavigation, /isActive/)
  assert.match(mobileNavigation, /user \? '\/dashboard' : '\/login'/)
  assert.match(publicLayout, /pb-\[calc\(5\.25rem\+env\(safe-area-inset-bottom\)\)\]/)
})

test('public contact phone comes from settings and opens the device dialer', () => {
  assert.match(contactPage, /settings\?\.support_phone/)
  assert.match(contactPage, /`tel:\$\{supportPhone\.replace/)
  assert.doesNotMatch(contactPage, /tel:09\d|tel:021\d/)
})

test('league landing uses connected stages, rich people cards, and a distinct entry fee', () => {
  assert.match(leagueDetailPage, /function TimelineIcon/)
  assert.match(leagueDetailPage, /before:bg-gradient-to-b/)
  assert.match(leagueDetailPage, /function PersonCards/)
  assert.match(leagueDetailPage, /company_info_en/)
  assert.match(leagueDetailPage, /leaguePage\.entryFeeLabel/)
})

test('home statistics are compact and sponsors have stable touch-friendly cards', () => {
  assert.match(competitionStats, /const ratio =/)
  assert.match(competitionStats, /lg:grid-cols-4/)
  assert.doesNotMatch(competitionStats, /min-h-64/)
  assert.match(sponsorsSlider, /snap-mandatory/)
  assert.match(sponsorsSlider, /object-contain/)
  assert.match(sponsorsSlider, /onError=\{\(\) => setFailed\(true\)\}/)
  assert.match(sponsorsSlider, /prefers-reduced-motion/)
  assert.match(sponsorsSlider, /manualPaused/)
})
