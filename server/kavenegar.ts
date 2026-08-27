import { randomBytes, timingSafeEqual } from 'node:crypto'
import type { Request, Router } from 'express'
import multer from 'multer'
import { sql } from 'drizzle-orm'
import { db, userFromRequest, type AuthUser } from './db.js'
import { getAuthSettings } from './auth.js'

type Scalar = string | number | boolean
type Params = Record<string, Scalar | Scalar[] | null | undefined>
type KavenegarResponse = {
  return?: { status?: number; message?: string }
  entries?: unknown
  metadata?: unknown
  [key: string]: unknown
}

type ActionSpec = {
  path: string
  method?: 'GET' | 'POST' | 'DELETE'
  required?: string[]
  allowed: string[]
}

const actions: Record<string, ActionSpec> = {
  send: { path: 'sms/send', required: ['receptor', 'message'], allowed: ['receptor', 'message', 'sender', 'date', 'type', 'localid', 'hide', 'tag', 'policy', 'mediaid'] },
  sendArray: { path: 'sms/sendarray', required: ['receptor', 'sender', 'message'], allowed: ['receptor', 'sender', 'message', 'date', 'type', 'localmessageids', 'hide', 'tag', 'policy', 'mediaid'] },
  lookup: { path: 'verify/lookup', required: ['receptor', 'template', 'token'], allowed: ['receptor', 'template', 'token', 'token2', 'token3', 'token10', 'token20', 'type'] },
  status: { path: 'sms/status', required: ['messageid'], allowed: ['messageid'] },
  statusLocal: { path: 'sms/statuslocalmessageid', required: ['localid'], allowed: ['localid'] },
  statusByReceptor: { path: 'sms/statusbyreceptor', required: ['receptor', 'startdate'], allowed: ['receptor', 'startdate', 'enddate'] },
  select: { path: 'sms/select', required: ['messageid'], allowed: ['messageid'] },
  outbox: { path: 'sms/selectoutbox', required: ['startdate'], allowed: ['startdate', 'enddate', 'sender'] },
  latestOutbox: { path: 'sms/latestoutbox', allowed: ['pagesize', 'sender'] },
  cancel: { path: 'sms/cancel', required: ['messageid'], allowed: ['messageid'] },
  countOutbox: { path: 'sms/countoutbox', required: ['startdate'], allowed: ['startdate', 'enddate', 'status'] },
  inboxPaged: { path: 'sms/inboxpaged', required: ['linenumber', 'isread'], allowed: ['linenumber', 'isread', 'startdate', 'enddate', 'pagenumber'] },
  countInbox: { path: 'sms/countinbox', required: ['startdate'], allowed: ['startdate', 'enddate', 'linenumber', 'isread'] },
  unreadInbox: { path: 'sms/receive', required: ['linenumber', 'isread'], allowed: ['linenumber', 'isread'] },
  blockedList: { path: 'line/blocked/list', required: ['linenumber'], allowed: ['linenumber', 'blockreason', 'startdate', 'pagenumber'] },
  blockedAdd: { path: 'line/blocked/add', required: ['linenumber', 'receptor'], allowed: ['linenumber', 'receptor'] },
  blockedRemove: { path: 'line/blocked/remove', method: 'DELETE', required: ['linenumber', 'receptor'], allowed: ['linenumber', 'receptor'] },
  blockedExists: { path: 'line/blocked/exists', required: ['linenumber', 'receptor'], allowed: ['linenumber', 'receptor'] },
  accountInfo: { path: 'account/info', method: 'GET', allowed: [] },
  accountConfig: { path: 'account/config', method: 'GET', allowed: [] },
  updateAccountConfig: { path: 'account/config', allowed: ['apilogs', 'debugmode', 'defaultsender', 'mincreditalarm', 'resendfailed'] },
  voice: { path: 'call/maketts', required: ['receptor', 'message'], allowed: ['receptor', 'message', 'date', 'localid', 'repeat', 'tag'] },
  templateList: { path: 'verify/templatelist', method: 'GET', allowed: ['page', 'apiKey', 'localId'] },
  templateGet: { path: 'verify/gettemplate', method: 'GET', required: ['id'], allowed: ['id', 'apiKey', 'localId'] },
  templateClone: { path: 'verify/clonetemplate', required: ['newTemplateName'], allowed: ['sourceTemplateId', 'sourceTemplateName', 'newTemplateName', 'apiKey', 'localId'] },
  templateAdd: { path: 'verify/addtemplate', required: ['sourceType', 'sendMethod', 'name'], allowed: ['sourceType', 'sendMethod', 'fallBackMethod', 'primaryLineNumber', 'secondaryLineNumber', 'switchTTL', 'sourceUrl', 'sourceName', 'name', 'textMessage', 'voiceMessage', 'apiKey', 'localId'] },
  templateUpdate: { path: 'verify/updatetemplate', required: ['templateId', 'sourceType', 'sendMethod', 'name'], allowed: ['templateId', 'sourceType', 'sendMethod', 'fallBackMethod', 'primaryLineNumber', 'secondaryLineNumber', 'switchTTL', 'sourceUrl', 'sourceName', 'name', 'textMessage', 'voiceMessage', 'apiKey', 'localId'] },
  templateDelete: { path: 'verify/deletetemplate', method: 'DELETE', required: ['id'], allowed: ['id', 'apiKey', 'localId'] },
  mediaList: { path: 'media/list', method: 'GET', allowed: ['page', 'size'] },
  mediaGet: { path: 'media/get', method: 'GET', required: ['id'], allowed: ['id'] },
  mediaDelete: { path: 'media/delete', method: 'DELETE', required: ['id'], allowed: ['id'] },
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
  fileFilter: (_request, file, callback) => {
    callback(null, ['image/jpeg', 'image/gif', 'video/mp4'].includes(file.mimetype))
  },
})

