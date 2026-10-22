import { useCallback, useEffect, useState, type FormEvent } from 'react'
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
  type LiveChatSession,
  getGuestChatSession,
  closeGuestChatSession,
  markChatMessagesRead,
} from '@/features/live-chat/api'
import { normalizePhone, numericInput } from '@/lib/validation'
import { ArcaptchaField, captchaErrorMessage } from '@/features/captcha/ArcaptchaField'
import { chatErrorMessage } from '@/features/live-chat/errors'
import { mergeChatMessages, mergeChatSessions } from '@/features/live-chat/messages'
import { ChatComposer, ChatTranscript } from './ChatConversation'

export function LiveChatWidget() {
  const { t, i18n } = useTranslation()
  const { settings } = useSiteSettings()
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [token, setToken] = useState<string | null>(() => loadChatToken())
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [body, setBody] = useState('')
  const [captchaToken, setCaptchaToken] = useState('')
  const [captchaReset, setCaptchaReset] = useState(0)
  const [messages, setMessages] = useState<LiveChatMessage[]>([])
  const [session, setSession] = useState<LiveChatSession | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [clock, setClock] = useState(() => Date.now())
  const [launcherVisible, setLauncherVisible] = useState(false)
  const markRead = useCallback(async (ids: string[]) => {
    if (token && session) await markChatMessagesRead(session.id, ids, token)
  }, [token, session?.id])

  const enabled = settings?.chat_enabled !== false

  useEffect(() => {
    if (!enabled) {
      setLauncherVisible(false)
      setOpen(false)
      return
    }
    const timer = window.setTimeout(() => setLauncherVisible(true), 20_000)
    return () => window.clearTimeout(timer)
  }, [enabled])

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
    let refreshing = false
    const pull = async () => {
      if (refreshing) return
      refreshing = true
      try {
        const [list, currentSession] = await Promise.all([fetchGuestMessages(token), getGuestChatSession(token)])
        if (!cancelled) { setMessages((current) => mergeChatMessages(current, list)); setSession((current) => mergeChatSessions(current ? [current] : [], [currentSession])[0] ?? null) }
      } catch (err) {
        if (!cancelled && err instanceof Error && err.message === 'session_not_found') {
          clearChatToken()
          setToken(null)
          setMessages([])
          setSession(null)
        }
      } finally { refreshing = false }
    }
    void pull()
    const source = new EventSource(`/api/realtime?tables=live_chat_messages,live_chat_sessions&chat_token=${encodeURIComponent(token)}`, { withCredentials: true })
    source.onmessage = (event) => {
      try {
        const change = JSON.parse(event.data) as { table?: string; event?: string; record?: LiveChatMessage & { status?: string } }
        if (change.table === 'live_chat_messages' && ['INSERT', 'UPDATE'].includes(change.event ?? '') && change.record?.id) {
          const row = change.record as LiveChatMessage
          setMessages((current) => mergeChatMessages(current, [row]))
        }
        if (change.table === 'live_chat_sessions' && change.record?.status === 'closed') setSession((current) => current ? { ...current, status: 'closed' } : current)
      } catch { /* malformed events are ignored; EventSource reconnects automatically */ }
    }
    let connected = false
    source.onopen = () => { if (connected && !cancelled) void pull(); connected = true }
    return () => {
      cancelled = true
      source.close()
    }
  }, [token, open])

  useEffect(() => {
    if (!token || !open) return
    const id = window.setInterval(() => setClock(Date.now()), 10_000)
    return () => window.clearInterval(id)
  }, [token, open])

  if (!enabled || !launcherVisible) return null

  const latestGuest = [...messages].reverse().find((message) => message.sender_kind === 'guest')
  const answeredAfter = latestGuest ? messages.some((message) => message.sender_kind === 'agent' && new Date(message.created_at).getTime() > new Date(latestGuest.created_at).getTime()) : false
  const waitAfterMs = Math.max(30, Number(settings?.chat_wait_timeout_seconds ?? 180)) * 1000
  const showWaitMessage = Boolean(session?.status === 'open' && latestGuest && !answeredAfter && clock - new Date(latestGuest.created_at).getTime() >= waitAfterMs)
  const waitMessage = i18n.language === 'en'
    ? settings?.chat_wait_message_en || 'Our specialists will respond as soon as possible. You can wait here or contact the secretariat.'
    : settings?.chat_wait_message_fa || 'کارشناسان ما در اولین فرصت پاسخ‌گو هستند. می‌توانید منتظر بمانید یا با دبیرخانه تماس بگیرید.'
  const visibleMessages = messages.filter((message) => !(message.sender_kind === 'system' && (/نام.*مکالمه|name.*conversation/i).test(message.body)))

  const onStart = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const started = await startLiveChat({
        name,
        phone: normalizePhone(phone),
        locale: i18n.language,
        captchaToken,
      })
      setSession({ id: started.session_id, guest_name: started.guest_name, guest_phone: started.guest_phone, status: 'open', assigned_to: null, last_message_at: '', created_at: '' })
      setMessages([])
      setToken(started.session_token)
    } catch (err) {
      const message = err instanceof Error ? err.message : t('common.error')
      setError(message.startsWith('captcha_') ? captchaErrorMessage(message) : chatErrorMessage(message, i18n.language))
      setCaptchaToken('')
      setCaptchaReset((value) => value + 1)
    } finally {
      setBusy(false)
    }
  }

  const onSend = async (e: FormEvent) => {
    e.preventDefault()
    if (!token || session?.status !== 'open' || !body.trim() || busy) return
    const submitted = body.trim()
    setBusy(true)
    setError(null)
    try {
      const msg = await sendGuestMessage(token, submitted)
      setMessages((prev) => mergeChatMessages(prev, [msg]))
      setBody((current) => current.trim() === submitted ? '' : current)
    } catch (err) {
      const code = err instanceof Error ? err.message : ''
      setError(chatErrorMessage(code, i18n.language))
      if (code === 'session_not_found') {
        try { const current = await getGuestChatSession(token); setSession(current) }
        catch { /* Keep the transcript on a transient failure; the user can retry. */ }
      }
    } finally {
      setBusy(false)
    }
  }

  const endChat = async () => {
    if (!token || !session || !window.confirm(i18n.language.startsWith('en') ? 'End this conversation?' : 'این گفت‌وگو پایان یابد؟')) return
    setBusy(true); setError(null)
    try { await closeGuestChatSession(token); setSession({ ...session, status: 'closed' }) }
    catch (err) { setError(chatErrorMessage(err instanceof Error ? err.message : '', i18n.language)) }
    finally { setBusy(false) }
  }

  return (
    <div className={open ? 'fixed inset-x-2 bottom-[max(.5rem,env(safe-area-inset-bottom))] top-[max(.5rem,env(safe-area-inset-top))] z-[60] flex flex-col items-stretch gap-3 sm:inset-x-auto sm:bottom-7 sm:start-7 sm:top-auto sm:items-start' : 'fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] start-4 z-[60] flex flex-col items-start gap-3 sm:start-7 md:bottom-7'}>
      {open ? (
        <div
          className={[
            'flex h-full min-h-0 w-full flex-col overflow-hidden rounded-3xl border border-sky-100 bg-white shadow-[0_28px_90px_rgb(12_83_108/0.22)] transition-opacity duration-200 motion-reduce:transition-none sm:h-[min(38rem,calc(100dvh-7rem))] sm:w-[26rem]',
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
                  <p className="mt-1 text-xs text-white">{session?.status === 'closed' ? i18n.language.startsWith('en') ? 'Conversation ended' : 'گفت‌وگو پایان یافته' : messages.findLast((message) => message.sender_kind === 'agent')?.sender_name || (i18n.language.startsWith('en') ? 'Tabarestan Cup support' : 'پشتیبانی جام تبرستان')}</p>
                </div>
              </div>
              <button
                type="button"
                className="flex size-11 items-center justify-center rounded-xl bg-white/10 text-white transition hover:bg-white/20"
                onClick={() => setOpen(false)}
                aria-label="close"
              >
                <svg viewBox="0 0 24 24" className="size-4" fill="none" aria-hidden>
                  <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </div>

          {token && session?.status === 'open' ? <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-1"><span className="min-w-0 truncate text-sm font-bold text-slate-700">{session.guest_name}</span><button type="button" disabled={busy} onClick={() => void endChat()} className="min-h-11 shrink-0 rounded-xl px-3 text-xs font-bold text-red-700 hover:bg-red-50 disabled:opacity-50">{i18n.language.startsWith('en') ? 'End chat' : 'اتمام گفت‌وگو'}</button></div> : null}

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
                onChange={(e) => setPhone(numericInput(e.target.value, 11))}
                dir="ltr"
                inputMode="numeric"
                maxLength={11}
                minLength={11}
                pattern="09[0-9]{9}"
              />
              <ArcaptchaField context="live_chat" onToken={setCaptchaToken} resetKey={captchaReset} />
              <FieldError message={error ?? undefined} />
              <Button type="submit" disabled={busy} className="mt-auto !rounded-2xl !bg-gradient-to-l !from-rc-blue !to-rc-accent !py-3 !font-bold !text-white !shadow-lg">
                {t('chat.start')}
              </Button>
            </form>
          ) : (
            <>
              <ChatTranscript key={token} messages={visibleMessages} viewer="guest" guestName={session?.guest_name || name || (i18n.language.startsWith('en') ? 'You' : 'شما')} language={i18n.language} onRead={markRead}>
                {showWaitMessage ? <div className="mx-auto max-w-[94%] rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-xs leading-6 text-amber-900 shadow-sm"><p>{waitMessage}</p>{settings?.support_phone ? <a href={`tel:${settings.support_phone}`} className="mt-2 inline-flex rounded-xl bg-white px-3 py-1.5 font-bold text-rc-blue shadow-sm" dir="ltr">{settings.support_phone}</a> : null}</div> : null}
              </ChatTranscript>
              {session?.status === 'closed' ? <div className="shrink-0 border-t border-slate-200 bg-white p-4 text-center"><p className="mb-3 text-sm text-slate-700">{t('chat.sessionClosed')}</p><Button type="button" onClick={() => { clearChatToken(); setToken(null); setSession(null); setMessages([]); setBody(''); setError(null) }}>{i18n.language.startsWith('en') ? 'New conversation' : 'شروع گفت‌وگوی جدید'}</Button></div> : <ChatComposer value={body} onChange={setBody} busy={busy || !session} language={i18n.language} onSubmit={(event) => void onSend(event)} />}
              {error ? <p role="alert" className="bg-white px-3 pb-2 text-xs text-red-700">{error}</p> : null}
            </>
          )}
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`group relative h-15 items-center justify-center overflow-hidden rounded-[1.4rem] bg-gradient-to-l from-[#087eb8] to-[#13a94d] text-white shadow-lg transition duration-200 ${open ? 'hidden w-15 sm:flex' : 'flex w-auto gap-3 px-5'}`}
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
