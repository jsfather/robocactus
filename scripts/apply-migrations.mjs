/** Apply the ordered SQL migrations to any PostgreSQL instance through Drizzle. */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { sql } from 'drizzle-orm'
import { createHash } from 'node:crypto'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDir = path.join(root, 'db', 'migrations')
const shellEnvironment = new Set(Object.keys(process.env))

for (const filename of ['.env', '.env.local']) {
  const envPath = path.join(root, filename)
  if (!fs.existsSync(envPath)) continue
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const separator = trimmed.indexOf('=')
    if (separator < 1) continue
    const key = trimmed.slice(0, separator).trim()
    let value = trimmed.slice(separator + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!shellEnvironment.has(key)) process.env[key] = value
  }
}

const soft = process.argv.includes('--soft') || process.env.MIGRATE_SOFT === '1'
const connectionString = process.env.DATABASE_URL?.trim()
if (!connectionString) {
  const message = '[db:migrate] skipped — DATABASE_URL is not configured'
  if (soft) {
    console.warn(message)
    process.exit(0)
  }
  throw new Error(message)
}

const pool = new pg.Pool({
  connectionString,
  max: 2,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true, ...(process.env.DATABASE_CA ? { ca: process.env.DATABASE_CA.replace(/\\n/g, '\n') } : {}) } : undefined,
})
const db = drizzle(pool)

try {
  await db.execute(sql.raw('create schema if not exists app_private'))
  await db.execute(sql.raw(`
    create table if not exists app_private.schema_migrations (
      filename text primary key,
      applied_at timestamptz not null default now(),
      checksum text
    )
  `))
  await db.execute(sql.raw('alter table app_private.schema_migrations add column if not exists checksum text'))

  const appliedResult = await db.execute(sql.raw('select filename,checksum from app_private.schema_migrations'))
  const applied = new Map(appliedResult.rows.map((row) => [String(row.filename), row.checksum == null ? null : String(row.checksum)]))
  const files = fs.readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()

  for (const file of files) {
    const migration = fs.readFileSync(path.join(migrationsDir, file), 'utf8')
    const checksum = createHash('sha256').update(migration).digest('hex')
    if (applied.has(file)) {
      const recorded = applied.get(file)
      if (recorded && recorded !== checksum) throw new Error(`[db:migrate] checksum mismatch for ${file}`)
      if (!recorded) await db.execute(sql`update app_private.schema_migrations set checksum=${checksum} where filename=${file}`)
      console.log(`[db:migrate] skip ${file}`)
      continue
    }
    console.log(`[db:migrate] apply ${file}`)
    await db.transaction(async (transaction) => {
      await transaction.execute(sql.raw(migration))
      await transaction.execute(sql`insert into app_private.schema_migrations(filename,checksum) values (${file},${checksum})`)
    })
    console.log(`[db:migrate] ok ${file}`)
  }

  if (process.argv.includes('--seed') || process.env.APPLY_SEED === '1') {
    const seedPath = path.join(root, 'db', 'seed.sql')
    if (fs.existsSync(seedPath)) {
      await db.execute(sql.raw(fs.readFileSync(seedPath, 'utf8')))
      console.log('[db:migrate] ok seed.sql')
    }
  }

  const summary = await db.execute(sql.raw(`
    select count(*) filter (where is_active)::int as active,
           count(*) filter (where not is_active)::int as drafts,
           count(*)::int as total
    from public.leagues
  `))
  const row = summary.rows[0]
  if (row) console.log(`[db:migrate] leagues: ${row.active} active, ${row.drafts} draft, ${row.total} total`)
  console.log('[db:migrate] done')
} finally {
  await pool.end()
}