export async function requireSuperAdminRequest(request: Request): Promise<AuthUser | null> {
  const user = await userFromRequest(request)
  if (!user) return null
  const result = await db.execute(sql`select role from public.profiles where id = ${user.id}::uuid limit 1`)
  return result.rows[0]?.role === 'super_admin' ? user : null
}

function normalizeValue(value: Params[string]): string | null {
  if (value == null || value === '') return null
  if (Array.isArray(value)) return JSON.stringify(value.map(String))
  return String(value)
}

function selectParams(spec: ActionSpec, input: Params): Record<string, string> {
  const selected: Record<string, string> = {}
  for (const key of spec.allowed) {
    const value = normalizeValue(input[key])
    if (value != null) selected[key] = value
  }
  for (const key of spec.required ?? []) {
    if (!selected[key]?.trim()) throw new Error(`missing_${key}`)
  }
  return selected
}

function listSize(value: Params[string]): number {
  if (Array.isArray(value)) return value.length
  return String(value ?? '').split(',').map((item) => item.trim()).filter(Boolean).length
}

function validateOperationInput(operation: string, input: Params): void {
  if (operation === 'send' && listSize(input.receptor) > 200) throw new Error('kavenegar_max_200_receptors')
  if (operation === 'sendArray') {
    const counts = [listSize(input.receptor), listSize(input.sender), listSize(input.message)]
    if (counts.some((count) => count > 200)) throw new Error('kavenegar_max_200_records')
    if (new Set(counts).size !== 1) throw new Error('kavenegar_array_lengths_must_match')
  }
  if (['status', 'select', 'cancel'].includes(operation) && listSize(input.messageid) > 500) throw new Error('kavenegar_max_500_message_ids')
  if (['blockedAdd', 'blockedExists'].includes(operation) && listSize(input.receptor) > 200) throw new Error('kavenegar_max_200_receptors')
  if (operation === 'blockedRemove' && listSize(input.receptor) > 50) throw new Error('kavenegar_max_50_receptors')
  const message = String(input.message ?? '')
  if (message.length > 4000) throw new Error('kavenegar_message_too_long')
  const tag = String(input.tag ?? '')
  if (tag && (tag.length > 200 || !/^[A-Za-z0-9_-]+$/.test(tag))) throw new Error('kavenegar_invalid_tag')
  if (['templateAdd', 'templateUpdate'].includes(operation)) {
    const name = String(input.name ?? '')
    if (!/^[A-Za-z0-9-]+$/.test(name)) throw new Error('kavenegar_invalid_template_name')
    const fallback = Number(input.fallBackMethod ?? 3)
    const ttl = Number(input.switchTTL ?? 0)
    if (fallback !== 3 && (ttl < 1 || ttl > 5)) throw new Error('kavenegar_invalid_switch_ttl')
  }
}

function maskPhone(value: string): string {
  return value.replace(/(\d{4})\d+(\d{3})/g, '$1***$2')
}

function auditPayload(params: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(params).map(([key, value]) => {
    if (/^token(?:2|3|10|20)?$/i.test(key)) return [key, '***']
    if (/receptor|sender|linenumber/i.test(key)) return [key, maskPhone(value)]
    return [key, value.length > 1000 ? `${value.slice(0, 1000)}…` : value]
  }))
}

function extractMessageIds(body: KavenegarResponse): string[] {
  const entries = Array.isArray(body.entries) ? body.entries : body.entries ? [body.entries] : []
  return entries.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const id = (entry as Record<string, unknown>).messageid
    return id == null ? [] : [String(id)]
  })
}

