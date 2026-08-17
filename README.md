# RoboCup Tabarestan (روبوکاپ تبرستان)

پلتفرم وب مدیریت مسابقات و رویدادهای علمی/رباتیک — تک‌رویداد در هر instance، چندنقشه.

## Stack

- React + Vite + TypeScript + Tailwind CSS + Framer Motion
- Supabase (Auth, Postgres + RLS, Storage, Realtime)
- i18n: فارسی (پیش‌فرض, RTL) / English (LTR)

## Quick start

```bash
cp .env.example .env
# fill keys (see below)
npm install
npm run db:migrate
npm run dev
```

## Database migrations (automatic)

Files in `supabase/migrations/` are applied by the runner:

```bash
npm run db:migrate         # apply pending
npm run db:migrate:seed    # + seed.sql
npm run dev                # soft-migrate, then Vite
```

Put one of these in `.env` (never commit secrets):

1. **Recommended:** `SUPABASE_ACCESS_TOKEN` from [Account → Access Tokens](https://supabase.com/dashboard/account/tokens)
   (works over HTTPS even when direct DB host is IPv6-only)
2. Or `DATABASE_URL` / `SUPABASE_DB_PASSWORD` for direct Postgres

If the DB was first created via SQL Editor, the runner baselines existing schema and only applies new files.

## Env

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` (anon / publishable — never service_role)
- `SUPABASE_ACCESS_TOKEN` (migrations)

Phase docs: `docs/phases/phase-0.md` … `phase-11.md`.

## Docker / Dokploy

The production image builds the Vite app and serves it with Nginx on port `80`.
Frontend configuration is generated when the container starts, so configure these
as runtime environment variables in Dokploy:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-or-publishable-key
```

In Dokploy, deploy this repository with the **Dockerfile** build type, use
`Dockerfile` as the path, and set container port `80`. Add the variables above in
the Environment tab and redeploy. Point the domain at port `80`; Dokploy handles
the reverse proxy and TLS.

For a local production test:

```bash
docker build -t robocactus .
docker run --rm -p 8080:80 --env-file .env robocactus
```

Open <http://localhost:8080>. The image never copies `.env`; it only exports
variables whose names begin with `VITE_` to `/env.js`. Every `VITE_*` value is
public in the browser, so never use a Supabase `service_role`/secret key, database
password, access token, or SMS provider secret there. Configure Edge Function
secrets separately in Supabase.
