import { useEffect, useRef, useState } from 'react'
import type { LiveChatMessage } from '@/features/live-chat/api'
import { fetchChatAttachment } from '@/features/live-chat/mediaApi'
import { CHAT_FILE_MAX_BYTES as CHAT_FILE_LIMIT, CHAT_VOICE_MAX_SECONDS, CHAT_DOCUMENT_MIMES } from '../../../shared/chat-policy'

export function ChatMediaIcon({ name }: { name: 'clip' | 'mic' | 'stop' | 'close' | 'clock' | 'size' }) {
  return <svg viewBox="0 0 24 24" className="size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name==='clip' ? <path d="m8 12 6-6a3 3 0 0 1 4.2 4.2l-8.5 8.5a5 5 0 0 1-7.1-7.1l9.2-9.2a7 7 0 0 1 9.9 9.9l-9.2 9.2" /> : name==='mic' ? <><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" /></> : name==='stop' ? <rect x="6" y="6" width="12" height="12" rx="2" /> : name==='close' ? <path d="m6 6 12 12M18 6 6 18" /> : name==='clock' ? <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></> : <><path d="M12 3v12m-4-4 4 4 4-4M5 17v4h14v-4" /></>}
  </svg>
}

export function ChatMediaLimits({ language }: { language: string }) {
  const en=language.startsWith('en')
  const number=(value:number)=>value.toLocaleString(en?'en-US':'fa-IR')
  return <div aria-label={en?'Attachment and voice limits':'محدودیت‌های پیوست و ویس'} className="flex flex-wrap items-center gap-1.5 px-3 pb-3 text-xs leading-5 text-slate-600">
    <span dir="ltr" className="rounded-lg bg-slate-100 px-2 py-1 font-medium">PDF · JPEG · PNG</span>
    <span className="inline-flex items-center gap-1 rounded-lg bg-sky-50 px-2 py-1 text-sky-800"><ChatMediaIcon name="size" />{en?`Up to ${number(CHAT_FILE_LIMIT/1048576)} MB`:`تا ${number(CHAT_FILE_LIMIT/1048576)} مگابایت`}</span>
    <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 text-emerald-800"><ChatMediaIcon name="clock" />{en?`Voice: ${number(CHAT_VOICE_MAX_SECONDS/60)} min`:`ویس: ${number(CHAT_VOICE_MAX_SECONDS/60)} دقیقه`}</span>
  </div>
}

export function ChatAttachment({ message, token, language }: { message: LiveChatMessage; token?: string; language: string }) {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const urlRef = useRef('')
  const mounted = useRef(true)
  const en = language.startsWith('en')
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; if (urlRef.current) URL.revokeObjectURL(urlRef.current) } }, [])
  const load = async () => {
    setLoading(true); setError(false)
    try {
      const blob = await fetchChatAttachment(message, token)
      if (!mounted.current) return
      const next = URL.createObjectURL(blob)
      urlRef.current = next; setUrl(next)
    } catch { if (mounted.current) setError(true) }
    finally { if (mounted.current) setLoading(false) }
  }
  return <div className="my-2 max-w-full space-y-2 rounded-xl border border-slate-200 bg-white p-2 text-slate-800">
    <p className="break-words text-xs font-bold">{message.attachment_name || (en ? 'Attachment' : 'پیوست')} · {Math.ceil((message.attachment_size || 0)/1024)} KB</p>
    {!url ? <button type="button" disabled={loading} onClick={() => void load()} className="min-h-11 rounded-lg bg-sky-50 px-3 text-sm font-bold text-sky-800 disabled:opacity-50">{loading ? en ? 'Loading…' : 'در حال دریافت…' : en ? 'Open attachment' : 'مشاهده پیوست'}</button> : <>
      {message.attachment_mime?.startsWith('image/') ? <img src={url} alt={message.attachment_name || ''} className="max-h-64 max-w-full rounded-lg object-contain" /> : null}
      {message.attachment_mime?.startsWith('audio/') ? <audio controls preload="metadata" src={url} className="max-w-full" aria-label={en ? 'Voice message' : 'پیام صوتی'} /> : null}
      <a href={url} download={message.attachment_name || 'attachment'} className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-bold text-sky-800 underline">{en ? 'Download file' : 'دانلود فایل'}</a>
    </>}
    {error ? <p role="alert" className="text-xs text-red-700">{en ? 'Could not load the attachment. Try again.' : 'پیوست دریافت نشد؛ دوباره تلاش کنید.'}</p> : null}
  </div>
}

