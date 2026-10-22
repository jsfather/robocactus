import type { Response, Router } from 'express'
import { sql } from 'drizzle-orm'
import { db, hashToken, userFromRequest, withRequestRole, type AuthUser } from './db.js'
import { isGuestChatToken } from './chat-token.js'

type Client = { response: Response; tables: Set<string>; user: AuthUser | null; sessionHash: string | null; guestChatToken: string | null; ip: string; disconnected: boolean }
const clients = new Set<Client>()
const clientsByIp = new Map<string, number>()
const MAX_CLIENTS = 500
const MAX_CLIENTS_PER_IP = 6
let lastEventId = 0
let poller: NodeJS.Timeout | null = null
let polling = false
let lastSessionCheck = 0

export function revokeRealtimeSessions(hashes: string[]): void {
  const revoked = new Set(hashes)
  for (const client of clients) {
    if (client.sessionHash && revoked.has(client.sessionHash)) {
      if ([...client.tables].every((table) => PUBLIC_REALTIME_TABLES.has(table))) {
        client.user = null
        client.sessionHash = null
        continue
      }
      try {
        client.response.write('event: session_expired\ndata: {}\n\n')
      } catch {
        // The revoked browser may already have closed its connection.
      } finally {
        disconnect(client)
      }
    }
  }
}

async function validateSessions(): Promise<void> {
  const hashes = [...new Set([...clients].map((client) => client.sessionHash).filter((hash): hash is string => Boolean(hash)))]
  if (!hashes.length) return
  // Check across server instances as well as the process serving the logout
  // request, including connections with no new database events to deliver.
  const valid = await db.execute(sql`
    select s.token_hash from app_private.sessions s
    where s.token_hash in (${sql.join(hashes.map((hash) => sql`${hash}`), sql`, `)})
      and s.expires_at > now()
      and not exists (select 1 from public.profiles p where p.id = s.user_id and p.account_status = 'suspended')
  `)
  const active = new Set(valid.rows.map((row) => String(row.token_hash)))
  revokeRealtimeSessions(hashes.filter((hash) => !active.has(hash)))
}

const REALTIME_TABLES = new Set([
  'teams', 'invoices', 'tickets', 'ticket_messages', 'ticket_reads', 'results', 'leagues',
  'live_chat_sessions', 'live_chat_messages', 'system_notifications', 'account_issues',
  'judge_scores',
  'profiles',
  'site_settings', 'home_banners', 'home_events', 'home_faqs', 'home_partners',
  'home_sponsors', 'home_stat_cards', 'home_why_cards', 'blog_posts', 'companies',
  'team_attendance_clearances', 'team_members', 'team_technical_files',
  'league_attendance_settings', 'registration_doc_types',
])
const PUBLIC_REALTIME_TABLES = new Set([
  'results', 'leagues', 'site_settings', 'home_banners', 'home_events', 'home_faqs',
  'home_partners', 'home_sponsors', 'home_stat_cards', 'home_why_cards', 'blog_posts', 'companies',
])

function safeIdentifier(name: string) {
  if (!REALTIME_TABLES.has(name)) throw new Error('invalid_realtime_table')
  return sql.identifier(name)
}

async function visibleRecord(client: Client, event: Record<string, unknown>) {
  const tableName = String(event.table_name)
  const raw = (event.record ?? event.old_record) as Record<string, unknown> | null
  const primaryKey = tableName === 'team_attendance_clearances' ? 'team_id'
    : tableName === 'league_attendance_settings' ? 'league_id'
      : 'id'
  const primaryValue = raw?.[primaryKey]
  if (!primaryValue || event.event === 'DELETE') return client.user || PUBLIC_REALTIME_TABLES.has(tableName) ? {} : null
  if (client.guestChatToken && tableName === 'live_chat_messages' && raw.session_id) {
    const visible = await db.execute(sql`
      select to_jsonb(m) as record from public.live_chat_messages m
      join public.live_chat_sessions s on s.id=m.session_id
      where m.id=${raw.id}::uuid and s.session_token=${client.guestChatToken}
      limit 1
    `)
    return (visible.rows[0]?.record as Record<string, unknown> | undefined) ?? null
  }
  if (client.guestChatToken && tableName === 'live_chat_sessions') {
    const visible = await db.execute(sql`
      select to_jsonb(s) as record from public.live_chat_sessions s
      where s.id=${raw.id}::uuid and s.session_token=${client.guestChatToken}
      limit 1
    `)
    return (visible.rows[0]?.record as Record<string, unknown> | undefined) ?? null
  }
  // Document requirement changes contain no secret values. Sending only the
  // identity/scope also lets clients notice a requirement that was disabled,
  // which is no longer selectable through the active-only RLS policy.
  if (client.user && tableName === 'registration_doc_types') {
    return { id: raw.id, scope: raw.scope }
  }
  if (client.user && tableName === 'profiles' && String(raw.id) !== client.user.id) {
    const accountReviewEvent = Boolean(raw.requires_account_approval || (event.old_record as Record<string, unknown> | null)?.requires_account_approval)
    if (!accountReviewEvent) return null
    const allowed = await withRequestRole(client.user, (transaction) => transaction.execute(sql`
      select public.has_panel_permission('account_activation') as allowed
    `)).catch(() => null)
    return allowed?.rows[0]?.allowed ? { id: raw.id } : null
  }
  return withRequestRole(client.user, async (transaction) => {
    const keyIdentifier = sql.identifier(primaryKey)
    const result = await transaction.execute(sql`
      select to_jsonb(row) as record from public.${safeIdentifier(tableName)} row
      where row.${keyIdentifier} = ${String(primaryValue)} limit 1
    `)
    return (result.rows[0]?.record as Record<string, unknown> | undefined) ?? null
  }).catch(() => null)
}

