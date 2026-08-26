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

export async function replyLiveChatAgent(sessionId: string, body: string): Promise<LiveChatMessage> {
  const { data, error } = await backend.rpc('reply_live_chat_agent', {
    p_session_id: sessionId,
    p_body: body,
  })
  if (error) throw new Error(error.message)
  return data as LiveChatMessage
}

export async function closeLiveChatSession(sessionId: string): Promise<void> {
  const { error } = await backend.rpc('close_live_chat_session', { p_session_id: sessionId })
  if (error) throw new Error(error.message)
}
