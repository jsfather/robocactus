export type KavenegarOperation =
  | 'send' | 'sendArray' | 'lookup' | 'status' | 'statusLocal' | 'statusByReceptor'
  | 'select' | 'outbox' | 'latestOutbox' | 'cancel' | 'countOutbox'
  | 'inboxPaged' | 'countInbox' | 'unreadInbox'
  | 'blockedList' | 'blockedAdd' | 'blockedRemove' | 'blockedExists'
  | 'accountInfo' | 'accountConfig' | 'updateAccountConfig' | 'voice'
  | 'templateList' | 'templateGet' | 'templateClone' | 'templateAdd' | 'templateUpdate' | 'templateDelete'
  | 'mediaList' | 'mediaGet' | 'mediaDelete'

export type KavenegarLog = {
  id: string
  operation: string
  request_payload: Record<string, unknown>
  response_payload: Record<string, unknown> | null
  provider_status: number | null
  provider_message: string | null
  message_ids: string[]
  status: 'pending' | 'success' | 'failed' | 'webhook'
  error_message: string | null
  created_at: string
  completed_at: string | null
}

export type KavenegarResult = {
  return?: { status?: number; message?: string }
  entries?: unknown
  metadata?: unknown
  operationId?: string
  [key: string]: unknown
}

async function parseResponse(response: Response): Promise<KavenegarResult> {
  const body = await response.json().catch(() => ({})) as KavenegarResult & { error?: string }
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`)
  return body
}

export async function fetchKavenegarOverview(): Promise<{ configured: boolean; sender: string | null; logs: KavenegarLog[] }> {
  const response = await fetch('/api/kavenegar/overview', { credentials: 'include' })
  return parseResponse(response) as Promise<{ configured: boolean; sender: string | null; logs: KavenegarLog[] }>
}

export async function fetchKavenegarBalance(): Promise<number> {
  const response = await fetch('/api/kavenegar/balance', { credentials: 'include' })
  const body = await parseResponse(response) as { balance?: number }
  return Number(body.balance ?? 0)
}

export async function runKavenegarOperation(operation: KavenegarOperation, params: Record<string, unknown> = {}): Promise<KavenegarResult> {
  const response = await fetch('/api/kavenegar/action', {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operation, params }),
  })
  return parseResponse(response)
}

export async function uploadKavenegarMedia(file: File): Promise<KavenegarResult> {
  const data = new FormData()
  data.append('file', file)
  const response = await fetch('/api/kavenegar/media/upload', { method: 'POST', credentials: 'include', body: data })
  return parseResponse(response)
}

export async function rotateKavenegarWebhookSecret(): Promise<string> {
  const response = await fetch('/api/kavenegar/webhook-secret', { method: 'POST', credentials: 'include' })
  const body = await parseResponse(response) as { secret?: string }
  if (!body.secret) throw new Error('webhook_secret_failed')
  return body.secret
}