async function poll(): Promise<void> {
  if (!clients.size) return
  if (Date.now() - lastSessionCheck >= 15_000) {
    await validateSessions()
    lastSessionCheck = Date.now()
  }
  const result = await db.execute(sql`
    select id, table_name, event, record, old_record
    from app_private.realtime_events where id > ${lastEventId}
    order by id asc limit 200
  `)
  for (const event of result.rows) {
    lastEventId = Math.max(lastEventId, Number(event.id))
    for (const client of clients) {
      if (!client.tables.has(String(event.table_name))) continue
      try {
        const record = await visibleRecord(client, event)
        if (record === null) continue
        if (client.disconnected || client.response.destroyed) continue
        const writable = client.response.write(`data: ${JSON.stringify({
          table: event.table_name,
          event: event.event,
          record,
          old_record: event.event === 'DELETE' ? {} : event.old_record,
        })}\n\n`)
        if (!writable) disconnect(client)
      } catch {
        // A browser, reverse proxy, or deploy can close an SSE socket between
        // the visibility query and the write. Remove only that stale client;
        // one broken connection must not abort delivery for every subscriber.
        disconnect(client)
      }
    }
  }
}

function disconnect(client: Client): void {
  if (client.disconnected) return
  client.disconnected = true
  clients.delete(client)
  const count = (clientsByIp.get(client.ip) ?? 1) - 1
  if (count > 0) clientsByIp.set(client.ip, count)
  else clientsByIp.delete(client.ip)
  if (!client.response.destroyed && !client.response.writableEnded) client.response.end()
}

export async function initializeRealtime(): Promise<void> {
  const current = await db.execute(sql`select coalesce(max(id), 0)::bigint as id from app_private.realtime_events`)
  lastEventId = Number(current.rows[0]?.id ?? 0)
  if (!poller) {
    poller = setInterval(() => {
      if (polling) return
      polling = true
      void poll().catch((error) => console.error('[realtime]', error)).finally(() => { polling = false })
    }, 1000)
    poller.unref()
  }
}

export function registerRealtimeRoutes(router: Router): void {
  router.get('/realtime', async (request, response) => {
    const requested = String(request.query.tables ?? '').split(',').filter((name) => REALTIME_TABLES.has(name))
    if (!requested.length) {
      response.status(400).json({ error: 'no_valid_tables' })
      return
    }
    const ip = request.ip ?? request.socket.remoteAddress ?? 'unknown'
    if (clients.size >= MAX_CLIENTS || (clientsByIp.get(ip) ?? 0) >= MAX_CLIENTS_PER_IP) {
      response.status(429).json({ error: 'realtime_connection_limit' })
      return
    }
    response.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    response.flushHeaders()
    const user = await userFromRequest(request)
    if (request.cookies?.rc_session && !user && requested.some((table) => !PUBLIC_REALTIME_TABLES.has(table))) {
      response.end('event: session_expired\ndata: {}\n\n')
      return
    }
    const guestChatToken = isGuestChatToken(request.query.chat_token)
      ? request.query.chat_token
      : null
    const client: Client = { response, tables: new Set(requested), user, sessionHash: user ? hashToken(String(request.cookies.rc_session)) : null, guestChatToken, ip, disconnected: false }
    clients.add(client)
    clientsByIp.set(ip, (clientsByIp.get(ip) ?? 0) + 1)
    // Keep browser reconnects bounded when a reverse proxy or deploy closes
    // an idle SSE socket. EventSource otherwise retries every few seconds,
    // which can create a burst of duplicate connections during an outage.
    response.write(': connected\nretry: 5000\n\n')
    const keepalive = setInterval(() => {
      try {
        if (!response.write(': keepalive\n\n')) disconnect(client)
      } catch {
        disconnect(client)
      }
    }, 20_000)
    response.on('close', () => { clearInterval(keepalive); disconnect(client) })
    request.on('close', () => {
      clearInterval(keepalive)
      disconnect(client)
    })
    response.on('error', () => { clearInterval(keepalive); disconnect(client) })
  })
}
