# RoboCactus — Phase 5 Acceptance

## Delivered

- Idempotent `notification_log.idempotency_key` (unique)
- Triggers enqueue SMS on: team status, invoice paid, result published
- Deadline reminders via `enqueue_registration_deadline_reminders` + Edge `sms-deadline-reminders`
- Edge Function `sms-dispatch` with **atomic claim** (`pending` → `sending`) so concurrent invokes cannot double-send
- IPPanel client (`src/lib/ippanel`) with mock mode
- Super-admin log: `/super-admin/notifications`
- Migration: `supabase/migrations/0006_phase5_notifications.sql`

## Templates

| Key | When |
| --- | --- |
| `registration_submitted` | team → `submitted` |
| `payment_confirmed` | invoice → `paid` |
| `registration_approved` / `rejected` / `waitlisted` | review decision |
| `registration_deadline_reminder` | draft team, league closing soon |
| `result_announced` | result `published_at` set |

## Acceptance Criteria

| Criterion | Verify |
| --- | --- |
| No duplicate SMS for same event | Change team status twice to same value (no-op) or re-run `sms-dispatch` twice → one `sent` row per `idempotency_key` |

## Setup

1. Run `0006_phase5_notifications.sql`
2. Deploy:
   - `supabase functions deploy sms-dispatch`
   - `supabase functions deploy sms-deadline-reminders`
3. Secrets: `IPPANEL_API_KEY`, `IPPANEL_ORIGINATOR`, `IPPANEL_MOCK=true` (local), optional `IPPANEL_PATTERNS`
4. Recommended: Database Webhook on `notification_log` INSERT → `sms-dispatch`
5. Schedule `sms-deadline-reminders` hourly (Supabase cron / external)

## Local without webhook

Use **Dispatch queue** on `/super-admin/notifications` after payment/review to flush pending rows (mock sends succeed without real IPPanel).
