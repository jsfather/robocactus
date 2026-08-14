# RoboCactus — Phase 4 Acceptance

## Delivered

- League Admin panel `/league-admin`: review queue, document preview, approve/reject/waitlist, results
- Staff panel `/staff`: general ticket queue + registration triage (`submitted` → `under_review`)
- Team tickets on `/team/:id` (general → staff)
- Referral RPC `refer_ticket` sets `league_id` (+ optional `assigned_to`)
- Tight RLS: after referral with assignee, only that league admin + owners + super_admin see the ticket; staff loses access
- Storage select extended so league admins can open team documents
- Migration: `supabase/migrations/0005_phase4_judging_tickets.sql`

## Acceptance Criteria

| Criterion | Verify |
| --- | --- |
| Staff answers a general ticket | Captain opens general ticket → Staff replies → status `answered` |
| Specialized referral visibility | Staff refers to a league + specific admin → ticket leaves staff queue; only that admin (and super_admin / team owners) can open it |

## Setup

1. Run `0005_phase4_judging_tickets.sql`
2. Assign roles in `/super-admin/users` and league admins
3. Have a `submitted` team (complete payment from Phase 2)

## Flow

1. Team creates general ticket on team page
2. Staff answers or refers to league
3. League Admin reviews docs and decides
4. League Admin records/publishes results
