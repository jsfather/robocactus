import type { LiveChatMessage, LiveChatSession } from './api'

export function mergeChatSessions(current: LiveChatSession[], incoming: LiveChatSession[]): LiveChatSession[] {
  const rows = new Map(current.map((session) => [session.id, session]))
  for (const session of incoming) {
    const previous = rows.get(session.id)
    rows.set(session.id, { ...previous, ...session, status: previous?.status === 'closed' ? 'closed' : session.status, last_message_at: previous && previous.last_message_at > session.last_message_at ? previous.last_message_at : session.last_message_at })
  }
  return [...rows.values()].sort((a, b) => b.last_message_at.localeCompare(a.last_message_at))
}

/** Realtime UPDATEs and HTTP INSERT responses may arrive in either order. */
export function mergeChatMessages(current: LiveChatMessage[], incoming: LiveChatMessage[]): LiveChatMessage[] {
  const rows = new Map(current.map((message) => [message.id, message]))
  for (const message of incoming) {
    const previous = rows.get(message.id)
    rows.set(message.id, { ...previous, ...message, read_at: previous?.read_at || message.read_at || null })
  }
  return [...rows.values()].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
}
