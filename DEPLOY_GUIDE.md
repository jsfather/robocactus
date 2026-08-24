# Dokploy service contract

Create the PostgreSQL service and application service in the same Dokploy project/network.

## PostgreSQL service

Use PostgreSQL 15 or newer. Create a database and login for the application. Persist PostgreSQL’s data directory. The application login must initially be able to create schemas, extensions, no-login roles, policies, functions, triggers, and a publication because the existing domain model relies on those PostgreSQL features.

The connection value exposed to the application should look like:

```env
DATABASE_URL=postgresql://USER:PASSWORD@POSTGRES_SERVICE_HOST:5432/DATABASE
```

No database port needs to be public.

## Application service

Build this repository with `Dockerfile`, expose container port `3000`, and attach the public domain to that port. The container applies pending migrations before starting the server.

Required environment:

```env
DATABASE_URL=postgresql://USER:PASSWORD@POSTGRES_SERVICE_HOST:5432/DATABASE
DATABASE_SSL=false
APP_URL=https://your-domain.example
SESSION_SECRET=a-long-random-secret
UPLOAD_SIGNING_SECRET=another-long-random-secret
```

`APP_URL` must be the canonical public browser origin (including `https://`, with no path). The server also recognizes the public host forwarded by Dokploy's reverse proxy. If the same deployment must accept browser requests from additional domains, add them explicitly as comma-separated origins:

```env
ALLOWED_ORIGINS=https://www.your-domain.example,https://preview.your-domain.example
```

Also configure the provider variables you use from `.env.example`. Do not prefix credentials with `VITE_`; every `VITE_*` value is public browser configuration.

Persist `/app/data/uploads` as a volume. Without that volume, uploaded logos, documents, CMS media, and ticket attachments disappear when the application container is replaced.

Health check: `GET /api/health` (or `HEAD /api/health`). A healthy response verifies both the Node server and PostgreSQL connection.

## First deployment

The container runs `npm run db:migrate` automatically. To add the optional development content once, run `npm run db:migrate:seed` in the application container. To create demo accounts, run `npm run db:seed-demo-users`; do not use demo credentials on a public production instance.

Back up both the PostgreSQL database and the uploads volume. A database-only backup does not contain uploaded file bytes.
