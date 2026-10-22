import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, FieldError } from '@/components/ui/FormControls'
import { PanelPage } from '@/components/layout/PanelShell'
import { ChatComposer, ChatTranscript } from '@/components/live-chat/ChatConversation'
import { closeLiveChatSession, fetchStaffChatMessages, fetchStaffChatSessions, markChatMessagesRead, replyLiveChatAgent, type LiveChatMessage, type LiveChatSession } from '@/features/live-chat/api'
import { mergeChatMessages, mergeChatSessions } from '@/features/live-chat/messages'
import { chatErrorMessage } from '@/features/live-chat/errors'
import { backend } from '@/lib/backend'
import { moderateChatMessage } from '@/features/live-chat/api'
import { useAuth } from '@/hooks/useAuth'

export function LiveChatInboxPage() {
  const { t, i18n } = useTranslation()
  const en = i18n.language.startsWith('en')
  const { user } = useAuth()
  const [sessions, setSessions] = useState<LiveChatSession[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selectedRef = useRef(selectedId)
  selectedRef.current = selectedId
  const [messages, setMessages] = useState<LiveChatMessage[]>([])
  const [reply, setReply] = useState('')
  const [file,setFile]=useState<File | null>(null)
  const [editing,setEditing]=useState<LiveChatMessage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const selected = sessions.find((session) => session.id === selectedId)
  const visible = sessions.filter((session) => `${session.guest_name} ${session.guest_phone}`.toLowerCase().includes(query.trim().toLowerCase()))
  const markRead = useCallback(async (ids: string[]) => {
    if(!selectedId) return []
    const rows=await markChatMessagesRead(selectedId,ids)
    if(selectedRef.current===selectedId) setMessages((current)=>mergeChatMessages(current,rows))
    return rows
  }, [selectedId])

  useEffect(() => {
    let active = true
    void fetchStaffChatSessions().then((rows) => { if (active) setSessions((current) => mergeChatSessions(current, rows)) }).catch(() => { if (active) setError('دریافت گفت‌وگوها انجام نشد؛ صفحه را تازه‌سازی کنید.') })
    return () => { active = false }
  }, [])

  useEffect(() => {
    setMessages([]); setReply(''); setFile(null); setEditing(null); setError(null)
    if (!selectedId) return
    let active = true
    setLoading(true)
    void fetchStaffChatMessages(selectedId).then((rows) => { if (active) setMessages((current) => mergeChatMessages(current, rows)) }).catch((err: Error) => { if (active) setError(err.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [selectedId])

  useEffect(() => {
    // One subscription across conversation changes; receipt updates never refetch the inbox.
    let active = true
    let connected = false
    let refreshing = false
    const channel = backend.channel('live-chat-inbox')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_chat_sessions' }, (payload) => {
        const row = payload.new as LiveChatSession
        if (!row?.id) return
        setSessions((current) => mergeChatSessions(current, [row]))
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_chat_messages' }, (payload) => {
        const row = payload.new as LiveChatMessage
        if (row?.id && row.session_id === selectedRef.current) setMessages((current) => mergeChatMessages(current, [row]))
      }).subscribe((status) => {
        if (status !== 'SUBSCRIBED') return
        if (connected && !refreshing) {
          refreshing = true
          const id = selectedRef.current
          void Promise.all([fetchStaffChatSessions(), id ? fetchStaffChatMessages(id) : Promise.resolve([])]).then(([rows, list]) => {
            if (!active) return
            setSessions((current) => mergeChatSessions(current, rows))
            if (selectedRef.current === id) setMessages((current) => mergeChatMessages(current, list))
          }).catch(() => { /* Preserve current data until the next successful refresh. */ }).finally(() => { refreshing = false })
        }
        connected = true
      })
    return () => { active = false; void backend.removeChannel(channel) }
  }, [])

  const onReply = async (event: FormEvent) => {
    event.preventDefault()
    if (!selectedId || selected?.status !== 'open' || (!reply.trim() && !file) || busy) return
    const targetId = selectedId
    const submitted = reply.trim()
    setBusy(true); setError(null)
    try {
      const message = editing ? await moderateChatMessage(editing,'edit',submitted) : await replyLiveChatAgent(targetId, submitted,file ?? undefined)
      if (selectedRef.current === targetId) { setMessages((current) => mergeChatMessages(current, [message])); setReply((current) => current.trim() === submitted ? '' : current); setFile(null); setEditing(null) }
    } catch (err) {
      const code=err instanceof Error ? err.message : ''
      setError(chatErrorMessage(code,i18n.language))
      if(code==='chat_closed') setSessions((current)=>current.map((session)=>session.id===targetId?{...session,status:'closed'}:session))
    }
    finally { setBusy(false) }
  }

  const deleteMessage=async(message:LiveChatMessage)=>{
    if(busy || !window.confirm(en?'Delete this message for both sides?':'این پیام برای هر دو طرف حذف شود؟')) return
    setBusy(true);setError(null)
    try { const row=await moderateChatMessage(message,'delete'); if(selectedRef.current===row.session_id) { setMessages((current)=>mergeChatMessages(current,[row])); if(editing?.id===row.id) {setEditing(null);setReply('')} } }
    catch(err){setError(chatErrorMessage(err instanceof Error?err.message:'',i18n.language))}
    finally{setBusy(false)}
  }

  const endChat = async () => {
    if (!selected || !window.confirm(en ? 'End this conversation?' : 'این گفت‌وگو پایان یابد؟')) return
    const id = selected.id
    setBusy(true); setError(null)
    try { await closeLiveChatSession(id); setSessions((current) => current.map((session) => session.id === id ? { ...session, status: 'closed' } : session)) }
    catch (err) { setError(chatErrorMessage(err instanceof Error ? err.message : '', i18n.language)) }
    finally { setBusy(false) }
  }

  return <PanelPage title={t('chat.inboxTitle')} description={t('chat.inboxHint')} index="CHAT">
    <FieldError message={error ?? undefined} />
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)]">
      <aside className={`min-w-0 rounded-3xl border border-slate-200 bg-white p-4 ${selectedId ? 'hidden lg:block' : ''}`}>
        <h2 className="mb-3 text-lg font-black text-slate-900">{t('chat.sessions')}</h2>
        <label className="block"><span className="sr-only">{en ? 'Search by name or phone' : 'جست‌وجو با نام یا شماره'}</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={en ? 'Name or phone…' : 'نام یا شماره تماس…'} className="mb-4 min-h-12 w-full rounded-xl border border-slate-200 px-4 text-base text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100" /></label>
        <ul className="max-h-[65dvh] space-y-2 overflow-y-auto">
          {!visible.length ? <li className="py-6 text-center text-sm text-slate-600">{t('chat.noSessions')}</li> : null}
          {visible.map((session) => <li key={session.id}><button type="button" aria-pressed={selectedId === session.id} onClick={() => setSelectedId(session.id)} className={`flex min-h-20 w-full items-center gap-3 rounded-2xl border p-3 text-start focus-visible:outline-2 focus-visible:outline-sky-700 ${selectedId === session.id ? 'border-sky-300 bg-sky-50' : 'border-slate-100 hover:bg-slate-50'}`}><span className="grid size-11 shrink-0 place-items-center rounded-full bg-sky-100 font-black text-sky-900" aria-hidden="true">{session.guest_name.slice(0, 1)}</span><span className="min-w-0"><span className="block truncate text-sm font-bold text-slate-900">{session.guest_name}</span><span className="mt-1 block text-xs text-slate-600" dir="ltr">{session.guest_phone}</span><span className={`mt-1 block text-xs font-bold ${session.status === 'open' ? 'text-emerald-800' : 'text-slate-600'}`}>{session.status === 'open' ? en ? 'Open conversation' : 'گفت‌وگوی باز' : en ? 'Ended' : 'پایان‌یافته'}</span></span></button></li>)}
        </ul>
      </aside>
      <section className={`min-w-0 overflow-hidden rounded-3xl border border-slate-200 bg-white ${selected ? 'flex h-[min(46rem,80dvh)] min-h-80 flex-col' : 'hidden min-h-96 items-center justify-center p-8 text-center lg:flex'}`}>
        {selected ? <>
          <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200 p-3 sm:p-4"><div className="flex min-w-0 items-center gap-2"><button type="button" onClick={() => setSelectedId(null)} aria-label={en ? 'Back to conversations' : 'بازگشت به گفت‌وگوها'} className="grid size-11 shrink-0 place-items-center rounded-full text-sky-800 hover:bg-sky-50 lg:hidden"><svg viewBox="0 0 24 24" className="size-5 rtl:rotate-180" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m14 6-6 6 6 6" /></svg></button><div className="min-w-0"><h2 className="truncate font-bold text-slate-900">{selected.guest_name}</h2><p dir="ltr" className="mt-1 text-start text-xs text-slate-600">{selected.guest_phone}</p></div></div>{selected.status === 'open' ? <Button type="button" variant="danger" disabled={busy} onClick={() => void endChat()}>{en ? 'End chat' : 'اتمام گفت‌وگو'}</Button> : <span className="text-sm text-slate-600">{t('chat.sessionClosed')}</span>}</header>
          {loading ? <p role="status" className="p-4 text-sm text-slate-600">{t('app.loading')}</p> : null}
          <ChatTranscript key={selected.id} currentUserId={user?.id} messages={messages.filter((message) => message.session_id === selected.id)} viewer="agent" guestName={selected.guest_name} language={i18n.language} onRead={markRead} onEdit={selected.status==='open'?(message)=>{if(!busy){setEditing(message);setReply(message.body);setFile(null)}}:undefined} onDelete={(message)=>void deleteMessage(message)} />
          {selected.status === 'open' ? <ChatComposer key={selected.id} value={reply} onChange={setReply} file={file} onFileChange={setFile} editing={Boolean(editing)} onCancelEdit={()=>{setEditing(null);setReply('')}} onSubmit={(event) => void onReply(event)} busy={busy || loading} language={i18n.language} /> : <p className="shrink-0 border-t border-slate-200 p-4 text-center text-sm text-slate-700">{t('chat.sessionClosed')}</p>}
        </> : <p className="font-bold text-slate-600">{t('chat.selectSession')}</p>}
      </section>
    </div>
  </PanelPage>
}
