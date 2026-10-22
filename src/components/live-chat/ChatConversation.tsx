import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import type { LiveChatMessage } from '@/features/live-chat/api'
import { formatAppDate, formatAppTime } from '@/lib/dates'

function Avatar({ name, image }: { name: string; image?: string | null }) {
  const [failed, setFailed] = useState(false)
  return <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-full bg-sky-100 text-xs font-black text-sky-900" aria-hidden="true">
    {image && !failed ? <img src={image} alt="" className="size-full object-cover" onError={() => setFailed(true)} /> : name.trim().slice(0, 1)}
  </span>
}

export function MessageReceipt({ read, language }: { read: boolean; language: string }) {
  const label = language.startsWith('en') ? read ? 'Read' : 'Sent' : read ? 'خوانده شد' : 'ارسال شد'
  return <span className={`inline-flex items-center gap-1 ${read ? 'text-sky-800' : 'text-slate-600'}`} title={label}>
    <svg viewBox="0 0 24 16" className="h-3.5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m2 8 4 4L17 2" />{read ? <path d="m10 11 2 2L23 3" /> : null}</svg>
    <span>{label}</span>
  </span>
}

export function ChatTranscript({ messages, viewer, guestName, language, onRead, children }: {
  messages: LiveChatMessage[]; viewer: 'guest' | 'agent'; guestName: string; language: string
  onRead: (ids: string[]) => Promise<void>; children?: ReactNode
}) {
  const viewport = useRef<HTMLDivElement>(null)
  const acknowledged = useRef(new Set<string>())
  const nearBottom = useRef(true)
  const lastId = useRef<string | null>(null)
  const en = language.startsWith('en')

  useEffect(() => {
    const root = viewport.current
    const latest = messages.at(-1)
    if (!root || !latest || lastId.current === latest.id) return
    if (lastId.current === null || nearBottom.current || latest.sender_kind === viewer) root.scrollTop = root.scrollHeight
    lastId.current = latest.id
  }, [messages, viewer])

  useEffect(() => {
    const root = viewport.current
    if (!root) return
    let disposed = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let inFlight = false
    const visible = new Set<string>()
    const canRead = () => document.visibilityState === 'visible' && document.hasFocus()
    const flush = async () => {
      timer = undefined
      if (disposed || inFlight || !canRead()) return
      const ids = [...visible].filter((id) => !acknowledged.current.has(id)).slice(0, 500)
      if (!ids.length) return
      inFlight = true
      try { await onRead(ids); for (const id of ids) acknowledged.current.add(id) }
      catch { /* Keep unread on failure; focus/scroll can retry without claiming success. */ }
      finally { inFlight = false }
    }
    const schedule = () => { if (!timer && !disposed) timer = setTimeout(() => void flush(), 250) }
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const id = (entry.target as HTMLElement).dataset.messageId!
        if (entry.isIntersecting) visible.add(id); else visible.delete(id)
      }
      schedule()
    }, { root, threshold: 0.1 })
    root.querySelectorAll<HTMLElement>('[data-unread="true"]').forEach((element) => observer.observe(element))
    document.addEventListener('visibilitychange', schedule)
    window.addEventListener('focus', schedule)
    root.addEventListener('scroll', schedule, { passive: true })
    return () => { disposed = true; clearTimeout(timer); observer.disconnect(); document.removeEventListener('visibilitychange', schedule); window.removeEventListener('focus', schedule); root.removeEventListener('scroll', schedule) }
  }, [messages, onRead])

  return <div ref={viewport} onScroll={() => { const node = viewport.current; if (node) nearBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 100 }} className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain bg-slate-100 px-3 py-4 sm:px-5" role="log" aria-label={en ? 'Conversation messages' : 'پیام‌های گفت‌وگو'} aria-live="polite">
    {!messages.length ? <p className="py-8 text-center text-sm text-slate-600">{en ? 'Send a message to start the conversation.' : 'پیام خود را برای شروع گفت‌وگو بنویسید.'}</p> : null}
    {messages.map((message, index) => {
      const own = message.sender_kind === viewer
      const system = message.sender_kind === 'system'
      const name = message.sender_name || (message.sender_kind === 'guest' ? guestName : en ? 'Support operator' : 'اپراتور پشتیبانی')
      const day = formatAppDate(message.created_at, language)
      const previousDay = index ? formatAppDate(messages[index - 1]!.created_at, language) : null
      return <div key={message.id}>
        {day !== previousDay ? <div className="mb-4 text-center"><span className="inline-block rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 shadow-sm">{day}</span></div> : null}
        {system ? <p className="mx-auto max-w-[90%] rounded-xl bg-white/80 px-3 py-2 text-center text-xs leading-6 text-slate-600">{message.body}</p> : <div data-message-id={message.id} data-unread={!own && !message.read_at} className={`flex max-w-[94%] items-end gap-2 sm:max-w-[85%] ${own ? 'ms-auto flex-row-reverse' : 'me-auto'}`}>
          <Avatar key={`${message.sender_id}-${message.sender_avatar_url}`} name={name} image={message.sender_avatar_url} />
          <article className={`min-w-0 rounded-2xl px-3 py-2.5 shadow-sm ${own ? 'rounded-ee-sm bg-emerald-100 text-slate-900' : 'rounded-es-sm border border-slate-200 bg-white text-slate-900'}`}>
            <div className="mb-1 flex flex-wrap items-center gap-x-2 text-xs font-bold text-sky-800"><span>{name}</span><span className="font-normal text-slate-600">{message.sender_kind === 'agent' ? en ? 'Support' : 'پشتیبانی' : en ? 'Visitor' : 'کاربر'}</span></div>
            <p dir="auto" className="whitespace-pre-wrap text-start text-sm leading-7 [overflow-wrap:anywhere]">{message.body}</p>
            <footer className="mt-1.5 flex flex-wrap items-center justify-end gap-2 text-xs text-slate-600"><time dateTime={message.created_at} dir="ltr">{formatAppTime(message.created_at, language)}</time>{own ? <MessageReceipt read={Boolean(message.read_at)} language={language} /> : null}</footer>
          </article>
        </div>}
      </div>
    })}
    {children}
  </div>
}

export function ChatComposer({ value, onChange, onSubmit, busy, language }: {
  value: string; onChange: (value: string) => void; onSubmit: (event: FormEvent) => void; busy: boolean; language: string
}) {
  const en = language.startsWith('en')
  return <form onSubmit={onSubmit} className="flex shrink-0 items-end gap-2 border-t border-slate-200 bg-white p-3">
    <label className="min-w-0 flex-1"><span className="sr-only">{en ? 'Message' : 'متن پیام'}</span><textarea dir="auto" rows={2} maxLength={5000} value={value} onChange={(event) => onChange(event.target.value)} placeholder={en ? 'Write a message…' : 'پیام خود را بنویسید…'} className="max-h-32 min-h-12 w-full resize-y rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100" /></label>
    <button type="submit" disabled={busy || !value.trim()} aria-label={en ? 'Send message' : 'ارسال پیام'} className="mb-1 grid size-12 shrink-0 place-items-center rounded-full bg-sky-700 text-white transition hover:bg-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 disabled:opacity-50"><svg viewBox="0 0 24 24" className="size-5 rtl:rotate-180" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m3 3 18 9-18 9 4-9-4-9Zm4 9h14" /></svg></button>
    <span className="sr-only" role="status">{busy ? en ? 'Sending…' : 'در حال ارسال…' : ''}</span>
  </form>
}
