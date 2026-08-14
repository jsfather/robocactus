# RoboCactus — Phase 9 Acceptance

## Delivered

- Full-bleed home hero with `home_banners` slider + Framer Motion fade
- Animated stats via `home_stats()` RPC (teams / cities / leagues / seasons)
- League highlight cards with category accents + geometric icons
- Top companies (podium count) + latest published blog posts
- Contact page: form → `contact_messages` + OSM map embed
- FAQ page: categorized accordion (i18n) + CMS intro
- Super-admin: `/super-admin/home` (banners CRUD + contact inbox)
- Migration: `supabase/migrations/0010_phase9_home.sql`
- Footer navigation for public pages

## Acceptance Criteria

| Criterion | Verify |
| --- | --- |
| Home loads well on desktop & mobile | Open `/` — hero full-bleed, sections readable without horizontal scroll |
| Visual quality preserved | Soft motion only; images lazy-loaded below the fold |
| Lighthouse Performance target > 85 | Run Lighthouse on production build / preview; avoid extra heavy assets |

## Setup

1. Apply `0010_phase9_home.sql` after previous migrations
2. Optional: manage banners at `/super-admin/home`
3. Confirm RPC: `select public.home_stats();`

## Notes

- After this phase, review visuals with stakeholders before Phase 10 (analytics).
- Map coordinates are a Tehran sample — replace for the real venue.