async function providerSettings() {
  const settings = await getAuthSettings(true)
  const apiKey = settings.kavenegar_api_key || process.env.KAVENEGAR_API_KEY || ''
  if (!apiKey) throw new Error('kavenegar_api_key_missing')
  return {
    apiKey,
    sender: (settings as Record<string, unknown>).kavenegar_sender as string | undefined,
    type: (settings as Record<string, unknown>).kavenegar_default_type as number | undefined,
    tag: (settings as Record<string, unknown>).kavenegar_default_tag as string | undefined,
    policy: (settings as Record<string, unknown>).kavenegar_default_policy as string | undefined,
    webhookSecret: (settings as Record<string, unknown>).kavenegar_webhook_secret as string | undefined,
  }
}

async function rawRequest(path: string, method: 'GET' | 'POST' | 'DELETE', params: Record<string, string>, file?: Express.Multer.File): Promise<KavenegarResponse> {
  const { apiKey } = await providerSettings()
  const base = `https://api.kavenegar.com/v1/${encodeURIComponent(apiKey)}/${path}.json`
  let url = base
  let body: BodyInit | undefined
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (file) {
    const form = new FormData()
    form.append('File', new Blob([Uint8Array.from(file.buffer)], { type: file.mimetype }), file.originalname)
    body = form
  } else if (method === 'GET' || method === 'DELETE') {
    const query = new URLSearchParams(params)
    if (query.size) url += `?${query.toString()}`
  } else {
    headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8'
    body = new URLSearchParams(params)
  }
  const providerResponse = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(30_000) })
  const result = await providerResponse.json().catch(() => ({ return: { status: providerResponse.status, message: 'invalid_provider_response' } })) as KavenegarResponse
  const providerStatus = Number(result.return?.status ?? providerResponse.status)
  if (!providerResponse.ok || providerStatus !== 200) {
    const error = new Error(result.return?.message || `kavenegar_${providerStatus}`) as Error & { providerBody?: KavenegarResponse }
    error.providerBody = result
    throw error
  }
  return result
}

let balanceCache: { value: number; fetchedAt: number } | null = null

function extractBalance(result: KavenegarResponse): number {
  const entry = Array.isArray(result.entries) ? result.entries[0] : result.entries
  if (!entry || typeof entry !== 'object') return 0
  const record = entry as Record<string, unknown>
  return Number(record.remaincredit ?? record.credit ?? record.balance ?? 0) || 0
}

async function invoke(actorId: string | null, operation: string, params: Record<string, string>, file?: Express.Multer.File) {
  const spec = actions[operation]
  if (!spec && operation !== 'mediaUpload') throw new Error('unsupported_kavenegar_operation')
  const safePayload = auditPayload(params)
  const inserted = await db.execute(sql`
    insert into public.kavenegar_operations (actor_id, operation, request_payload)
    values (${actorId}::uuid, ${operation}, ${JSON.stringify(safePayload)}::jsonb)
    returning id
  `)
  const id = String(inserted.rows[0]?.id)
  try {
    const result = await rawRequest(spec?.path ?? 'media/upload', spec?.method ?? 'POST', params, file)
    const providerStatus = Number(result.return?.status ?? 200)
    const providerMessage = String(result.return?.message ?? '')
    const messageIds = extractMessageIds(result)
    await db.execute(sql`
      update public.kavenegar_operations set
        status = 'success', response_payload = ${JSON.stringify(result)}::jsonb,
        provider_status = ${providerStatus}, provider_message = ${providerMessage},
        message_ids = array(select jsonb_array_elements_text(${JSON.stringify(messageIds)}::jsonb)), completed_at = now()
      where id = ${id}::uuid
    `)
    return { ...result, operationId: id }
  } catch (error) {
    const providerBody = (error as Error & { providerBody?: KavenegarResponse }).providerBody
    await db.execute(sql`
      update public.kavenegar_operations set
        status = 'failed', response_payload = ${providerBody ? JSON.stringify(providerBody) : null}::jsonb,
        provider_status = ${providerBody?.return?.status ?? null},
        provider_message = ${providerBody?.return?.message ?? null},
        error_message = ${error instanceof Error ? error.message : String(error)}, completed_at = now()
      where id = ${id}::uuid
    `)
    throw error
  }
}

export async function sendKavenegarLookup(params: {
  receptor: string
  template: string
  token: string
  token2?: string
  token3?: string
  token10?: string
  token20?: string
  type?: string
}): Promise<KavenegarResponse> {
  return invoke(null, 'lookup', selectParams(actions.lookup!, params))
}

export async function sendKavenegarText(params: {
  receptor: string
  message: string
  sender?: string
}): Promise<KavenegarResponse> {
  const defaults = await providerSettings()
  return invoke(null, 'send', selectParams(actions.send!, {
    receptor: params.receptor,
    message: params.message,
    sender: params.sender || defaults.sender,
    type: defaults.type ?? 1,
  }))
}

