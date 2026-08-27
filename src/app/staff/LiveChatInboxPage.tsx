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
import { backend } from '@/lib/backend'
import { formatAppDateTime } from '@/lib/dates'

export function LiveChatInboxPage() {
  const { t, i18n } = useTranslation()
  const [sessions, setSessions] = useState<LiveChatSession[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<LiveChatMessage[]>([])
  const [reply, setReply] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  const selected = sessions.find((s) => s.id === selectedId) ?? null
  const statusLabel = (status: string) => ({ open: 'گفتگوی باز', closed: 'پایان‌یافته', waiting: 'در انتظار کارشناس' })[status] ?? status
  const visibleSessions = sessions.filter((session) => `${session.guest_name} ${session.guest_phone}`.toLowerCase().includes(query.trim().toLowerCase()))

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

    const channel = backend
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
      void backend.removeChannel(channel)
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
      <div className="grid gap-5 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <PanelCard title={t('chat.sessions')}>
          <div className="mb-4 grid grid-cols-2 gap-2"><div className="rounded-2xl bg-sky-50 p-3"><p className="text-[10px] font-bold text-sky-700">همه گفتگوها</p><p className="text-xl font-black text-sky-900">{sessions.length}</p></div><div className="rounded-2xl bg-emerald-50 p-3"><p className="text-[10px] font-bold text-emerald-700">گفتگوی باز</p><p className="text-xl font-black text-emerald-900">{sessions.filter((s) => s.status === 'open').length}</p></div></div>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="نام یا شماره تماس…" className="mb-4 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-sky-300 focus:bg-white focus:ring-4 focus:ring-sky-50" />
          <ul className="max-h-[38rem] space-y-2 overflow-y-auto pe-1">
            {sessions.length === 0 ? (
              <li className="text-sm text-rc-muted">{t('chat.noSessions')}</li>
            ) : (
              visibleSessions.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(s.id)}
                    className={`w-full rounded-2xl border px-4 py-3 text-start text-sm transition ${
                      selectedId === s.id ? 'border-sky-200 bg-gradient-to-l from-sky-50 to-cyan-50 text-sky-800 shadow-sm' : 'border-slate-100 bg-slate-50/70 hover:border-sky-100 hover:bg-sky-50/60'
                    }`}
                  >
                    <span className="block font-medium">{s.guest_name}</span>
                    <span className="font-mono text-xs text-rc-muted" dir="ltr">
                      {s.guest_phone}
                    </span>
                    <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-[10px] font-black ${s.status === 'open' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {statusLabel(s.status)}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </PanelCard>

        {selected ? (
          <div className="flex min-h-[36rem] flex-col overflow-hidden rounded-[1.6rem] border border-white/80 bg-white shadow-[0_18px_55px_rgb(18_76_98/0.09)]">
            <div className="flex items-center justify-between border-b border-sky-100 bg-gradient-to-l from-slate-900 to-sky-900 px-5 py-4 text-white">
              <div>
                <p className="font-semibold">{selected.guest_name}</p>
                <p className="font-mono text-xs text-white/70" dir="ltr">
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

            <div className="flex-1 space-y-3 overflow-y-auto bg-[radial-gradient(circle_at_top,_rgb(239_248_252),_rgb(248_250_252)_55%)] p-5">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={[
                    'max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm',
                    m.sender_kind === 'agent'
                      ? 'ms-auto rounded-ee-md bg-gradient-to-br from-sky-600 to-cyan-600 text-white'
                      : m.sender_kind === 'system'
                        ? 'mx-auto border border-slate-200 bg-white text-center text-xs text-slate-500'
                        : 'me-auto rounded-es-md border border-slate-100 bg-white text-slate-700',
                  ].join(' ')}
                >
                  <p className="whitespace-pre-wrap">{m.body}</p>
                  <p className={`mt-1 font-mono text-[9px] ${m.sender_kind === 'agent' ? 'text-white/70' : 'text-slate-400'}`}>
                    {formatAppDateTime(m.created_at, i18n.language)}
                  </p>
                </div>
              ))}
              <div ref={endRef} />
            </div>

            {selected.status === 'open' ? (
              <form className="flex gap-3 border-t border-slate-100 bg-white p-4" onSubmit={(e) => void onReply(e)}>
                <input
                  className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-sky-300 focus:bg-white focus:ring-4 focus:ring-sky-50"
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
          <div className="flex min-h-[36rem] flex-col items-center justify-center rounded-[1.6rem] border border-dashed border-sky-200 bg-gradient-to-br from-white to-sky-50/60 p-8 text-center"><span className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-sky-100 text-3xl">◌</span><p className="font-black text-slate-700">{t('chat.selectSession')}</p><p className="mt-2 text-sm leading-7 text-slate-500">گفتگو را انتخاب کنید تا اطلاعات مخاطب و پیام‌ها در این بخش نمایش داده شوند.</p></div>
        )}
      </div>
    </PanelPage>
  )
}
