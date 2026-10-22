import type { LiveChatMessage } from './api'

export async function fetchChatAttachment(message: LiveChatMessage, token?: string): Promise<Blob> {
  const response = await fetch(`/api/chat/sessions/${message.session_id}/messages/${message.id}/attachment`, { credentials: 'include', headers: token ? { 'X-Chat-Token': token } : {} })
  if (!response.ok) throw new Error('attachment_not_found')
  return response.blob()
}
