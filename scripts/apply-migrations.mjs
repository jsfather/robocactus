/**
 * Apply pending SQL files from supabase/migrations automatically.
 *
 * Usage:
 *   npm run db:migrate
 *   npm run db:migrate:seed
 *   npm run dev              # soft-migrate then Vite
 *
 * Auth options (in .env):
 *   1) SUPABASE_ACCESS_TOKEN  ← recommended (HTTPS Management API, no IPv6 issues)
 *      Create at: https://supabase.com/dashboard/account/tokens
 *   2) DATABASE_URL or SUPABASE_DB_PASSWORD  ← direct Postgres / pooler
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dns from 'node:dns'

dns.setDefaultResultOrder('ipv6first')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const migrationsDir = path.join(root, 'supabase', 'migrations')
const envPath = path.join(root, '.env')

function loadEnvFile() {
  if (!fs.existsSync(envPath)) return
  const text = fs.readFileSync(envPath, 'utf8')
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const i = trimmed.indexOf('=')
    if (i < 0) continue
    const key = trimmed.slice(0, i).trim()
    let value = trimmed.slice(i + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = value
  }
}

loadEnvFile()

function projectRef() {
  return (
    process.env.SUPABASE_PROJECT_REF ||
    (process.env.VITE_SUPABASE_URL || '').match(/https:\/\/([a-z0-9]+)\.supabase\.co/i)?.[1] ||
    null
  )
}

/** @typedef {{ exec: (sql: string) => Promise<unknown>, close: () => Promise<void>, label: string }} DbRunner */

async function connectPg() {
  let pg
  try {
    pg = (await import('pg')).default
  } catch {
    return null
  }

  const urls = []
  const primary = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL
  if (primary) urls.push(primary)

  const password = process.env.SUPABASE_DB_PASSWORD || process.env.DB_PASSWORD
  const ref = projectRef()
  if (password && ref) {
    const enc = encodeURIComponent(password)
    urls.push(`postgresql://postgres:${enc}@db.${ref}.supabase.co:5432/postgres`)
    for (const region of [
      'ap-northeast-2',
      'ap-southeast-1',
      'eu-central-1',
      'eu-west-1',
      'eu-west-2',
      'us-east-1',
      'us-west-1',
    ]) {
      urls.push(
        `postgresql://postgres.${ref}:${enc}@aws-0-${region}.pooler.supabase.com:5432/postgres`,
      )
    }
  }

  const unique = [...new Set(urls)]
  for (const connectionString of unique) {
    const host = connectionString.split('@')[1]?.split('/')[0] ?? 'unknown'
    const client = new pg.Client({
      connectionString,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 8_000,
    })
    try {
      await client.connect()
      console.log(`[db:migrate] connected via Postgres ${host}`)
      return /** @type {DbRunner} */ ({
        label: 'postgres',
        async exec(sql) {
          await client.query(sql)
        },
        async close() {
          await client.end()
        },
      })
    } catch (err) {
      console.warn(`[db:migrate] Postgres failed (${host}): ${err.code || err.message}`)
      try {
        await client.end()
      } catch {
        /* ignore */
      }
    }
  }
  return null
}

async function connectManagementApi() {
  const token = process.env.SUPABASE_ACCESS_TOKEN
  const ref = projectRef()
  if (!token || !ref) return null

  const endpoint = `https://api.supabase.com/v1/projects/${ref}/database/query`

  // probe
  const probe = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: 'select 1 as ok;' }),
  })
  if (!probe.ok) {
    const body = await probe.text()
    throw new Error(`Management API ${probe.status}: ${body.slice(0, 200)}`)
  }

  console.log(`[db:migrate] connected via Management API (project ${ref})`)
  return /** @type {DbRunner} */ ({
    label: 'management-api',
    async exec(sql) {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: sql }),
      })
      if (!res.ok) {
        const body = await res.text()
        throw new Error(body.slice(0, 500) || `HTTP ${res.status}`)
      }
      return res.json().catch(() => null)
    },
    async close() {
      /* noop */
    },
  })
}

async function queryRows(runner, sql) {
  if (runner.label === 'postgres') {
    // re-open path isn't needed; use exec won't return rows easily.
    // For postgres we attach a helper below — see createRunner wrapper.
  }
  const result = await runner.exec(sql)
  if (Array.isArray(result)) return result
  if (result && Array.isArray(result.data)) return result.data
  return []
}

