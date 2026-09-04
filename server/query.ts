import type { Request, Response, Router } from 'express'
import { sql, type SQL } from 'drizzle-orm'
import { db, userFromRequest, withRequestRole, type Transaction } from './db.js'
import { config } from './config.js'
import { getAuthSettings } from './auth.js'
import { protectSecret, SECRET_SETTING_FIELDS } from './secrets.js'

type Filter = {
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'ilike' | 'in' | 'is' | 'not' | 'contains'
  column: string
  value: unknown
  comparison?: string
}
type QuerySpec = {
  table: string
  action: 'select' | 'insert' | 'update' | 'upsert' | 'delete'
  values?: Record<string, unknown> | Array<Record<string, unknown>>
  select?: string
  filters?: Filter[]
  orders?: Array<{ column: string; ascending: boolean; nullsFirst?: boolean }>
  limit?: number
  range?: [number, number]
  single?: 'single' | 'maybeSingle'
  count?: 'exact'
  head?: boolean
}

const TABLES = new Set([
  'account_issues', 'announcements', 'blog_posts', 'content_categories', 'captain_invites',
  'companies', 'company_achievements', 'company_members', 'contact_messages', 'documents',
  'gallery_categories', 'gallery_items', 'home_banners', 'home_events', 'home_faqs',
  'home_partners', 'home_sponsors', 'home_stat_cards', 'home_why_cards', 'invoice_finance_view', 'finance_deposit_view',
  'invoices', 'league_admins', 'league_faqs', 'league_files', 'league_past_results',
  'league_people', 'league_sponsors', 'leagues', 'live_chat_messages', 'live_chat_sessions',
  'notification_log', 'profile_documents', 'profiles', 'public_companies', 'registration_doc_types',
  'participant_field_rules', 'judge_scores', 'judge_submission_progress', 'registration_reminder_settings', 'role_section_permissions',
  'public_team_people',
  'results', 'site_settings', 'sms_settings', 'auth_settings', 'public_auth_options', 'static_pages', 'system_notification_reads',
  'system_notifications', 'team_members', 'teams', 'ticket_departments', 'ticket_messages',
  'ticket_reads', 'tickets', 'league_attendance_settings', 'team_attendance_clearances', 'team_technical_files',
])

const RPCS = new Set([
  'activate_user_account', 'admin_update_profile', 'admin_update_invoice', 'admin_archive_invoice', 'admin_delete_invoice', 'admin_delete_team', 'analytics_export_teams', 'analytics_snapshot',
  'apply_payment_result', 'close_live_chat_session', 'count_unread_tickets', 'create_company',
  'create_invoice_for_team', 'create_ticket', 'create_ticket_with_department', 'enqueue_broadcast_sms', 'enqueue_incomplete_profile_sms',
  'fetch_live_chat_guest_messages', 'home_stats', 'issue_mock_payment_authority',
  'league_registered_count', 'list_unread_ticket_ids', 'mark_ticket_read', 'profile_exists_by_phone', 'team_name_available',
  'refer_ticket', 'reply_live_chat_agent', 'reply_ticket', 'resolve_account_issue',
  'resolve_team_captain', 'respond_account_issue', 'review_team', 'review_team_member', 'review_user_account',
  'send_live_chat_guest_message', 'set_league_results_status',
  'submit_card_receipt', 'review_card_receipt', 'ticket_status_counts', 'upsert_team_result',
  'save_judge_score', 'publish_official_team_result', 'accept_invoice_terms',
  'get_or_create_team_attendance', 'upsert_team_technical_file', 'submit_team_technical_files',
  'review_team_technical_files', 'accept_team_attendance_rules',
  'submit_team_member_correction',
])

const CONFLICT_COLUMNS: Record<string, string[]> = {
  league_admins: ['league_id', 'user_id'],
  static_pages: ['slug'],
  system_notification_reads: ['notification_id', 'user_id'],
  role_section_permissions: ['role_key', 'section_key'],
  league_attendance_settings: ['league_id'],
}
const SECRET_COLUMNS = new Set<string>(SECRET_SETTING_FIELDS)
const CONFIGURED_SECRET = '__configured__'

function redactSecrets(table: string, rows: Record<string, unknown>[]): Record<string, unknown>[] {
  if (table !== 'auth_settings') return rows
  return rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, SECRET_COLUMNS.has(key) ? (value ? (key === 'kavenegar_webhook_secret' ? null : CONFIGURED_SECRET) : null) : value])))
}

const RELATIONS: Record<string, Record<string, { table: string; local: string; foreign: string }>> = {
  results: {
    teams: { table: 'teams', local: 'team_id', foreign: 'id' },
    companies: { table: 'companies', local: 'company_id', foreign: 'id' },
    leagues: { table: 'leagues', local: 'league_id', foreign: 'id' },
  },
}

