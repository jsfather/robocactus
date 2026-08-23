# RoboCactus — Phase 0 Acceptance

## Delivered

- Vite + React + TypeScript + Tailwind CSS v4 scaffold
- Folder layout matching the project prompt (`app/`, `features/`, `lib/`, …)
- PostgreSQL migration `db/migrations/0001_init.sql`: enums, tables, RLS, storage bucket, auto `profiles` trigger
- Seed data in `db/seed.sql` (static pages + sample leagues)
- Same-origin backend client + typed domain models in `src/types/database.ts`
- i18n `fa` / `en` with automatic `dir` + `lang` switching
- Auth UI: `/signup`, `/login`, session via application auth, role-aware dashboard shells

## Acceptance Criteria

| Criterion | How to verify |
| --- | --- |
| Signup / login works | Set `DATABASE_URL`, run migrations, register a user, sign in, land on `/dashboard` |
| Auto profile trigger | After signup, a row appears in `public.profiles` with `full_name` + `phone` from metadata |

## Local setup

1. Create a PostgreSQL database.
2. Copy `.env.example` → `.env` and fill `DATABASE_URL` and server secrets.
3. Run `npm run db:migrate`, then optionally `npm run db:migrate:seed`.
4. `npm install` then `npm run dev`.

## Notes

- Do **not** disable RLS for testing.
- Keep `db/schema.ts` and `src/types/database.ts` aligned when the domain schema changes.
- Role panel routes are placeholders until later phases.
