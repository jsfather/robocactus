import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, FieldError, Input } from '@/components/ui/FormControls'
import { useSiteSettings } from '@/hooks/useSiteSettings'
import {
  clearChatToken,
  fetchGuestMessages,
  loadChatToken,
  sendGuestMessage,
  startLiveChat,
  type LiveChatMessage,
} from '@/features/live-chat/api'
import { normalizePhone } from '@/lib/validation'

export function LiveChatWidget() {
  const { t, i18n } = useTranslation()
  const { settings } = useSiteSettings()
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [token, setToken] = useState<string | null>(() => loadChatToken())
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [body, setBody] = useState('')
  const [messages, setMessages] = useState<LiveChatMessage[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  const enabled = settings?.chat_enabled !== false

  useEffect(() => {
    if (!open) {
      setMounted(false)
      return
    }
    const id = window.requestAnimationFrame(() => setMounted(true))
    return () => window.cancelAnimationFrame(id)
  }, [open])

  useEffect(() => {
    if (!token || !open) return
    let cancelled = false
    const pull = async () => {
      try {
        const list = await fetchGuestMessages(token)
        if (!cancelled) setMessages(list)
      } catch {
        if (!cancelled) {
          clearChatToken()
          setToken(null)
          setMessages([])
        }
      }
    }
    void pull()
    const id = window.setInterval(() => void pull(), 4000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [token, open])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, open])

  if (!enabled) return null

  const onStart = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const session = await startLiveChat({
        name,
        phone: normalizePhone(phone),
        locale: i18n.language,
      })
      setToken(session.session_token)
      setMessages(await fetchGuestMessages(session.session_token))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  const onSend = async (e: FormEvent) => {
    e.preventDefault()
    if (!token || !body.trim()) return
    setBusy(true)
    setError(null)
    try {
      const msg = await sendGuestMessage(token, body.trim())
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]))
      setBody('')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed bottom-5 start-5 z-[60] flex flex-col items-start gap-3">
      {open ? (
        <div
          className={[
            'flex h-[min(32rem,70vh)] w-[min(22rem,calc(100vw-2.5rem))] flex-col overflow-hidden border border-rc-blue/30 bg-rc-navy/95 shadow-2xl shadow-rc-blue/20 backdrop-blur-md transition-all duration-300 ease-out',
            mounted ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-4 scale-95 opacity-0',
          ].join(' ')}
        >
          <div className="relative overflow-hidden border-b border-rc-line bg-gradient-to-l from-rc-blue/20 via-rc-surface/80 to-rc-surface/80 px-4 py-3">
            <div className="pointer-events-none absolute -top-8 end-0 size-24 rounded-full bg-rc-blue/20 blur-2xl" />
            <div className="relative flex items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <span className="relative flex size-10 items-center justify-center bg-rc-blue text-white">
                  <span className="absolute inset-0 animate-rc-ping bg-rc-blue/40" aria-hidden />
                  <svg viewBox="0 0 24 24" className="relative size-5" fill="none" aria-hidden>
                    <path
                      d="M5 7.5A2.5 2.5 0 0 1 7.5 5h9A2.5 2.5 0 0 1 19 7.5v6A2.5 2.5 0 0 1 16.5 16H11l-3.5 2.8V16H7.5A2.5 2.5 0 0 1 5 13.5v-6Z"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <div>
                  <p className="font-mono text-[10px] tracking-[0.22em] text-rc-blue uppercase">
                    {t('chat.liveSupport')}
                  </p>
                  <p className="text-sm font-semibold">{t('chat.title')}</p>
                </div>
              </div>
              <button
                type="button"
                className="border border-rc-line p-1.5 text-rc-muted transition hover:bg-rc-hover hover:text-rc-text"
                onClick={() => setOpen(false)}
                aria-label="close"
              >
                <svg viewBox="0 0 24 24" className="size-4" fill="none" aria-hidden>
                  <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </div>

          {!token ? (
            <form className="flex flex-1 flex-col gap-3 overflow-y-auto p-4" onSubmit={(e) => void onStart(e)}>
              <p className="text-sm leading-relaxed text-rc-muted">{t('chat.identifyHint')}</p>
              <Input
                label={t('chat.name')}
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Input
                label={t('chat.phone')}
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                dir="ltr"
              />
              <FieldError message={error ?? undefined} />
              <Button type="submit" disabled={busy} className="mt-auto">
                {t('chat.start')}
              </Button>
            </form>
          ) : (
            <>
              <div className="flex-1 space-y-2 overflow-y-auto bg-rc-bg/50 p-3">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={[
                      'max-w-[90%] px-3 py-2 text-sm shadow-sm animate-rc-fade-up',
                      m.sender_kind === 'guest'
                        ? 'ms-auto bg-rc-blue/25 text-rc-text'
                        : m.sender_kind === 'system'
                          ? 'mx-auto border border-rc-line/80 bg-rc-surface/60 text-center text-xs text-rc-muted'
                          : 'me-auto border border-rc-line/50 bg-rc-surface text-rc-text',
                    ].join(' ')}
                  >
                    <p className="whitespace-pre-wrap">{m.body}</p>
                    <p className="mt-1 font-mono text-[9px] text-rc-muted">
                      {new Date(m.created_at).toLocaleTimeString()}
                    </p>
                  </div>
                ))}
                <div ref={endRef} />
              </div>
              <form className="flex gap-2 border-t border-rc-line p-3" onSubmit={(e) => void onSend(e)}>
                <input
                  className="min-w-0 flex-1 border border-rc-line bg-rc-surface px-3 py-2 text-sm outline-none transition focus:border-rc-blue/50"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder={t('chat.typeMessage')}
                />
                <Button type="submit" disabled={busy || !body.trim()}>
                  {t('chat.send')}
                </Button>
              </form>
              {error ? <p className="px-3 pb-2 text-xs text-red-400">{error}</p> : null}
            </>
          )}
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="group relative flex size-14 items-center justify-center overflow-hidden bg-rc-blue text-white shadow-lg shadow-rc-blue/35 transition duration-300 hover:scale-105 hover:brightness-110 active:scale-95"
        aria-label={t('chat.title')}
      >
        <span className="pointer-events-none absolute inset-0 animate-rc-soft-pulse bg-rc-blue" aria-hidden />
        <span className="pointer-events-none absolute -inset-2 animate-rc-ring rounded-full border border-rc-blue/50" aria-hidden />
        {open ? (
          <svg viewBox="0 0 24 24" className="relative size-6 transition duration-300" fill="none" aria-hidden>
            <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="relative size-6 transition duration-300 group-hover:rotate-3" fill="none" aria-hidden>
            <path
              d="M5 7.5A2.5 2.5 0 0 1 7.5 5h9A2.5 2.5 0 0 1 19 7.5v6A2.5 2.5 0 0 1 16.5 16H11l-3.5 2.8V16H7.5A2.5 2.5 0 0 1 5 13.5v-6Z"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
            <path d="M9 10h6M9 13h3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        )}
      </button>
    </div>
  )
}