function identifier(name: string): ReturnType<typeof sql.identifier> {
  if (!/^[a-z_][a-z0-9_]*$/i.test(name)) throw new Error(`invalid_identifier:${name}`)
  return sql.identifier(name)
}

function splitTopLevel(input: string): string[] {
  const result: string[] = []
  let depth = 0
  let start = 0
  for (let index = 0; index < input.length; index += 1) {
    if (input[index] === '(') depth += 1
    if (input[index] === ')') depth -= 1
    if (input[index] === ',' && depth === 0) {
      result.push(input.slice(start, index).trim())
      start = index + 1
    }
  }
  result.push(input.slice(start).trim())
  return result.filter(Boolean)
}

function selection(table: string, input = '*'): SQL {
  const parts = splitTopLevel(input.replace(/\s+/g, ' ').trim())
  const fields: SQL[] = []
  for (const part of parts) {
    if (part === '*') {
      fields.push(sql.raw('base.*'))
      continue
    }
    const nested = part.match(/^([a-z_][a-z0-9_]*)\s*\((.*)\)$/i)
    if (!nested) {
      fields.push(sql`base.${identifier(part)}`)
      continue
    }
    const relationName = nested[1]!
    const relation = RELATIONS[table]?.[relationName]
    if (!relation) throw new Error(`unsupported_relation:${table}.${relationName}`)
    const nestedColumns = splitTopLevel(nested[2]!).map((column) => {
      identifier(column)
      return sql`${sql.raw(`'${column}'`)}, related.${identifier(column)}`
    })
    fields.push(sql`(
      select jsonb_build_object(${sql.join(nestedColumns, sql`, `)})
      from public.${identifier(relation.table)} related
      where related.${identifier(relation.foreign)} = base.${identifier(relation.local)}
      limit 1
    ) as ${identifier(relationName)}`)
  }
  return sql.join(fields, sql`, `)
}

function whereClause(filters: Filter[] = [], prefix?: string): SQL {
  if (!filters.length) return sql``
  const expressions = filters.map((filter) => {
    const column = prefix ? sql`${identifier(prefix)}.${identifier(filter.column)}` : identifier(filter.column)
    switch (filter.operator) {
      case 'eq': return sql`${column} = ${filter.value}`
      case 'neq': return sql`${column} <> ${filter.value}`
      case 'gt': return sql`${column} > ${filter.value}`
      case 'gte': return sql`${column} >= ${filter.value}`
      case 'lt': return sql`${column} < ${filter.value}`
      case 'lte': return sql`${column} <= ${filter.value}`
      case 'like': return sql`${column} like ${filter.value}`
      case 'ilike': return sql`${column} ilike ${filter.value}`
      case 'in': {
        const values = Array.isArray(filter.value) ? filter.value : []
        return values.length ? sql`${column} in (${sql.join(values.map((value) => sql`${value}`), sql`, `)})` : sql`false`
      }
      case 'is': {
        if (filter.value === null) return sql`${column} is null`
        if (filter.value === true) return sql`${column} is true`
        if (filter.value === false) return sql`${column} is false`
        return sql`${column} is not distinct from ${filter.value}`
      }
      case 'not': {
        if (filter.comparison === 'is' && filter.value === null) return sql`${column} is not null`
        if (filter.comparison === 'in' && Array.isArray(filter.value)) {
          return sql`${column} not in (${sql.join(filter.value.map((value) => sql`${value}`), sql`, `)})`
        }
        return sql`not (${column} = ${filter.value})`
      }
      case 'contains': return sql`${column} @> ${JSON.stringify(filter.value)}::jsonb`
    }
  })
  return sql` where ${sql.join(expressions, sql` and `)}`
}

function returningClause(select: string | undefined): SQL {
  if (!select) return sql``
  const columns = splitTopLevel(select)
  if (columns.includes('*')) return sql` returning *`
  return sql` returning ${sql.join(columns.map(identifier), sql`, `)}`
}

