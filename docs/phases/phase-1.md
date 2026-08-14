# RoboCactus — Phase 1 Acceptance

## Delivered

- Company panel at `/company` (create/edit profile, logo upload to `company-logos`)
- RPC `create_company` — atomic company + owner membership + role → `company_admin`
- Multi-step team wizard: info → members → documents → review
- Draft persistence in `localStorage` (`robocactus-team-draft:{companyId}`)
- Captain by phone: existing profile assigned, otherwise invite + interim owner captain
- Team documents to Storage `team-documents` (`{userId}/{teamId}/…`) with MIME/size checks
- Captain panel `/team` and `/team/:teamId`
- Migration `supabase/migrations/0002_phase1_companies_teams.sql`

## Acceptance Criteria

| Criterion | How to verify |
| --- | --- |
| Two teams for two leagues | Company admin: Add team for Rescue, then Soccer — list shows both |
| Separate captains | Use different phone numbers; if phone exists, that user is captain; else invite queued |
| Documents + RLS Storage | Upload PDF/image on step 3; object path under uploader uid; DB row in `documents` |

## Setup after Phase 0

1. Run `0002_phase1_companies_teams.sql` on Supabase.
2. Ensure `seed.sql` leagues exist (rescue / soccer / humanoid).
3. Soft-refresh session after creating a company (role becomes `company_admin` via `refreshProfile`).

## Notes

- Payment still Phase 2 — finished wizard keeps `status = draft`.
- Unique `(company_id, league_id)` enforced at DB level.
