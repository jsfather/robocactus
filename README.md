# Tabarestan Cup

Competition and event management platform built with React, Vite, TypeScript, PostgreSQL, and Drizzle ORM.

The application is now self-contained: one Node service serves the frontend and API, while a separate ordinary PostgreSQL service stores all persistent data. No Supabase service, SDK, key, Auth, Storage, Realtime, or Edge Function is required.

## Local development

Requirements: Node.js 24+ and PostgreSQL 15+.

```bash
cp .env.example .env
# Set DATABASE_URL and the application secrets.
npm install
npm run db:migrate:seed
npm run dev
```

Open <http://localhost:3000>. The development server serves both Vite and `/api`, matching production’s same-origin topology.

Useful commands:

```bash
npm run db:migrate
npm run db:migrate:seed
npm run db:seed-demo-users
npm run build
npm start
```

Migrations live in `db/migrations/` and are applied in filename order through Drizzle. Applied filenames are tracked in `app_private.schema_migrations`.

## Runtime architecture

- Node/Express serves the compiled React app and same-origin API on port `3000`.
- Drizzle is the only application database adapter and connects through `DATABASE_URL`.
- PostgreSQL RLS continues to enforce the established role and ownership rules.
- Authentication uses opaque, hashed, database-backed sessions in an HttpOnly cookie.
- Uploads use `UPLOAD_DIR`; mount this path as persistent storage in production.
- Realtime updates use SSE backed by PostgreSQL change events and RLS visibility checks.
- OTP, SMS/email dispatch, and ZarinPal calls run only on the server, so provider secrets never reach the browser.
- The built-in notification worker dispatches queued SMS/email every minute and enqueues deadline reminders hourly; set `NOTIFICATION_WORKER=false` only when another worker owns those jobs.

See `DEPLOY_GUIDE.md` for the exact service contract.
