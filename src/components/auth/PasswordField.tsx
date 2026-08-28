import { useMemo, useState } from 'react'

export function passwordScore(value: string) {
  return [value.length >= 8, /[a-z]/.test(value), /[A-Z]/.test(value), /\d/.test(value), /[^A-Za-z0-9]/.test(value)].filter(Boolean).length
}
export const isStrongPassword = (value: string) => value.length >= 8 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value)

export function PasswordField({ label, value, onChange, confirmValue, autoComplete = 'new-password', required = true, showStrength = true }: { label: string; value: string; onChange: (value: string) => void; confirmValue?: string; autoComplete?: string; required?: boolean; showStrength?: boolean }) {
  const [visible, setVisible] = useState(false)
  const score = useMemo(() => passwordScore(value), [value])
  const match = confirmValue === undefined ? null : Boolean(value && confirmValue && value === confirmValue)
  const colors = ['bg-rose-500', 'bg-rose-500', 'bg-amber-500', 'bg-sky-500', 'bg-emerald-500', 'bg-emerald-600']
  return <label className="block space-y-2"><span className="text-sm font-bold text-slate-700">{label}</span><span className="relative block"><input type={visible ? 'text' : 'password'} required={required} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} dir="ltr" className={`min-h-12 w-full rounded-xl border bg-white px-4 pe-20 !text-slate-950 caret-sky-600 outline-none transition [-webkit-text-fill-color:#0f172a] focus:ring-4 ${match === true ? 'border-emerald-400 focus:ring-emerald-100' : match === false ? 'border-rose-300 focus:ring-rose-100' : 'border-slate-200 focus:border-sky-400 focus:ring-sky-100'}`} /><button type="button" onClick={() => setVisible((v) => !v)} className="absolute end-2 top-1/2 -translate-y-1/2 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-black text-slate-600">{visible ? 'پنهان' : 'نمایش'}</button>{match === true ? <span className="absolute end-16 top-1/2 -translate-y-1/2 text-emerald-600">✓</span> : null}</span>{showStrength && confirmValue === undefined && value ? <span className="block"><span className="grid grid-cols-5 gap-1">{Array.from({ length: 5 }, (_, index) => <i key={index} className={`h-1.5 rounded-full ${index < score ? colors[score] : 'bg-slate-100'}`} />)}</span><small className="mt-1 block text-xs text-slate-500">حداقل ۸ کاراکتر شامل حرف بزرگ، حرف کوچک و عدد</small></span> : null}</label>
}
