/** Seed local demo accounts directly into PostgreSQL. Password for all: Demo@12345 */
import fs from 'node:fs'
import { randomBytes, randomUUID, scrypt as scryptCallback } from 'node:crypto'
import { promisify } from 'node:util'
import pg from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { sql } from 'drizzle-orm'

for (const filename of ['.env', '.env.local']) {
  if (!fs.existsSync(filename)) continue
  for (const line of fs.readFileSync(filename, 'utf8').split(/\r?\n/)) {
    const index = line.indexOf('=')
    if (index < 1 || line.trim().startsWith('#')) continue
    const key = line.slice(0, index).trim()
    let value = line.slice(index + 1).trim().replace(/^(['"])(.*)\1$/, '$2')
    if (!process.env[key]) process.env[key] = value
  }
}

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
})
const db = drizzle(pool)
const scrypt = promisify(scryptCallback)
const password = 'Demo@12345'
const salt = randomBytes(16).toString('hex')
const passwordHash = `scrypt:${salt}:${Buffer.from(await scrypt(password, salt, 64)).toString('hex')}`
const demoUsers = [
  ['admin@robocactus.demo', 'Super Admin', '09000000001', 'super_admin', '/super-admin'],
  ['league@robocactus.demo', 'League Admin', '09000000002', 'league_admin', '/league-admin'],
  ['staff@robocactus.demo', 'Staff User', '09000000003', 'staff', '/staff'],
  ['company@robocactus.demo', 'Company Admin', '09000000004', 'company_admin', '/company'],
  ['captain@robocactus.demo', 'Team Captain', '09000000005', 'team_captain', '/dashboard'],
]

try {
  for (const [email, fullName, phone, role, panel] of demoUsers) {
    const id = randomUUID()
    const result = await db.execute(sql`
      insert into auth.users(id, email, encrypted_password, phone, raw_user_meta_data, email_confirmed_at)
      values (${id}::uuid, ${email}, ${passwordHash}, ${phone}, ${{ full_name: fullName, phone, role }}, now())
      on conflict (email) do update set encrypted_password = excluded.encrypted_password, updated_at = now()
      returning id
    `)
    const userId = String(result.rows[0]?.id)
    await db.execute(sql`
      update public.profiles set full_name = ${fullName}, phone = ${phone}, role = ${role}::user_role
      where id = ${userId}::uuid
    `)
    console.log(`${String(role).padEnd(14)} ${String(email).padEnd(28)} -> ${panel}`)
  }
  console.log(`Password for all demo accounts: ${password}`)
} finally {
  await pool.end()
}
