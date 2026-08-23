# RoboCactus — Phase 7 Acceptance

## Delivered

- Public rankings archive: `/rankings` (filter by year / league / search team or company)
- Public companies directory: `/companies`
- Public company profile: `/companies/:slug`
  - bio, logo, website
  - podium history (ranks 1–3 from published `results` across all leagues/years)
  - curated `company_achievements`
  - active/approved teams
  - full published results table
- Migration: `db/migrations/0008_phase7_public_rankings.sql` (public team select for archive)

## Acceptance Criteria

| Criterion | Verify |
| --- | --- |
| Company profile shows full championship history | Publish results for a company in multiple leagues/years → open `/companies/{slug}` → podium + full history sections list all |

## Setup

1. Run `0008_phase7_public_rankings.sql`
2. Publish results from League Admin judging panel (`Save & publish`)
3. Optional: insert rows into `company_achievements` as super_admin

## Notes

- Only `results` with `published_at IS NOT NULL` appear publicly (RLS).
- Team names on rankings require the new public select policy for teams with published results / approved status.
