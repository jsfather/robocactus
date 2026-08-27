import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, FieldError, Select, Textarea } from '@/components/ui/FormControls'
import { PanelPage } from '@/components/layout/PanelShell'
import { fetchContactMessages, updateContactMessage } from '@/features/home/api'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/components/ui/Toast'

type Message = Awaited<ReturnType<typeof fetchContactMessages>>[number]
type MessageStatus = Message['status']

const statusMeta: Record<MessageStatus, { fa: string; en: string; style: string }> = {
  new: { fa: 'جدید', en: 'New', style: 'border-sky-200 bg-sky-50 text-sky-700' },
  in_review: { fa: 'در حال بررسی', en: 'In review', style: 'border-amber-200 bg-amber-50 text-amber-700' },
  resolved: { fa: 'بررسی‌شده', en: 'Reviewed', style: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  spam: { fa: 'هرزنامه', en: 'Spam', style: 'border-rose-200 bg-rose-50 text-rose-700' },
}

export function SuperAdminContactInboxPage() {
  const { i18n } = useTranslation()
  const { user } = useAuth()
  const toast = useToast()
  const fa = i18n.language.startsWith('fa')
  const [messages, setMessages] = useState<Message[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | MessageStatus>('all')
  const [query, setQuery] = useState('')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async (preferId?: string) => {
    setLoading(true)
    setError(null)
    try {
      const rows = await fetchContactMessages()
      setMessages(rows)
      setSelectedId((current) => preferId ?? current ?? rows[0]?.id ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : (fa ? 'خطا در دریافت پیام‌ها' : 'Could not load messages'))
    } finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [])
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    return messages.filter((message) => {
      if (filter !== 'all' && message.status !== filter) return false
      if (!needle) return true
      return [message.full_name, message.email, message.phone, message.subject, message.body].some((value) => value?.toLocaleLowerCase().includes(needle))
    })
  }, [filter, messages, query])
  const selected = messages.find((message) => message.id === selectedId) ?? null
  useEffect(() => { setNote(selected?.admin_note ?? '') }, [selected?.id, selected?.admin_note])

  const setStatus = async (status: MessageStatus) => {
    if (!selected) return
    setSaving(true)
    setError(null)
    try {
      await updateContactMessage(selected.id, { status, admin_note: note.trim() || null, assigned_to: user?.id ?? null })
      toast.success(fa ? 'وضعیت پیام ذخیره شد.' : 'Message status saved.')
      await load(selected.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : (fa ? 'ذخیره نشد' : 'Could not save'))
    } finally { setSaving(false) }
  }

  const counts = (status: MessageStatus) => messages.filter((message) => message.status === status).length
  return (
    <PanelPage index="INBOX" title={fa ? 'صندوق پیام‌های تماس' : 'Contact inbox'} description={fa ? 'پیام را باز کنید، مشخصات فرستنده را ببینید و روند پیگیری را ثت کنید.' : 'Open messages, review sender details, and track follow-up.'}>
      <FieldError message={error ?? undefined} />
      <section className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {(Object.keys(statusMeta) as MessageStatus[]).map((status) => (
          <button key={status} type="button" onClick={() => setFilter(status)} className={`rounded-2xl border p-4 text-start shadow-sm transition hover:-translate-y-0.5 ${filter === status ? statusMeta[status].style : 'border-rc-line bg-white text-rc-text'}`}>
            <span className="block text-2xl font-black">{counts(status).toLocaleString(fa ? 'fa-IR' : 'en-US')}</span>
            <span className="mt-1 block text-xs font-bold">{fa ? statusMeta[status].fa : statusMeta[status].en}</span>
          </button>
        ))}
      </section>
      <section className="overflow-hidden rounded-[1.75rem] border border-rc-line bg-white shadow-[0_20px_60px_rgb(18_76_98/0.09)]">
        <div className="grid min-h-[650px] lg:grid-cols-[minmax(300px,0.82fr)_minmax(0,1.5fr)]">
          <aside className="border-b border-rc-line bg-slate-50/70 lg:border-b-0 lg:border-e">
            <div className="space-y-3 border-b border-rc-line p-4">
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={fa ? 'جست‌وجوی نام، شماره، ایمیل یا موضوع…' : 'Search name, phone, email, subject…'} className="w-full rounded-xl border border-rc-line bg-white px-4 py-3 text-sm outline-none transition focus:border-rc-blue focus:ring-4 focus:ring-rc-blue/10" />
              <Select label={fa ? 'فیلتر وضعیت' : 'Status filter'} value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}><option value="all">{fa ? 'همه پیام‌ها' : 'All messages'} ({messages.length})</option>{(Object.keys(statusMeta) as MessageStatus[]).map((status) => <option key={status} value={status}>{fa ? statusMeta[status].fa : statusMeta[status].en}</option>)}</Select>
            </div>
            <div className="max-h-[530px] overflow-y-auto p-2">
              {loading ? <p className="p-5 text-sm text-rc-muted">{fa ? 'در حال دریافت…' : 'Loading…'}</p> : null}
              {!loading && filtered.length === 0 ? <p className="p-5 text-sm text-rc-muted">{fa ? 'پیامی در این وضعیت نیست.' : 'No messages in this view.'}</p> : null}
              {filtered.map((message) => <button key={message.id} type="button" onClick={() => setSelectedId(message.id)} className={`mb-2 w-full rounded-2xl border p-4 text-start transition ${selectedId === message.id ? 'border-rc-blue/35 bg-white shadow-[0_10px_30px_rgb(18_76_98/0.11)]' : 'border-transparent hover:border-rc-line hover:bg-white'}`}><span className="flex items-start justify-between gap-3"><strong className="line-clamp-1 text-sm text-rc-text">{message.full_name}</strong><span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-bold ${statusMeta[message.status].style}`}>{fa ? statusMeta[message.status].fa : statusMeta[message.status].en}</span></span><span className="mt-2 block line-clamp-1 text-sm font-medium text-rc-text">{message.subject}</span><span className="mt-1 block line-clamp-2 text-xs leading-5 text-rc-muted">{message.body}</span><time className="mt-2 block text-[11px] text-rc-muted" dir="ltr">{new Date(message.created_at).toLocaleString(fa ? 'fa-IR' : 'en-US')}</time></button>)}
            </div>
          </aside>
          <main className="p-5 md:p-7">
            {!selected ? <div className="grid h-full place-items-center text-center text-sm text-rc-muted">{fa ? 'یک پیام را از فهرست انتخاب کنید.' : 'Select a message from the list.'}</div> : (
              <div className="mx-auto max-w-3xl">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-rc-line pb-5"><div><span className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${statusMeta[selected.status].style}`}>{fa ? statusMeta[selected.status].fa : statusMeta[selected.status].en}</span><h2 className="mt-3 text-xl font-black text-rc-text">{selected.subject}</h2><time className="mt-1 block text-xs text-rc-muted" dir="ltr">{new Date(selected.created_at).toLocaleString(fa ? 'fa-IR' : 'en-US')}</time></div><div className="flex gap-2"><a href={`mailto:${selected.email}`} className="rounded-xl border border-rc-line px-3 py-2 text-xs font-bold text-rc-blue hover:bg-rc-blue/5">{fa ? 'ارسال ایمیل' : 'Email'}</a>{selected.phone ? <a href={`tel:${selected.phone}`} className="rounded-xl border border-rc-line px-3 py-2 text-xs font-bold text-rc-blue hover:bg-rc-blue/5">{fa ? 'تماس' : 'Call'}</a> : null}</div></div>
                <div className="my-5 grid gap-3 sm:grid-cols-3"><Detail label={fa ? 'نام و نام خانوادگی' : 'Full name'} value={selected.full_name} /><Detail label={fa ? 'ایمیل' : 'Email'} value={selected.email} dir="ltr" /><Detail label={fa ? 'شماره تماس' : 'Phone'} value={selected.phone || '—'} dir="ltr" /></div>
                <article className="min-h-40 whitespace-pre-wrap rounded-2xl border border-rc-line bg-slate-50/70 p-5 text-sm leading-8 text-rc-text">{selected.body}</article>
                <div className="mt-6 rounded-2xl border border-rc-blue/15 bg-rc-blue/[0.035] p-4"><h3 className="mb-3 text-sm font-black text-rc-text">{fa ? 'پیگیری پیام' : 'Message follow-up'}</h3><Textarea label={fa ? 'یادداشت داخلی مدیر' : 'Internal admin note'} value={note} onChange={(event) => setNote(event.target.value)} rows={3} placeholder={fa ? 'خلاصه پیگیری، نتیجه تماس یا دلیل هرزنامه را ثب کنید…' : 'Record follow-up details…'} /><div className="mt-4 flex flex-wrap gap-2">{(Object.keys(statusMeta) as MessageStatus[]).map((status) => <Button key={status} type="button" variant={status === 'spam' ? 'danger' : 'secondary'} disabled={saving} onClick={() => void setStatus(status)}>{fa ? statusMeta[status].fa : statusMeta[status].en}</Button>)}</div></div>
              </div>
            )}
          </main>
        </div>
      </section>
    </PanelPage>
  )
}

function Detail({ label, value, dir }: { label: string; value: string; dir?: 'ltr' | 'rtl' }) {
  return <div className="rounded-xl border border-rc-line bg-white p-3"><span className="block text-[11px] font-bold text-rc-muted">{label}</span><span className="mt-1 block break-all text-sm font-semibold text-rc-text" dir={dir}>{value}</span></div>
}
