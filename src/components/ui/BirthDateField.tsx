import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import DateObject from 'react-date-object'
import persian from 'react-date-object/calendars/persian'
import gregorian from 'react-date-object/calendars/gregorian'
import persianFa from 'react-date-object/locales/persian_fa'
import gregorianEn from 'react-date-object/locales/gregorian_en'

type Props = {
  label: string
  value: string | null | undefined
  onChange: (date: string | null) => void
  error?: string
  required?: boolean
  name?: string
  minAge?: number
  maxAge?: number
}

const faMonths = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند']
const enMonths = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export const latinDigits = (value: string) => value.replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))).replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
const ageFromIsoDate = (value?: string | null) => {
  if (!value) return null
  const parsed = new Date(`${latinDigits(value).slice(0, 10)}T12:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return null
  const today = new Date()
  let age = today.getUTCFullYear() - parsed.getUTCFullYear()
  if (today.getUTCMonth() < parsed.getUTCMonth() || (today.getUTCMonth() === parsed.getUTCMonth() && today.getUTCDate() < parsed.getUTCDate())) age -= 1
  return age >= 0 ? age : null
}

export function BirthDateField({ label, value, onChange, error, required, name = 'birth_date', minAge = 3, maxAge = 100 }: Props) {
  const { i18n } = useTranslation()
  const isFa = i18n.language.toLowerCase().startsWith('fa')
  const calendar = isFa ? persian : gregorian
  const locale = isFa ? persianFa : gregorianEn
  const currentYear = new DateObject({ date: new Date(), calendar, locale }).year
  const selected = useMemo(() => {
    if (!value) return null
    const parsed = new Date(`${latinDigits(value).slice(0, 10)}T12:00:00Z`)
    if (Number.isNaN(parsed.getTime())) return null
    return new DateObject({ date: parsed, calendar, locale })
  }, [calendar, locale, value])
  const [parts, setParts] = useState({ year: selected?.year ?? 0, month: selected?.month?.number ?? 0, day: selected?.day ?? 0 })
  useEffect(() => setParts({ year: selected?.year ?? 0, month: selected?.month?.number ?? 0, day: selected?.day ?? 0 }), [selected?.day, selected?.month?.number, selected?.year])
  const { year, month, day } = parts
  const years = useMemo(() => Array.from({ length: maxAge - minAge + 1 }, (_, index) => currentYear - minAge - index), [currentYear, maxAge, minAge])
  const daysInMonth = year && month ? new DateObject({ calendar, locale, year, month, day: 1 }).month.length : 31

  const update = (nextYear: number, nextMonth: number, nextDay: number) => {
    setParts({ year: nextYear, month: nextMonth, day: nextDay })
    if (!nextYear || !nextMonth || !nextDay) {
      return
    }
    const safeDay = Math.min(nextDay, new DateObject({ calendar, locale, year: nextYear, month: nextMonth, day: 1 }).month.length)
    const converted = new DateObject({ calendar, locale, year: nextYear, month: nextMonth, day: safeDay }).convert(gregorian)
    onChange(`${converted.year.toString().padStart(4, '0')}-${converted.month.number.toString().padStart(2, '0')}-${converted.day.toString().padStart(2, '0')}`)
  }
  const selectClass = `min-h-12 w-full rounded-xl border bg-white px-3 py-3 text-sm font-bold text-slate-800 outline-none transition focus:ring-4 ${error ? 'border-rose-400 focus:ring-rose-100' : 'border-slate-200 focus:border-sky-400 focus:ring-sky-100'}`

  return <fieldset className="space-y-2" aria-invalid={Boolean(error)}>
    <legend className="text-[13px] font-bold text-slate-600">{label}{required ? <span className="ms-1 text-rose-500">*</span> : null}</legend>
    <div className="grid grid-cols-[0.8fr_1.35fr_1fr] gap-2" dir={isFa ? 'rtl' : 'ltr'}>
      <label><span className="mb-1 block text-[11px] font-bold text-slate-400">{isFa ? 'روز' : 'Day'}</span><select className={selectClass} value={day || ''} onChange={(event) => update(year, month, Number(event.target.value))} aria-label={isFa ? 'روز تولد' : 'Birth day'}><option value="">—</option>{Array.from({ length: daysInMonth }, (_, index) => index + 1).map((item) => <option key={item} value={item}>{item.toLocaleString(isFa ? 'fa-IR' : 'en-US', { useGrouping: false })}</option>)}</select></label>
      <label><span className="mb-1 block text-[11px] font-bold text-slate-400">{isFa ? 'ماه' : 'Month'}</span><select className={selectClass} value={month || ''} onChange={(event) => update(year, Number(event.target.value), day)} aria-label={isFa ? 'ماه تولد' : 'Birth month'}><option value="">{isFa ? 'انتخاب ماه' : 'Select'}</option>{(isFa ? faMonths : enMonths).map((item, index) => <option key={item} value={index + 1}>{item}</option>)}</select></label>
      <label><span className="mb-1 block text-[11px] font-bold text-slate-400">{isFa ? 'سال' : 'Year'}</span><select className={selectClass} name={name} value={year || ''} onChange={(event) => update(Number(event.target.value), month, day)} aria-label={isFa ? 'سال تولد' : 'Birth year'}><option value="">{isFa ? 'انتخاب سال' : 'Select'}</option>{years.map((item) => <option key={item} value={item}>{item.toLocaleString(isFa ? 'fa-IR' : 'en-US', { useGrouping: false })}</option>)}</select></label>
    </div>
    <p className="text-xs leading-5 text-slate-400">{isFa ? 'سال، ماه و روز را مستقیم انتخاب کنید؛ نیازی به ورق‌زدن تقویم نیست.' : 'Select year, month and day directly—no calendar paging required.'}</p>
    {value ? <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-sky-50 px-3 py-2 text-xs font-bold text-sky-700"><span>{isFa ? 'تاریخ انتخاب‌شده:' : 'Selected date:'} {selected?.format(isFa ? 'YYYY/MM/DD' : 'MMMM DD, YYYY')}</span>{ageFromIsoDate(value) !== null ? <span className="rounded-md bg-white px-2 py-1 text-emerald-700 shadow-sm">{isFa ? `سن: ${ageFromIsoDate(value)?.toLocaleString('fa-IR')} سال` : `Age: ${ageFromIsoDate(value)} years`}</span> : null}</div> : null}
    {error ? <span className="block text-xs text-rose-500">{error}</span> : null}
  </fieldset>
}
