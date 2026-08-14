# RoboCactus — Phase 0 Acceptance

## Delivered

- Vite + React + TypeScript + Tailwind CSS v4 scaffold
- Folder layout matching the project prompt (`app/`, `features/`, `lib/`, …)
- Supabase migration `supabase/migrations/0001_init.sql`: enums, tables, RLS, storage bucket, auto `profiles` trigger
- Seed data in `supabase/seed.sql` (static pages + sample leagues)
- Supabase client + typed domain models in `src/types/database.ts`
- i18n `fa` / `en` with automatic `dir` + `lang` switching
- Auth UI: `/signup`, `/login`, session via Supabase Auth, role-aware dashboard shells

## Acceptance Criteria

| Criterion | How to verify |
| --- | --- |
| Signup / login works | Set `.env` from `.env.example`, run migration on Supabase, register a user, sign in, land on `/dashboard` |
| Auto profile trigger | After signup, a row appears in `public.profiles` with `full_name` + `phone` from metadata |

## Local setup

1. Create a Supabase project.
2. Copy `.env.example` → `.env` and fill `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
3. In Supabase SQL editor (or CLI): run `0001_init.sql`, then optionally `seed.sql`.
4. `npm install` then `npm run dev`.

## Notes

- Do **not** disable RLS for testing.
- When schema changes: `supabase gen types typescript --local > src/types/database.ts` (or linked remote).
- Role panel routes are placeholders until later phases.
