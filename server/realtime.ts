import type { Response, Router } from 'express'
import { sql } from 'drizzle-orm'
import { db, userFromRequest, withRequestRole, type AuthUser } from './db.js'

type Client = { response: Response; tables: Set<string>; user: AuthUser | null; guestChatToken: string | null }
const clients = new Set<Client>()
let lastEventId = 0
let poller: NodeJS.Timeout | null = null

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
  if (!client.user && client.guestChatToken && tableName === 'live_chat_messages' && raw.session_id) {
    const visible = await db.execute(sql`
      select to_jsonb(m) as record from public.live_chat_messages m
      join public.live_chat_sessions s on s.id=m.session_id
      where m.id=${raw.id}::uuid and s.guest_token=${client.guestChatToken}
      limit 1
    `)
    return (visible.rows[0]?.record as Record<string, unknown> | undefined) ?? null
  }
  if (!client.user && client.guestChatToken && tableName === 'live_chat_sessions') {
    const visible = await db.execute(sql`
      select to_jsonb(s) as record from public.live_chat_sessions s
      where s.id=${raw.id}::uuid and s.guest_token=${client.guestChatToken}
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
      where row.${keyIdentifier} = ${String(primaryValue)}::uuid limit 1
    `)
    return (result.rows[0]?.record as Record<string, unknown> | undefined) ?? null
  }).catch(() => null)
}

async function poll(): Promise<void> {
  if (!clients.size) return
  const result = await db.execute(sql`
    select id, table_name, event, record, old_record
    from app_private.realtime_events where id > ${lastEventId}
    order by id asc limit 200
  `)
  for (const event of result.rows) {
    lastEventId = Math.max(lastEventId, Number(event.id))
    for (const client of clients) {
      if (!client.tables.has(String(event.table_name))) continue
      const record = await visibleRecord(client, event)
      if (record === null) continue
      client.response.write(`data: ${JSON.stringify({
        table: event.table_name,
        event: event.event,
        record,
        old_record: event.event === 'DELETE' ? {} : event.old_record,
      })}\n\n`)
    }
  }
}

export async function initializeRealtime(): Promise<void> {
  const current = await db.execute(sql`select coalesce(max(id), 0)::bigint as id from app_private.realtime_events`)
  lastEventId = Number(current.rows[0]?.id ?? 0)
  if (!poller) {
    poller = setInterval(() => void poll().catch((error) => console.error('[realtime]', error)), 1000)
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
    response.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    response.flushHeaders()
    const guestChatToken = typeof request.query.chat_token === 'string' && /^[0-9a-f-]{36}$/i.test(request.query.chat_token)
      ? request.query.chat_token
      : null
    const client: Client = { response, tables: new Set(requested), user: await userFromRequest(request), guestChatToken }
    clients.add(client)
    response.write(': connected\n\n')
    const keepalive = setInterval(() => response.write(': keepalive\n\n'), 20_000)
    request.on('close', () => {
      clearInterval(keepalive)
      clients.delete(client)
    })
  })
}