function safeSecretEqual(expected: string, received: string): boolean {
  const a = Buffer.from(expected)
  const b = Buffer.from(received)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function registerKavenegarRoutes(router: Router): void {
  router.get('/kavenegar/balance', async (request, response) => {
    const user = await requireSuperAdminRequest(request)
    if (!user) return void response.status(403).json({ error: 'forbidden' })
    try {
      if (!balanceCache || Date.now() - balanceCache.fetchedAt > 60_000) {
        const result = await rawRequest(actions.accountInfo!.path, 'GET', {})
        balanceCache = { value: extractBalance(result), fetchedAt: Date.now() }
      }
      response.json({ balance: balanceCache.value, fetched_at: new Date(balanceCache.fetchedAt).toISOString() })
    } catch (error) {
      response.status(400).json({ error: error instanceof Error ? error.message : String(error) })
    }
  })

  router.get('/kavenegar/overview', async (request, response) => {
    const user = await requireSuperAdminRequest(request)
    if (!user) return void response.status(403).json({ error: 'forbidden' })
    const settings = await providerSettings().catch(() => null)
    const logs = await db.execute(sql`select * from public.kavenegar_operations order by created_at desc limit 100`)
    response.json({ configured: Boolean(settings), sender: settings?.sender ?? null, logs: logs.rows })
  })

  router.post('/kavenegar/webhook-secret', async (request, response) => {
    const user = await requireSuperAdminRequest(request)
    if (!user) return void response.status(403).json({ error: 'forbidden' })
    const secret = randomBytes(24).toString('base64url')
    await db.execute(sql`update public.auth_settings set kavenegar_webhook_secret = ${secret}, updated_at = now() where id = 1`)
    response.json({ secret })
  })

  router.post('/kavenegar/action', async (request, response) => {
    const user = await requireSuperAdminRequest(request)
    if (!user) return void response.status(403).json({ error: 'forbidden' })
    const operation = String(request.body?.operation ?? '')
    const spec = actions[operation]
    if (!spec) return void response.status(400).json({ error: 'unsupported_kavenegar_operation' })
    try {
      const defaults = await providerSettings()
      const input = { ...(request.body?.params ?? {}) } as Params
      if (operation === 'send') {
        input.sender ||= defaults.sender
        input.type ??= defaults.type ?? 1
        input.tag ||= defaults.tag
        input.policy ||= defaults.policy
      }
      validateOperationInput(operation, input)
      const params = selectParams(spec, input)
      response.json(await invoke(user.id, operation, params))
    } catch (error) {
      response.status(400).json({ error: error instanceof Error ? error.message : String(error) })
    }
  })

  router.post('/kavenegar/media/upload', upload.single('file'), async (request, response) => {
    const user = await requireSuperAdminRequest(request)
    if (!user) return void response.status(403).json({ error: 'forbidden' })
    if (!request.file) return void response.status(400).json({ error: 'media_file_required' })
    try {
      response.json(await invoke(user.id, 'mediaUpload', { filename: request.file.originalname }, request.file))
    } catch (error) {
      response.status(400).json({ error: error instanceof Error ? error.message : String(error) })
    }
  })

  router.all('/kavenegar/webhook/:secret', async (request, response) => {
    const settings = await providerSettings().catch(() => null)
    const receivedSecret = String(request.params.secret ?? '')
    if (!settings?.webhookSecret || !safeSecretEqual(settings.webhookSecret, receivedSecret)) {
      return void response.status(403).json({ error: 'invalid_webhook_secret' })
    }
    const payload = { ...request.query, ...(request.body ?? {}) } as Record<string, unknown>
    const messageId = payload.messageid == null ? null : String(payload.messageid)
    const providerStatus = payload.status == null ? null : Number(payload.status)
    if (messageId) {
      await db.execute(sql`
        update public.kavenegar_operations set provider_status = coalesce(${providerStatus}, provider_status),
          provider_message = coalesce(${String(payload.statustext ?? '') || null}, provider_message),
          response_payload = coalesce(response_payload, '{}'::jsonb) || ${JSON.stringify({ webhook: payload })}::jsonb
        where ${messageId} = any(message_ids)
      `)
    }
    await db.execute(sql`
      insert into public.kavenegar_operations (operation, request_payload, response_payload, provider_status, provider_message, message_ids, status, completed_at)
      values ('webhook', '{}'::jsonb, ${JSON.stringify(payload)}::jsonb, ${providerStatus}, ${String(payload.statustext ?? '') || null}, array(select jsonb_array_elements_text(${JSON.stringify(messageId ? [messageId] : [])}::jsonb)), 'webhook', now())
    `)
    response.json({ ok: true })
  })
}
