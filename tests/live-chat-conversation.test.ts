import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { isGuestChatToken } from '../server/chat-token.ts'
import { mergeChatMessages, mergeChatSessions } from '../src/features/live-chat/messages.ts'
import { ChatTranscript, MessageReceipt, ChatComposer } from '../src/components/live-chat/ChatConversation.tsx'
import type { LiveChatMessage, LiveChatSession } from '../src/features/live-chat/api.ts'

const message: LiveChatMessage = { id: 'm1', session_id: 's1', sender_kind: 'guest', sender_id: null, sender_name: 'بازدیدکننده', body: '<script>private</script>', created_at: '2026-10-22T10:00:00Z', read_at: null }
const session: LiveChatSession = { id: 's1', guest_name: 'Guest', guest_phone: '09123456789', status: 'open', assigned_to: null, last_message_at: message.created_at, created_at: message.created_at }

test('realtime token validation supports issued 64-character tokens and legacy UUIDs only', () => {
  assert.equal(isGuestChatToken('a'.repeat(64)), true)
  assert.equal(isGuestChatToken('94f4b029-d005-4964-92bf-94813ec5a355'), true)
  for (const input of ['a'.repeat(36), 'a'.repeat(65), '<script>', null, ['a'.repeat(64)]]) assert.equal(isGuestChatToken(input), false)
})

test('late HTTP responses do not erase read receipts or duplicate messages', () => {
  const read = { ...message, read_at: '2026-10-22T10:01:00Z' }
  const rows = mergeChatMessages([read], [message])
  assert.equal(rows.length, 1)
  assert.equal(rows[0]?.read_at, read.read_at)
  assert.equal(mergeChatMessages([message], [read])[0]?.read_at, read.read_at)
})

test('late session refreshes cannot reopen ended conversations or reverse their activity time', () => {
  const closed = { ...session, status: 'closed' as const, last_message_at: '2026-10-22T10:05:00Z' }
  const [merged] = mergeChatSessions([closed], [session])
  assert.equal(merged?.status, 'closed')
  assert.equal(merged?.last_message_at, closed.last_message_at)
})

test('receipts show one check for confirmed sends and two checks with readable text after reading', () => {
  const sent = renderToStaticMarkup(createElement(MessageReceipt, { read: false, language: 'fa' }))
  const read = renderToStaticMarkup(createElement(MessageReceipt, { read: true, language: 'fa' }))
  assert.equal((sent.match(/<path/g) ?? []).length, 1)
  assert.equal((read.match(/<path/g) ?? []).length, 2)
  assert.match(read, /خوانده شد/)
  assert.match(sent, /ارسال شد/)
})

test('transcript shows sender identities, time, safely escaped content and only incoming read candidates', () => {
  const agent = { ...message, id: 'm2', sender_kind: 'agent' as const, sender_name: 'اپراتور اول', body: 'پاسخ پشتیبانی' }
  const markup = renderToStaticMarkup(createElement(ChatTranscript, { messages: [message, agent], viewer: 'guest', guestName: 'Guest', language: 'fa', onRead: async () => {} }))
  assert.match(markup, /بازدیدکننده/)
  assert.match(markup, /اپراتور اول/)
  assert.match(markup, /<time/)
  assert.match(markup, /&lt;script&gt;/)
  assert.doesNotMatch(markup, /<script>/)
  assert.match(markup, /data-message-id="m1" data-unread="false"/)
  assert.match(markup, /data-message-id="m2" data-unread="true"/)
})

test('composer has a labelled bounded multiline input and prevents duplicate sends while busy', () => {
  const markup = renderToStaticMarkup(createElement(ChatComposer, { value: 'Hello', onChange: () => {}, onSubmit: () => {}, busy: true, language: 'en' }))
  assert.match(markup, /textarea/)
  assert.match(markup, /maxLength="5000"/)
  assert.match(markup, /aria-label="Send message"/)
  assert.match(markup, /disabled/)
})

test('receipt and closing RPCs authorize the correct session and serialize closing with replies', () => {
  const sql = readFileSync(new URL('../db/migrations/10008_chat_receipts_and_participants.sql', import.meta.url), 'utf8')
  assert.match(sql, /id=p_session_id and session_token=p_token/)
  assert.match(sql, /session_id=p_session_id and sender_kind=v_kind and read_at is null/)
  assert.match(sql, /v_kind := 'agent'/)
  assert.match(sql, /v_kind := 'guest'/)
  assert.match(sql, /jsonb_array_length\(p_message_ids\)>500/)
  assert.match(sql, /has_panel_permission\('chat'\)/)
  assert.match(sql, /session_token=p_token for update/)
  assert.match(sql, /where id=p_session_id for update/)
  assert.match(sql, /v_session.status<>'open'/)
  assert.match(sql, /new.read_at := null/)
  assert.doesNotMatch(sql, /delete from public.live_chat/)
})
