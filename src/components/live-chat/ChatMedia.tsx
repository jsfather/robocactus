import { useEffect, useRef, useState } from 'react'
import type { LiveChatMessage } from '@/features/live-chat/api'
import { fetchChatAttachment } from '@/features/live-chat/mediaApi'
import { CHAT_FILE_MAX_BYTES as CHAT_FILE_LIMIT, CHAT_VOICE_MAX_SECONDS, CHAT_DOCUMENT_MIMES } from '../../../shared/chat-policy'

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
      <label className={`inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-slate-200 bg-white px-3 font-bold text-sky-800 focus-within:ring-2 focus-within:ring-sky-500 ${disabled || recording ? 'opacity-50' : ''}`}><span>{en ? 'Attach file' : 'پیوست فایل'}</span><input type="file" className="sr-only" accept={CHAT_DOCUMENT_MIMES.join(',')} disabled={disabled || recording} onChange={(event) => { const selected=event.target.files?.[0]; if(selected) { if(!(CHAT_DOCUMENT_MIMES as readonly string[]).includes(selected.type)) setError(en?'Choose PDF, JPEG or PNG.':'فایل PDF، JPEG یا PNG انتخاب کنید.'); else choose(selected) } event.target.value='' }} /></label>
      {recording ? <><span role="status" className="font-bold text-red-700">{en?'Recording':'در حال ضبط'} · {seconds}s</span><button type="button" onClick={() => recorder.current?.stop()} className="min-h-11 rounded-xl bg-sky-50 px-3 font-bold text-sky-800">{en?'Stop & preview':'توقف و بازبینی'}</button><button type="button" onClick={() => { cancelled.current=true; recorder.current?.stop() }} className="min-h-11 px-3 text-red-700">{en?'Cancel':'انصراف'}</button></> : <button type="button" disabled={disabled || requesting} onClick={() => void start()} className="min-h-11 rounded-xl border border-slate-200 px-3 font-bold text-sky-800 disabled:opacity-50">{requesting ? en?'Microphone…':'دسترسی میکروفن…' : en?'Record voice':'ضبط ویس'}</button>}
      <span>{en?'PDF / JPEG / PNG · 5 MB · voice up to 2 min':'PDF / JPEG / PNG · تا ۵ مگابایت · ضبط ویس تا ۲ دقیقه'}</span>
    </div>
    {file ? <div className="rounded-xl bg-slate-50 p-2"><div className="flex items-center justify-between gap-2"><span className="min-w-0 break-words">{file.name} · {Math.ceil(file.size/1024)} KB</span><button type="button" disabled={disabled} onClick={() => choose(null)} className="min-h-11 shrink-0 px-3 text-red-700">{en?'Remove':'برداشتن فایل'}</button></div>{preview ? <audio src={preview} controls className="max-w-full" aria-label={en?'Voice preview':'بازبینی ویس'} /> : null}</div> : null}
    {error ? <p role="alert" className="text-red-700">{error}</p> : null}
  </div>
}
