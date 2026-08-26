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
  const [clock, setClock] = useState(() => Date.now())
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

  useEffect(() => {
    if (!token || !open) return
    const id = window.setInterval(() => setClock(Date.now()), 10_000)
    return () => window.clearInterval(id)
  }, [token, open])

  if (!enabled) return null

  const latestGuest = [...messages].reverse().find((message) => message.sender_kind === 'guest')
  const answeredAfter = latestGuest ? messages.some((message) => message.sender_kind === 'agent' && new Date(message.created_at).getTime() > new Date(latestGuest.created_at).getTime()) : false
  const waitAfterMs = Math.max(30, Number(settings?.chat_wait_timeout_seconds ?? 180)) * 1000
  const showWaitMessage = Boolean(latestGuest && !answeredAfter && clock - new Date(latestGuest.created_at).getTime() >= waitAfterMs)
  const waitMessage = i18n.language === 'en'
    ? settings?.chat_wait_message_en || 'Our specialists will respond as soon as possible. You can wait here or contact the secretariat.'
    : settings?.chat_wait_message_fa || 'کارشناسان ما در اولین فرصت پاسخ‌گو هستند. می‌توانید منتظر بمانید یا با دبیرخانه تماس بگیرید.'
  const visibleMessages = messages.filter((message) => !(message.sender_kind === 'system' && (/نام.*مکالمه|name.*conversation/i).test(message.body)))

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
    <div className="fixed bottom-5 start-4 z-[60] flex flex-col items-start gap-3 sm:bottom-7 sm:start-7">
      {open ? (
        <div
          className={[
            'flex h-[min(34rem,72vh)] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-[2rem] border border-sky-100 bg-white shadow-[0_28px_90px_rgb(12_83_108/0.22)] transition-all duration-300 ease-out',
            mounted ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-4 scale-95 opacity-0',
          ].join(' ')}
        >
          <div className="relative overflow-hidden bg-gradient-to-l from-[#087eb8] to-[#0ba86b] px-5 py-4 text-white">
            <div className="pointer-events-none absolute -end-8 -top-12 size-36 rounded-full border-[22px] border-white/10" />
            <div className="relative flex items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <span className="relative flex size-12 items-center justify-center rounded-2xl bg-white/18 text-white shadow-inner backdrop-blur-sm">
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
                  <p className="text-base font-black">{t('chat.title')}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-[11px] font-semibold text-white/80"><span className="size-2 rounded-full bg-lime-300" />{settings?.agents_online === false ? 'پیام بگذارید؛ پاسخ می‌دهیم' : 'کارشناس پاسخ‌گو است'}</p>
                </div>
              </div>
              <button
                type="button"
                className="flex size-9 items-center justify-center rounded-xl bg-white/10 text-white transition hover:bg-white/20"
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
            <form className="flex flex-1 flex-col gap-4 overflow-y-auto bg-gradient-to-b from-white to-sky-50/40 p-5" onSubmit={(e) => void onStart(e)}>
              <div className="rounded-2xl border border-sky-100 bg-sky-50/70 p-4"><p className="text-sm font-bold text-slate-700">سلام! چطور می‌توانیم کمک کنیم؟</p><p className="mt-1.5 text-xs leading-6 text-rc-muted">{t('chat.identifyHint')}</p></div>
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
              <Button type="submit" disabled={busy} className="mt-auto !rounded-2xl !bg-gradient-to-l !from-rc-blue !to-rc-accent !py-3 !font-bold !text-white !shadow-lg">
                {t('chat.start')}
              </Button>
            </form>
          ) : (
            <>
              <div className="flex-1 space-y-3 overflow-y-auto bg-gradient-to-b from-sky-50/60 to-white p-4">
                {visibleMessages.length === 0 ? <div className="mx-auto rounded-2xl border border-sky-100 bg-white px-4 py-3 text-center text-xs leading-6 text-rc-muted">{i18n.language === 'en' ? 'Ask your question; our specialists are here to help.' : 'سؤال خود را مطرح کنید؛ کارشناسان ما پاسخ‌گوی شما هستند.'}</div> : null}
                {visibleMessages.map((m) => (
                  <div
                    key={m.id}
                    className={[
                      'max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm animate-rc-fade-up',
                      m.sender_kind === 'guest'
                        ? 'ms-auto rounded-ee-md bg-gradient-to-l from-rc-blue to-sky-500 text-white'
                        : m.sender_kind === 'system'
                          ? 'mx-auto border border-sky-100 bg-white text-center text-xs text-rc-muted'
                          : 'me-auto rounded-es-md border border-emerald-100 bg-white text-slate-700',
                    ].join(' ')}
                  >
                    <p className="whitespace-pre-wrap">{m.body}</p>
                    <p className={`mt-1 text-[9px] ${m.sender_kind === 'guest' ? 'text-white/70' : 'text-rc-muted'}`}>
                      {new Date(m.created_at).toLocaleTimeString()}
                    </p>
                  </div>
                ))}
                {showWaitMessage ? <div className="mx-auto max-w-[94%] rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-xs leading-6 text-amber-900 shadow-sm"><p>{waitMessage}</p>{settings?.support_phone ? <a href={`tel:${settings.support_phone}`} className="mt-2 inline-flex rounded-xl bg-white px-3 py-1.5 font-bold text-rc-blue shadow-sm" dir="ltr">{settings.support_phone}</a> : null}</div> : null}
                <div ref={endRef} />
              </div>
              <form className="flex gap-2 border-t border-sky-100 bg-white p-3.5" onSubmit={(e) => void onSend(e)}>
                <input
                  className="min-w-0 flex-1 rounded-2xl border border-sky-100 bg-sky-50/60 px-4 py-2.5 text-sm outline-none transition focus:border-rc-blue/40"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder={t('chat.typeMessage')}
                />
                <Button type="submit" disabled={busy || !body.trim()} className="!flex !size-11 !items-center !justify-center !rounded-2xl !bg-rc-accent !p-0 !text-white">
                  <svg viewBox="0 0 24 24" className="size-5 rtl:rotate-180" fill="none" aria-label={t('chat.send')}><path d="m4 4 17 8-17 8 3-8-3-8Zm3 8h14" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg>
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
        className={`group relative flex h-15 items-center justify-center overflow-hidden rounded-[1.4rem] bg-gradient-to-l from-[#087eb8] to-[#13a94d] text-white shadow-[0_16px_40px_rgb(8_126_184/0.3)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_20px_50px_rgb(8_126_184/0.38)] active:scale-95 ${open ? 'w-15' : 'w-auto gap-3 px-5'}`}
        aria-label={t('chat.title')}
      >
        {open ? (
          <svg viewBox="0 0 24 24" className="relative size-6 transition duration-300" fill="none" aria-hidden>
            <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        ) : (
          <><span className="relative flex size-8 items-center justify-center rounded-xl bg-white/15"><svg viewBox="0 0 24 24" className="size-5 transition duration-300 group-hover:rotate-3" fill="none" aria-hidden>
            <path
              d="M5 7.5A2.5 2.5 0 0 1 7.5 5h9A2.5 2.5 0 0 1 19 7.5v6A2.5 2.5 0 0 1 16.5 16H11l-3.5 2.8V16H7.5A2.5 2.5 0 0 1 5 13.5v-6Z"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
            <path d="M9 10h6M9 13h3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg><span className="absolute -end-0.5 -top-0.5 size-2.5 rounded-full border-2 border-[#159c62] bg-lime-300" /></span><span className="text-sm font-black">گفتگوی آنلاین</span></>
        )}
      </button>
    </div>
  )
}