async function connectPostgresRunner() {
  let pg
  try {
    pg = (await import('pg')).default
  } catch {
    return null
  }

  const urls = []
  const primary = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL
  if (primary) urls.push(primary)
  const password = process.env.SUPABASE_DB_PASSWORD || process.env.DB_PASSWORD
  const ref = projectRef()
  if (password && ref) {
    const enc = encodeURIComponent(password)
    urls.push(`postgresql://postgres:${enc}@db.${ref}.supabase.co:5432/postgres`)
  }

  for (const connectionString of [...new Set(urls)]) {
    const host = connectionString.split('@')[1]?.split('/')[0] ?? 'unknown'
    const client = new pg.Client({
      connectionString,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 8_000,
    })
    try {
      await client.connect()
      console.log(`[db:migrate] connected via Postgres ${host}`)
      return {
        label: 'postgres',
        async exec(sql) {
          const r = await client.query(sql)
          return r.rows ?? []
        },
        async close() {
          await client.end()
        },
      }
    } catch (err) {
      console.warn(`[db:migrate] Postgres failed (${host}): ${err.code || err.message}`)
      try {
        await client.end()
      } catch {
        /* ignore */
      }
    }
  }
  return null
}

async function ensureMigrationsTable(runner) {
  await runner.exec(`
    create table if not exists public.schema_migrations (
      filename text primary key,
      applied_at timestamptz not null default now()
    );
  `)
}

async function isApplied(runner, file) {
  const rows = await runner.exec(
    `select 1 as ok from public.schema_migrations where filename = '${file.replace(/'/g, "''")}' limit 1;`,
  )
  if (Array.isArray(rows) && rows.length > 0) return true
  return false
}

async function baselineIfNeeded(runner, files) {
  const countRows = await runner.exec(`select count(*)::int as n from public.schema_migrations;`)
  const n = Number(Array.isArray(countRows) ? countRows[0]?.n : 0)
  if (n > 0) return

  const leagues = await runner.exec(`select to_regclass('public.leagues') as leagues;`)
  const hasLeagues = Boolean(Array.isArray(leagues) && leagues[0]?.leagues)
  if (!hasLeagues) return

  console.log('[db:migrate] Existing schema detected — baselining previous migrations…')
  for (const file of files) {
    if (file.startsWith('0012')) {
      const fn = await runner.exec(
        `select to_regprocedure('public.is_company_member(uuid)') is not null as ok;`,
      )
      const ok = Boolean(Array.isArray(fn) && fn[0]?.ok)
      if (!ok) {
        console.log(`[db:migrate] leave pending: ${file}`)
        continue
      }
    }
    if (file.startsWith('0013')) {
      const col = await runner.exec(`
        select 1 as ok
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'leagues'
          and column_name = 'short_description'
        limit 1;
      `)
      const ok = Boolean(Array.isArray(col) && col.length > 0)
      if (!ok) {
        console.log(`[db:migrate] leave pending: ${file}`)
        continue
      }
    }
    await runner.exec(
      `insert into public.schema_migrations (filename) values ('${file.replace(/'/g, "''")}') on conflict do nothing;`,
    )
    console.log(`[db:migrate] baseline ${file}`)
  }
}

async function main() {
  const soft = process.argv.includes('--soft') || process.env.MIGRATE_SOFT === '1'
  void queryRows
  void connectPg

  let runner = null
  try {
    runner = await connectPostgresRunner()
  } catch (err) {
    console.warn(`[db:migrate] Postgres path error: ${err.message}`)
  }

  if (!runner && process.env.SUPABASE_ACCESS_TOKEN && projectRef()) {
    try {
      runner = await connectManagementApi()
    } catch (err) {
      console.warn(`[db:migrate] Management API failed: ${err.message}`)
    }
  }

  if (!runner) {
    const msg =
      '[db:migrate] skipped — set SUPABASE_ACCESS_TOKEN (recommended) or DATABASE_URL / SUPABASE_DB_PASSWORD in .env'
    if (soft) {
      console.warn(msg)
      return
    }
    console.error(msg)
    console.error(
      'Create a token: https://supabase.com/dashboard/account/tokens  then add SUPABASE_ACCESS_TOKEN=... to .env',
    )
    process.exit(1)
  }

  try {
    await ensureMigrationsTable(runner)
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort()

    await baselineIfNeeded(runner, files)

    for (const file of files) {
      if (await isApplied(runner, file)) {
        console.log(`[db:migrate] skip ${file}`)
        continue
      }

      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8')
      console.log(`[db:migrate] apply ${file} …`)
      try {
        // Management API has no multi-statement transaction wrapper; run file then mark.
        await runner.exec(sql)
        await runner.exec(
          `insert into public.schema_migrations (filename) values ('${file.replace(/'/g, "''")}');`,
        )
        console.log(`[db:migrate] ok ${file}`)
      } catch (err) {
        console.error(`[db:migrate] FAIL ${file}:`, err.message)
        process.exitCode = 1
        return
      }
    }

    if (process.env.APPLY_SEED === '1' || process.argv.includes('--seed')) {
      const seedPath = path.join(root, 'supabase', 'seed.sql')
      if (fs.existsSync(seedPath)) {
        console.log('[db:migrate] apply seed.sql …')
        await runner.exec(fs.readFileSync(seedPath, 'utf8'))
        console.log('[db:migrate] ok seed.sql')
      }
    }

    console.log('[db:migrate] done')
  } finally {
    await runner.close()
  }
}

await main()
