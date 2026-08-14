import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, FieldError, PanelCard } from '@/components/ui/FormControls'
import { PanelPage } from '@/components/layout/PanelShell'
import {
  closeLiveChatSession,
  fetchStaffChatMessages,
  fetchStaffChatSessions,
  replyLiveChatAgent,
  type LiveChatMessage,
  type LiveChatSession,
} from '@/features/live-chat/api'
import { supabase } from '@/lib/supabase'

export function LiveChatInboxPage() {
  const { t } = useTranslation()
  const [sessions, setSessions] = useState<LiveChatSession[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<LiveChatMessage[]>([])
  const [reply, setReply] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  const selected = sessions.find((s) => s.id === selectedId) ?? null

  const reload = useCallback(async () => {
    try {
      setSessions(await fetchStaffChatSessions())
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    }
  }, [t])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    if (!selectedId) {
      setMessages([])
      return
    }
    let cancelled = false
    void fetchStaffChatMessages(selectedId)
      .then((list) => {
        if (!cancelled) setMessages(list)
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })

    const channel = supabase
      .channel(`live-chat-${selectedId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'live_chat_messages',
          filter: `session_id=eq.${selectedId}`,
        },
        (payload) => {
          const row = payload.new as LiveChatMessage
          setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]))
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
    }
  }, [selectedId])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const onReply = async (e: FormEvent) => {
    e.preventDefault()
    if (!selectedId || !reply.trim()) return
    setBusy(true)
    setError(null)
    try {
      const msg = await replyLiveChatAgent(selectedId, reply.trim())
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]))
      setReply('')
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <PanelPage title={t('chat.inboxTitle')} description={t('chat.inboxHint')} index="CHAT">
      <FieldError message={error ?? undefined} />
      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <PanelCard title={t('chat.sessions')}>
          <ul className="max-h-[32rem] space-y-1 overflow-y-auto">
            {sessions.length === 0 ? (
              <li className="text-sm text-rc-muted">{t('chat.noSessions')}</li>
            ) : (
              sessions.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(s.id)}
                    className={`w-full px-3 py-2.5 text-start text-sm transition ${
                      selectedId === s.id ? 'bg-rc-blue/15 text-rc-blue' : 'hover:bg-rc-hover'
                    }`}
                  >
                    <span className="block font-medium">{s.guest_name}</span>
                    <span className="font-mono text-xs text-rc-muted" dir="ltr">
                      {s.guest_phone}
                    </span>
                    <span className="mt-1 block font-mono text-[10px] uppercase text-rc-muted">
                      {s.status}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </PanelCard>

        {selected ? (
          <div className="flex min-h-[28rem] flex-col border border-rc-line bg-rc-surface/80">
            <div className="flex items-center justify-between border-b border-rc-line px-4 py-3">
              <div>
                <p className="font-semibold">{selected.guest_name}</p>
                <p className="font-mono text-xs text-rc-muted" dir="ltr">
                  {selected.guest_phone}
                </p>
              </div>
              {selected.status === 'open' ? (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() =>
                    void closeLiveChatSession(selected.id)
                      .then(reload)
                      .then(() => setSelectedId(null))
                  }
                >
                  {t('chat.close')}
                </Button>
              ) : null}
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto bg-rc-bg/30 p-4">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={[
                    'max-w-[85%] px-3 py-2 text-sm',
                    m.sender_kind === 'agent'
                      ? 'ms-auto bg-rc-blue/20'
                      : m.sender_kind === 'system'
                        ? 'mx-auto border border-rc-line text-center text-xs text-rc-muted'
                        : 'me-auto bg-white/5',
                  ].join(' ')}
                >
                  <p className="whitespace-pre-wrap">{m.body}</p>
                  <p className="mt-1 font-mono text-[9px] text-rc-muted">
                    {new Date(m.created_at).toLocaleString()}
                  </p>
                </div>
              ))}
              <div ref={endRef} />
            </div>

            {selected.status === 'open' ? (
              <form className="flex gap-2 border-t border-rc-line p-3" onSubmit={(e) => void onReply(e)}>
                <input
                  className="min-w-0 flex-1 border border-rc-line bg-rc-navy px-3 py-2 text-sm outline-none focus:border-rc-blue/50"
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder={t('chat.typeMessage')}
                />
                <Button type="submit" disabled={busy || !reply.trim()}>
                  {t('chat.send')}
                </Button>
              </form>
            ) : (
              <p className="border-t border-rc-line p-3 text-sm text-rc-muted">{t('chat.sessionClosed')}</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-rc-muted">{t('chat.selectSession')}</p>
        )}
      </div>
    </PanelPage>
  )
}