async function executeQuery(transaction: Transaction, spec: QuerySpec) {
  if (!TABLES.has(spec.table)) throw new Error('table_not_allowed')
  const sectionByTable: Record<string, string> = {
    invoice_finance_view: 'finance', finance_deposit_view: 'finance', finance_transactions: 'finance',
    live_chat_messages: 'chat', live_chat_sessions: 'chat',
    ticket_departments: 'tickets', ticket_messages: 'tickets', ticket_reads: 'tickets', tickets: 'tickets',
  }
  if (sectionByTable[spec.table]) await enforceCollaboratorPermission(transaction, sectionByTable[spec.table]!)
  const table = sql`public.${identifier(spec.table)}`

  if (spec.action === 'select') {
    const where = whereClause(spec.filters, 'base')
    if (spec.count === 'exact' && spec.head) {
      const counted = await transaction.execute(sql`select count(*)::int as count from ${table} base${where}`)
      return { data: null, count: Number(counted.rows[0]?.count ?? 0) }
    }
    const orders = spec.orders?.length
      ? sql` order by ${sql.join(spec.orders.map((order) => sql`base.${identifier(order.column)} ${sql.raw(order.ascending ? 'asc' : 'desc')} ${order.nullsFirst == null ? sql`` : sql.raw(order.nullsFirst ? 'nulls first' : 'nulls last')}`), sql`, `)}`
      : sql``
    const range = spec.range
    const requestedLimit = range ? range[1] - range[0] + 1 : spec.limit
    const limitValue = requestedLimit == null ? 200 : Math.min(500, Math.max(0, requestedLimit))
    const limit = sql` limit ${limitValue}`
    const offset = range ? sql` offset ${Math.max(0, range[0])}` : sql``
    const result = await transaction.execute(
      sql`select ${selection(spec.table, spec.select)} from ${table} base${where}${orders}${limit}${offset}`,
    )
    const safeRows = redactSecrets(spec.table, result.rows as Record<string, unknown>[])
    let data: unknown = safeRows
    if (spec.single === 'single') {
      if (result.rows.length !== 1) throw new Error(`single_row_expected:${result.rows.length}`)
      data = safeRows[0]
    } else if (spec.single === 'maybeSingle') {
      if (result.rows.length > 1) throw new Error(`single_row_expected:${result.rows.length}`)
      data = safeRows[0] ?? null
    }
    return { data, count: spec.count === 'exact' ? result.rows.length : null }
  }

  const inputRows = (Array.isArray(spec.values) ? spec.values : [spec.values ?? {}]).map((row) => {
    if (spec.table !== 'auth_settings') return row
    return Object.fromEntries(Object.entries(row)
      .filter(([key, value]) => !SECRET_COLUMNS.has(key) || (value !== CONFIGURED_SECRET && !(key === 'kavenegar_webhook_secret' && value == null)))
      .map(([key, value]) => [key, SECRET_COLUMNS.has(key) ? protectSecret(value) : value]))
  })
  const columns = Object.keys(inputRows[0] ?? {})
  if (!columns.length && spec.action !== 'delete') throw new Error('empty_values')
  columns.forEach((column) => identifier(column))
  const where = whereClause(spec.filters)
  let statement: SQL

  if (spec.action === 'insert' || spec.action === 'upsert') {
    const tuples = inputRows.map((row) => sql`(${sql.join(columns.map((column) => sql`${row[column]}`), sql`, `)})`)
    let conflict = sql``
    if (spec.action === 'upsert') {
      const target = CONFLICT_COLUMNS[spec.table]
      if (!target) throw new Error(`upsert_conflict_not_configured:${spec.table}`)
      const updated = columns.filter((column) => !target.includes(column))
      conflict = updated.length
        ? sql` on conflict (${sql.join(target.map(identifier), sql`, `)}) do update set ${sql.join(updated.map((column) => sql`${identifier(column)} = excluded.${identifier(column)}`), sql`, `)}`
        : sql` on conflict (${sql.join(target.map(identifier), sql`, `)}) do nothing`
    }
    statement = sql`insert into ${table} (${sql.join(columns.map(identifier), sql`, `)}) values ${sql.join(tuples, sql`, `)}${conflict}${returningClause(spec.select)}`
  } else if (spec.action === 'update') {
    if (!spec.filters?.length) throw new Error('mutation_filter_required')
    const row = inputRows[0]!
    statement = sql`update ${table} set ${sql.join(columns.map((column) => sql`${identifier(column)} = ${row[column]}`), sql`, `)}${where}${returningClause(spec.select)}`
  } else {
    if (!spec.filters?.length) throw new Error('mutation_filter_required')
    statement = sql`delete from ${table}${where}${returningClause(spec.select)}`
  }

  const result = await transaction.execute(statement)
  const safeRows = redactSecrets(spec.table, result.rows as Record<string, unknown>[])
  let data: unknown = spec.select ? safeRows : null
  if (spec.single === 'single') {
    if (result.rows.length !== 1) throw new Error(`single_row_expected:${result.rows.length}`)
    data = safeRows[0]
  } else if (spec.single === 'maybeSingle') {
    if (result.rows.length > 1) throw new Error(`single_row_expected:${result.rows.length}`)
    data = safeRows[0] ?? null
  }
  return { data, count: null }
}

