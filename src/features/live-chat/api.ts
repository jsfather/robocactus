import { backend } from '@/lib/backend'

export type LiveChatSession = {
  id: string
  guest_name: string
  guest_phone: string
  session_token?: string
  status: 'open' | 'closed'
  assigned_to: string | null
  last_message_at: string
  created_at: string
}

export type LiveChatMessage = {
  attachment_id?: string | null
  attachment_name?: string | null
  attachment_mime?: string | null
  attachment_size?: number | null
  edited_at?: string | null
  deleted_at?: string | null
  updated_at?: string
  read_at?: string | null
  sender_name?: string | null
  sender_avatar_url?: string | null
  id: string
  session_id: string
  sender_kind: 'guest' | 'agent' | 'system'
  sender_id: string | null
  body: string
  created_at: string
}

const TOKEN_KEY = 'rc-live-chat-token'

export function loadChatToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function saveChatToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearChatToken() {
  localStorage.removeItem(TOKEN_KEY)
}

export async function startLiveChat(input: {
  name: string
  phone: string
  locale?: string
  captchaToken?: string
}): Promise<{
  session_id: string
  session_token: string
  mode: string
  guest_name: string
  guest_phone: string
}> {
  const response = await fetch('/api/forms/live-chat/start', {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: input.name, phone: input.phone, locale: input.locale ?? 'fa', captchaToken: input.captchaToken }),
  })
  const row = await response.json().catch(() => ({})) as Record<string, string>
  if (!response.ok) throw new Error(row.error ?? `HTTP ${response.status}`)
  saveChatToken(row.session_token)
  return {
    session_id: row.session_id,
    session_token: row.session_token,
    mode: row.mode,
    guest_name: row.guest_name,
    guest_phone: row.guest_phone,
  }
}

export async function sendGuestMessage(token: string, body: string): Promise<LiveChatMessage> {
  const { data, error } = await backend.rpc('send_live_chat_guest_message', {
    p_token: token,
    p_body: body,
  })
  if (error) throw new Error(error.message)
  return data as LiveChatMessage
}

export async function fetchGuestMessages(token: string): Promise<LiveChatMessage[]> {
  const { data, error } = await backend.rpc('fetch_live_chat_guest_messages', {
    p_token: token,
  })
  if (error) throw new Error(error.message)
  return (data ?? []) as LiveChatMessage[]
}

export async function fetchStaffChatSessions(): Promise<LiveChatSession[]> {
  const { data, error } = await backend
    .from('live_chat_sessions')
    .select('*')
    .order('last_message_at', { ascending: false })
    .limit(100)
  if (error) throw new Error(error.message)
  return (data ?? []) as LiveChatSession[]
}

export async function fetchStaffChatMessages(sessionId: string): Promise<LiveChatMessage[]> {
  const { data, error } = await backend
    .from('live_chat_messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as LiveChatMessage[]
}

export async function replyLiveChatAgent(sessionId: string, body: string, file?: File): Promise<LiveChatMessage> {
  return sendChatMessage(sessionId, body, file)
}

export async function closeLiveChatSession(sessionId: string): Promise<void> {
  const { error } = await backend.rpc('close_live_chat_session', { p_session_id: sessionId })
  if (error) throw new Error(error.message)
}

export async function getGuestChatSession(token: string): Promise<LiveChatSession> {
  const { data, error } = await backend.rpc('get_live_chat_guest_session', { p_token: token })
  if (error) throw new Error(error.message)
  return data as LiveChatSession
}

export async function closeGuestChatSession(token: string): Promise<void> {
  const { error } = await backend.rpc('close_live_chat_guest_session', { p_token: token })
  if (error) throw new Error(error.message)
}

export async function markChatMessagesRead(sessionId: string, messageIds: string[], token?: string): Promise<LiveChatMessage[]> {
  if (!messageIds.length) return []
  return chatRequest<LiveChatMessage[]>(`/sessions/${sessionId}/read`, { method: 'POST', body: JSON.stringify({ messageIds: messageIds.slice(0, 500) }), headers: { 'Content-Type': 'application/json' } }, token)
}

async function chatRequest<T>(path: string, init: RequestInit, token?: string): Promise<T> {
  const response = await fetch(`/api/chat${path}`, { ...init, credentials: 'include', headers: { ...init.headers, ...(token ? { 'X-Chat-Token': token } : {}) } })
  const result = await response.json().catch(() => ({})) as { data: T; error?: string }
  if (!response.ok) throw new Error(result.error || 'chat_request_failed')
  return result.data
}

export async function sendChatMessage(sessionId: string, body: string, file?: File, token?: string): Promise<LiveChatMessage> {
  const form = new FormData()
  form.append('body', body)
  if (file) form.append('file', file)
  return chatRequest<LiveChatMessage>(`/sessions/${sessionId}/messages`, { method: 'POST', body: form }, token)
}

export async function moderateChatMessage(message: LiveChatMessage, action: 'edit' | 'delete', body?: string): Promise<LiveChatMessage> {
  return chatRequest(`/sessions/${message.session_id}/messages/${message.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, body }) })
}