export function ChatMediaControls({ file, onChange, disabled, language, onRecordingChange }: { file: File | null; onChange: (file: File | null) => void; disabled: boolean; language: string; onRecordingChange?: (active: boolean) => void }) {
  const [recording, setRecording] = useState(false)
  const [requesting, setRequesting] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState('')
  const recorder = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined)
  const mounted = useRef(true)
  const cancelled = useRef(false)
  const en = language.startsWith('en')
  useEffect(() => { onRecordingChange?.(recording || requesting); return () => onRecordingChange?.(false) }, [recording, requesting, onRecordingChange])
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; cancelled.current = true; clearInterval(timer.current); if (recorder.current?.state === 'recording') recorder.current.stop(); stream.current?.getTracks().forEach((track) => track.stop()) }
  }, [])
  useEffect(() => {
    if (!file?.type.startsWith('audio/')) { setPreview(''); return }
    const url = URL.createObjectURL(file); setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])
  const choose = (next: File | null) => {
    if (next && (next.size>CHAT_FILE_LIMIT || !next.size)) { setError(en ? 'Maximum file size: 5 MB.' : 'حداکثر حجم فایل ۵ مگابایت است.'); return }
    setError(''); onChange(next)
  }
  const start = async () => {
    if (disabled || requesting || recording) return
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder==='undefined') { setError(en ? 'Voice recording requires HTTPS and a supported browser.' : 'ضبط ویس به HTTPS و مرورگر سازگار نیاز دارد.'); return }
    setRequesting(true); setError(''); cancelled.current = false
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!mounted.current) { media.getTracks().forEach((track) => track.stop()); return }
      stream.current = media
      const mime = ['audio/webm;codecs=opus','audio/ogg;codecs=opus','audio/mp4'].find((type) => MediaRecorder.isTypeSupported(type))
      if (!mime) throw new Error('unsupported_audio')
      const next = new MediaRecorder(media, { mimeType: mime, audioBitsPerSecond: 64000 })
      recorder.current = next
      const chunks: Blob[] = []
      let size = 0
      next.ondataavailable = (event) => { if (event.data.size) { chunks.push(event.data); size += event.data.size; if (size>CHAT_FILE_LIMIT) { cancelled.current=true; if(next.state==='recording') next.stop(); if(mounted.current) setError(en ? 'Recording is too large.' : 'حجم ضبط بیش از حد مجاز است.') } } }
      next.onerror = () => { cancelled.current=true; media.getTracks().forEach((track) => track.stop()); clearInterval(timer.current); if(mounted.current) { setRecording(false); setError(en ? 'Recording failed.' : 'ضبط ویس انجام نشد.') } }
      next.onstop = () => {
        clearInterval(timer.current); media.getTracks().forEach((track) => track.stop())
        if (!mounted.current) return
        setRecording(false)
        if (!cancelled.current && size>0 && size<=CHAT_FILE_LIMIT) {
          const type = next.mimeType.split(';')[0] || mime.split(';')[0]!
          const extension = type==='audio/mp4'?'m4a':type==='audio/ogg'?'ogg':'webm'
          onChange(new File(chunks, `voice.${extension}`, { type }))
        }
      }
      setSeconds(0); setRecording(true); onChange(null); next.start(1000)
      let elapsed = 0
      timer.current = setInterval(() => { elapsed++; setSeconds(elapsed); if(elapsed>=CHAT_VOICE_MAX_SECONDS && next.state==='recording') next.stop() },1000)
    } catch { stream.current?.getTracks().forEach((track) => track.stop()); if(mounted.current) setError(en ? 'Microphone access was denied or recording is not supported.' : 'دسترسی میکروفن داده نشد یا مرورگر از ضبط پشتیبانی نمی‌کند.') }
    finally { if(mounted.current) setRequesting(false) }
  }
  return <div className="space-y-2 px-3 pt-2 text-xs text-slate-600">
    <div className="flex flex-wrap items-center gap-2">
      <label title={en?'Attach file':'پیوست فایل'} className={`grid size-11 shrink-0 cursor-pointer place-items-center rounded-full border border-sky-200 bg-sky-50 text-sky-800 transition hover:bg-sky-100 focus-within:ring-2 focus-within:ring-sky-500 ${disabled || recording ? 'opacity-50' : ''}`}><ChatMediaIcon name="clip" /><span className="sr-only">{en?'Attach file':'پیوست فایل'}</span><input type="file" className="sr-only" accept={CHAT_DOCUMENT_MIMES.join(',')} disabled={disabled || recording} onChange={(event) => { const selected=event.target.files?.[0]; if(selected) { if(!(CHAT_DOCUMENT_MIMES as readonly string[]).includes(selected.type)) setError(en?'Choose PDF, JPEG or PNG.':'فایل PDF، JPEG یا PNG انتخاب کنید.'); else choose(selected) } event.target.value='' }} /></label>
      {recording ? <><span role="status" className="font-bold tabular-nums text-red-700">{en?'Recording':'در حال ضبط'} · {seconds}s</span><button type="button" aria-label={en?'Stop & preview':'توقف و بازبینی'} title={en?'Stop & preview':'توقف و بازبینی'} onClick={() => recorder.current?.stop()} className="grid size-11 place-items-center rounded-full bg-red-50 text-red-700 focus-visible:ring-2 focus-visible:ring-red-500"><ChatMediaIcon name="stop" /></button><button type="button" aria-label={en?'Cancel recording':'انصراف از ضبط'} title={en?'Cancel recording':'انصراف از ضبط'} onClick={() => { cancelled.current=true; recorder.current?.stop() }} className="grid size-11 place-items-center rounded-full text-slate-700 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-sky-500"><ChatMediaIcon name="close" /></button></> : <button type="button" aria-label={requesting?(en?'Requesting microphone access':'درخواست دسترسی میکروفن'):(en?'Record voice':'ضبط ویس')} title={en?'Record voice':'ضبط ویس'} aria-busy={requesting} disabled={disabled || requesting} onClick={() => void start()} className="grid size-11 shrink-0 place-items-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-800 transition hover:bg-emerald-100 focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50"><ChatMediaIcon name="mic" /></button>}
    </div>
    {file ? <div className="rounded-xl bg-slate-50 p-2"><div className="flex items-center justify-between gap-2"><span className="min-w-0 break-words">{file.name} · {Math.ceil(file.size/1024)} KB</span><button type="button" disabled={disabled} onClick={() => choose(null)} className="min-h-11 shrink-0 px-3 text-red-700">{en?'Remove':'برداشتن فایل'}</button></div>{preview ? <audio src={preview} controls className="max-w-full" aria-label={en?'Voice preview':'بازبینی ویس'} /> : null}</div> : null}
    {error ? <p role="alert" className="text-red-700">{error}</p> : null}
  </div>
}
