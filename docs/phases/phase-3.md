# RoboCactus — Phase 3 Acceptance

## Delivered

- Super-admin hub: `/super-admin`
- Leagues CRUD: `/super-admin/leagues` (fee, capacity, registration window, active flag)
- Users & roles: `/super-admin/users` + League Admin assignment
- Static pages CMS: `/super-admin/pages` (`about`, `contact`, `faq`, `privacy`)
- Public pages load CMS content: `/about`, `/contact`, `/faq`, `/privacy`
- Public `/leagues` lists active leagues from DB
- Migration: `db/migrations/0004_phase3_super_admin.sql`

## Acceptance Criteria

| Criterion | Verify |
| --- | --- |
| New league with fee appears in team registration | Create active league in admin → open company team wizard → league shows in select with fee used at payment |

## Setup

1. Run `0004_phase3_super_admin.sql`.
2. Promote a user: `update profiles set role = 'super_admin' where phone = '09...';`
3. Seed static pages if missing (`seed.sql`).

## Notes

- Assigning League Admin only auto-promotes `team_captain` → `league_admin` (does not overwrite `company_admin` / `staff`).
- Staff is set via the role dropdown.
- Inactive leagues are hidden from `fetchActiveLeagues` / registration wizard.