async function executeRpc(transaction: Transaction, name: string, args: Record<string, unknown>) {
  if (!RPCS.has(name)) throw new Error('rpc_not_allowed')
  if (name === 'issue_mock_payment_authority' || name === 'apply_payment_result') {
    const provider = (await getAuthSettings()).payment_provider ?? 'mock'
    if (config.isProduction || provider !== 'mock') throw new Error('mock_payment_disabled')
  }
  const financeRpcs = new Set(['admin_update_invoice', 'admin_archive_invoice', 'admin_delete_invoice', 'review_card_receipt'])
  const ticketRpcs = new Set(['create_ticket_with_department', 'ticket_status_counts', 'list_unread_ticket_ids', 'mark_ticket_read', 'refer_ticket', 'reply_ticket'])
  const chatRpcs = new Set(['close_live_chat_session', 'reply_live_chat_agent'])
  const teamReviewRpcs = new Set(['review_team_member', 'review_team_technical_files', 'save_judge_score', 'publish_official_team_result', 'set_league_results_status'])
  if (financeRpcs.has(name)) await enforceCollaboratorPermission(transaction, 'finance')
  if (ticketRpcs.has(name)) await enforceCollaboratorPermission(transaction, 'tickets')
  if (chatRpcs.has(name)) await enforceCollaboratorPermission(transaction, 'chat')
  if (teamReviewRpcs.has(name)) await enforceCollaboratorPermission(transaction, 'team_review')
  if (name === 'review_team') await enforceTeamReviewPermission(transaction)
  const entries = Object.entries(args)
  const argumentsSql = sql.join(entries.map(([key, value]) => sql`${identifier(key)} => ${value}`), sql`, `)
  const metadata = await db.execute(sql`
    select p.proretset
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = ${name}
    order by p.oid desc limit 1
  `)
  const returnsSet = Boolean(metadata.rows[0]?.proretset)
  const result = await transaction.execute(sql`select to_jsonb(public.${identifier(name)}(${argumentsSql})) as result`)
  if (returnsSet) return result.rows.map((row: Record<string, unknown>) => row.result)
  return result.rows[0]?.result ?? null
}

async function enforceCollaboratorPermission(transaction: Transaction, section: string): Promise<void> {
  const result = await transaction.execute(sql`select public.current_user_role()::text as role, public.has_panel_permission(${section}) as allowed`)
  const row = result.rows[0] as { role?: string; allowed?: boolean } | undefined
  if ((row?.role === 'staff' || row?.role === 'league_admin') && !row.allowed) throw new Error('forbidden')
}

async function enforceTeamReviewPermission(transaction: Transaction): Promise<void> {
  const result = await transaction.execute(sql`
    select public.current_user_role()::text as role,
      public.has_panel_permission(
        case when public.current_user_role()::text = 'staff' then 'triage' else 'team_review' end
      ) as allowed
  `)
  const row = result.rows[0] as { role?: string; allowed?: boolean } | undefined
  if ((row?.role === 'staff' || row?.role === 'league_admin') && !row.allowed) throw new Error('forbidden')
}

function sendError(response: Response, error: unknown): void {
  const messages: string[] = []
  let current: unknown = error
  for (let depth=0; current && depth<4; depth+=1) {
    messages.push(current instanceof Error ? current.message : String(current))
    current = typeof current === 'object' && current !== null && 'cause' in current ? (current as { cause?: unknown }).cause : null
  }
  const message = messages.join(' ')
  const denied = /permission denied|row-level security|forbidden|not authenticated/i.test(message)
  const known = message.match(/\b(authentication_required|not_authenticated|forbidden|invalid_[a-z_]+|[a-z_]+_required|[a-z_]+_disabled|[a-z_]+_not_found|[a-z_]+_not_allowed|technical_submission_locked|technical_submission_not_pending|team_members_not_approved|team_dossier_incomplete(?::[a-z_,]+)?|too_many_attempts|cooldown|expired|already_used|single_row_expected(?::\d+)?)\b/i)?.[1]
  if (config.isProduction && !known && !denied) {
    console.error('[query] unexpected failure', error)
    response.status(500).json({ error: { message: 'internal_server_error' } })
    return
  }
  response.status(denied ? 403 : 400).json({ error: { message: denied ? 'forbidden' : (known ?? message) } })
}

export function registerQueryRoutes(router: Router): void {
  router.post('/query', async (request: Request, response) => {
    try {
      const user = await userFromRequest(request)
      const result = await withRequestRole(user, (transaction) => executeQuery(transaction, request.body as QuerySpec))
      response.json({ ...result, error: null })
    } catch (error) {
      sendError(response, error)
    }
  })

  router.post('/rpc/:name', async (request: Request, response) => {
    try {
      const user = await userFromRequest(request)
      const parameter = request.params.name
      const name = Array.isArray(parameter) ? parameter[0] ?? '' : parameter ?? ''
      const data = await withRequestRole(user, (transaction) =>
        executeRpc(transaction, name, (request.body ?? {}) as Record<string, unknown>),
      )
      response.json({ data, error: null })
    } catch (error) {
      sendError(response, error)
    }
  })
}
