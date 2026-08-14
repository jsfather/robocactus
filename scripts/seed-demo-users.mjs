/**
 * Create demo role accounts via Auth Admin HTTP API.
 * Usage: npm run db:seed-demo-users
 * Password for all: Demo@12345
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const envPath = path.join(root, '.env')
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const t = line.trim()
  if (!t || t.startsWith('#') || !t.includes('=')) continue
  const i = t.indexOf('=')
  const key = t.slice(0, i).trim()
  let value = t.slice(i + 1).trim()
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1)
  }
  process.env[key] = value
}

const ref =
  process.env.SUPABASE_PROJECT_REF ||
  (process.env.VITE_SUPABASE_URL || '').match(/https:\/\/([a-z0-9]+)\.supabase\.co/i)?.[1]
const token = process.env.SUPABASE_ACCESS_TOKEN
const url = (process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
if (!token || !ref || !url) {
  console.error('Need SUPABASE_ACCESS_TOKEN and VITE_SUPABASE_URL')
  process.exit(1)
}

const PASSWORD = 'Demo@12345'
const users = [
  { email: 'admin@robocactus.demo', full_name: 'Super Admin', phone: '09000000001', role: 'super_admin', panel: '/super-admin' },
  { email: 'league@robocactus.demo', full_name: 'League Admin', phone: '09000000002', role: 'league_admin', panel: '/league-admin' },
  { email: 'staff@robocactus.demo', full_name: 'Staff User', phone: '09000000003', role: 'staff', panel: '/staff' },
  { email: 'company@robocactus.demo', full_name: 'Company Admin', phone: '09000000004', role: 'company_admin', panel: '/company' },
  { email: 'captain@robocactus.demo', full_name: 'Team Captain', phone: '09000000005', role: 'team_captain', panel: '/dashboard' },
]

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`SQL ${res.status}: ${text.slice(0, 400)}`)
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

async function resolveServiceRole() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`api-keys ${res.status}: ${text.slice(0, 300)}`)
  const keys = JSON.parse(text)
  const service = (Array.isArray(keys) ? keys : []).find(
    (k) => k.name === 'service_role' || k.tags?.includes?.('service_role'),
  )
  const key = service?.api_key || service?.key
  if (!key) throw new Error('service_role key not found via Management API')
  return key
}

async function authAdmin(serviceKey, method, pathName, body) {
  const res = await fetch(`${url}/auth/v1${pathName}`, {
    method,
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    /* ignore */
  }
  if (!res.ok) throw new Error(`Auth ${method} ${pathName} ${res.status}: ${text.slice(0, 400)}`)
  return json
}

const serviceKey = await resolveServiceRole()
console.log(`[seed-demo] project ${ref}`)

const created = []
for (const u of users) {
  const list = await authAdmin(serviceKey, 'GET', '/admin/users?page=1&per_page=200')
  const existing = (list?.users || []).find((x) => x.email === u.email)
  let id
  if (existing) {
    id = existing.id
    await authAdmin(serviceKey, 'PUT', `/admin/users/${id}`, {
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: u.full_name, phone: u.phone },
    })
  } else {
    const createdUser = await authAdmin(serviceKey, 'POST', '/admin/users', {
      email: u.email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: u.full_name, phone: u.phone },
    })
    id = createdUser?.id || createdUser?.user?.id
    if (!id) throw new Error(`No id returned for ${u.email}`)
  }

  await sql(`
    insert into public.profiles (id, full_name, phone, role)
    values (
      '${id}',
      '${u.full_name.replace(/'/g, "''")}',
      '${u.phone}',
      '${u.role}'
    )
    on conflict (id) do update set
      full_name = excluded.full_name,
      phone = excluded.phone,
      role = excluded.role;
  `)
  created.push({ ...u, id })
  console.log(`[seed-demo] ${u.role}: ${u.email}`)
}

const leagueAdmin = created.find((u) => u.role === 'league_admin')
if (leagueAdmin) {
  await sql(`
    insert into public.league_admins (league_id, user_id)
    select id, '${leagueAdmin.id}'::uuid from public.leagues where slug = 'rescue'
    on conflict do nothing;
  `)
}

const companyAdmin = created.find((u) => u.role === 'company_admin')
if (companyAdmin) {
  await sql(`
    insert into public.companies (name, slug, bio)
    select 'شرکت نمونه کاکتوس', 'demo-company', 'شرکت دمو برای تست پنل شرکت'
    where not exists (select 1 from public.companies where slug = 'demo-company');

    insert into public.company_members (company_id, user_id, is_owner)
    select c.id, '${companyAdmin.id}'::uuid, true
    from public.companies c
    where c.slug = 'demo-company'
    on conflict (company_id, user_id) do update set is_owner = true;
  `)
}

console.log('\n=== Demo logins (email / password) ===')
console.log(`Password for ALL accounts: ${PASSWORD}\n`)
for (const u of created) {
  console.log(`${u.role.padEnd(14)} ${u.email.padEnd(28)} → ${u.panel}`)
}
console.log('\nOpen /login → Email tab')
