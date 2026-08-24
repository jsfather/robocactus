# RoboCactus — Phase 10 Acceptance

## Delivered

### SMS OTP auth
- Edge Function `sms-otp` (request / verify) via IPPanel pattern `auth_otp`
- Challenge table `auth_otp_challenges` (hashed codes, cooldown, attempt limit)
- Login & signup UI: SMS OTP (default) + email/password
- Mock mode returns `dev_code` for local testing

### Analytics
- Super-admin dashboard `/super-admin/analytics`
- Charts: status / league / province / company (+ finance buckets)
- Live updates: Realtime on `teams` + `invoices`, polling every 20s
- Export: Excel-compatible CSV + printable PDF
- RPCs: `analytics_snapshot()`, `analytics_export_teams()`
- Migration: `0011_phase10_analytics_otp.sql`

## Acceptance Criteria

| Criterion | Verify |
| --- | --- |
| Stats update without manual refresh | Open analytics → change a team status elsewhere → chart refreshes (Realtime or ≤20s) |
| SMS login | Deploy `sms-otp` → `/login` → send code (mock shows code) → verify → session |

## Setup

1. Apply `0011_phase10_analytics_otp.sql`
2. Configure SMS secrets; OTP is served by `server/otp.ts`.
3. Secrets: same IPPanel keys; add `auth_otp` to `IPPANEL_PATTERNS`
4. Ensure Realtime enabled for `teams` and `invoices` (migration adds to publication)

## Notes

- OTP users get synthetic email `98…@phone.robocactus.local` when no prior account exists; existing profiles matched by phone keep their email.
- Notification SMS panel remains at `/super-admin/notifications`.
