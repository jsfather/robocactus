import { useRef, useState } from 'react'

export const DOCUMENT_MAX_BYTES = 5 * 1024 * 1024
export const DOCUMENT_ACCEPT = 'image/jpeg,image/png'

export function validateIdentityImage(file: File) {
  if (!['image/jpeg', 'image/png'].includes(file.type)) return 'فقط تصاویر JPG و PNG مجاز هستند.'
  if (file.size > DOCUMENT_MAX_BYTES) return 'حجم تصویر نباید بیشتر از ۵ مگابایت باشد.'
  return null
}

export function DocumentUploadField({ label, required, value, busy, onSelect, onRemove }: { label: string; required?: boolean; value?: string; busy?: boolean; onSelect: (file: File) => void; onRemove: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  const [previewFailed, setPreviewFailed] = useState(false)
  return <div className={`overflow-hidden rounded-2xl border bg-white transition ${value ? 'border-emerald-200 shadow-[0_10px_28px_rgb(16_185_129/0.08)]' : 'border-dashed border-slate-300 hover:border-sky-300'}`}>
    <div className="flex items-center gap-4 p-4">
      <button type="button" disabled={busy} onClick={() => inputRef.current?.click()} className="relative grid size-20 shrink-0 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-sky-50 to-emerald-50 text-rc-blue ring-1 ring-sky-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rc-blue">
        {value && !previewFailed ? <img src={value} alt={label} className="size-full object-cover" onError={() => setPreviewFailed(true)} /> : <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 16V4M7.5 8.5 12 4l4.5 4.5" /><path d="M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" /></svg>}
      </button>
      <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="truncate text-sm font-black text-slate-800">{label}</p>{required ? <span className="text-rose-500">*</span> : null}</div><p className="mt-1 text-xs leading-6 text-slate-500">حداکثر ۵ مگابایت · فقط JPG یا PNG</p>{error ? <p role="alert" className="mt-1 text-xs font-bold text-rose-600">{error}</p> : null}<div className="mt-2 flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={() => inputRef.current?.click()} className="rounded-lg bg-sky-50 px-3 py-2 text-xs font-black text-rc-blue transition hover:bg-sky-100 disabled:opacity-50">{value ? 'تغییر تصویر' : 'انتخاب تصویر'}</button>{value ? <button type="button" disabled={busy} onClick={onRemove} className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-black text-rose-700 transition hover:bg-rose-100 disabled:opacity-50">حذف</button> : null}</div></div>
    </div>
    <input ref={inputRef} className="sr-only" type="file" accept={DOCUMENT_ACCEPT} onChange={(event) => { const file = event.target.files?.[0]; if (file) { const nextError = validateIdentityImage(file); setError(nextError ?? ''); if (!nextError) { setPreviewFailed(false); onSelect(file) } } event.currentTarget.value = '' }} />
  </div>
}
