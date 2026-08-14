# RoboCactus — Phase 2 Acceptance

## Delivered

- Payment gateway adapter: `mock` + `zarinpal` (`src/lib/payment-gateway/`)
- Invoice create RPC `create_invoice_for_team` (amount from `leagues.registration_fee`)
- Secure status change only via `apply_payment_result` (never from client UPDATE on teams)
- Payment UI: `/payments/teams/:teamId` + `/payments/callback`
- Invoice download (print-ready HTML / Save as PDF)
- Super-admin finance: `/super-admin/finance`
- Edge Function skeleton: `supabase/functions/payment-verify`
- Migration: `supabase/migrations/0003_phase2_payments.sql`

## Acceptance Criteria

| Criterion | Verify |
| --- | --- |
| Successful payment → team `submitted` + downloadable invoice | Pay with mock → callback OK → status `submitted` → Download invoice |
| Failed payment → team stays `draft` | Use «Simulate failed payment» → invoice `failed`, team still `draft` |

## Setup

1. Run `0003_phase2_payments.sql` (needs `pgcrypto`).
2. Keep `payment_config.payment_mode = mock` for local; set `zarinpal` + merchant for production.
3. Optional Edge Function for ZarinPal verify with service role.

## Security notes

- Frontend never sets `teams.status` to `submitted` / never marks invoice `paid` with a raw table update.
- Mock authorities use HMAC from `issue_mock_payment_authority` (plus local `MOCK-DEV` only when `allow_mock_dev=true`).
