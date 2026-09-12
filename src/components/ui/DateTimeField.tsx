import { useMemo, type ComponentType } from 'react'
import { useTranslation } from 'react-i18next'
import Rmdp from 'react-multi-date-picker'
import TimePickerMod from 'react-multi-date-picker/plugins/time_picker'
import persian from 'react-date-object/calendars/persian'
import persian_fa from 'react-date-object/locales/persian_fa'
import gregorian from 'react-date-object/calendars/gregorian'
import gregorian_en from 'react-date-object/locales/gregorian_en'

type DateObjectParts = {
  year: number
  month: number | { number: number }
  day: number
  hour: number
  minute: number
  second: number
  millisecond: number
}
type DateObjectInstance = {
  toDate: () => Date
  convert: (calendar: unknown, locale?: unknown) => DateObjectInstance
  toObject: () => DateObjectParts
}
type DateObjectCtor = new (args: Record<string, unknown>) => DateObjectInstance

const TEHRAN_TIME_ZONE = 'Asia/Tehran'
const TEHRAN_OFFSET_MINUTES = 210

function tehranParts(value: string): { year: number; month: number; day: number; hour: number; minute: number; second: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (match) {
    return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]), hour: 0, minute: 0, second: 0 }
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TEHRAN_TIME_ZONE,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]))
  return values.year && values.month && values.day
    ? { year: values.year, month: values.month, day: values.day, hour: values.hour || 0, minute: values.minute || 0, second: values.second || 0 }
    : null
}

function isReactComponent(v: unknown): boolean {
  return typeof v === 'function' || !!(v as { $$typeof?: unknown })?.$$typeof
}

/**
 * Vite/ESM interop for react-multi-date-picker (CJS) often yields the module
 * object instead of the component — dig out `.default` until we find a component.
 */
function resolvePicker(mod: unknown): ComponentType<any> {
  let cur: any = mod
  for (let i = 0; i < 4; i++) {
    if (isReactComponent(cur) && !cur.DateObject) return cur
    if (cur?.default && cur.default !== cur) {
      cur = cur.default
      continue
    }
    break
  }
  if (!isReactComponent(cur)) {
    throw new Error('DatePicker export could not be resolved')
  }
  return cur
}

function resolveDateObject(mod: unknown): DateObjectCtor {
  const m: any = mod
  const ctor =
    m?.DateObject ?? m?.default?.DateObject ?? m?.default?.default?.DateObject
  if (typeof ctor !== 'function') {
    throw new Error('DateObject export could not be resolved')
  }
  return ctor as DateObjectCtor
}

function resolvePlugin(mod: unknown): ComponentType<any> {
  let cur: any = mod
  for (let i = 0; i < 3; i++) {
    if (isReactComponent(cur)) return cur
    if (cur?.default && cur.default !== cur) {
      cur = cur.default
      continue
    }
    break
  }
  if (!isReactComponent(cur)) {
    throw new Error('TimePicker export could not be resolved')
  }
  return cur
}

const DatePicker = resolvePicker(Rmdp)
const DateObject = resolveDateObject(Rmdp)
const TimePicker = resolvePlugin(TimePickerMod)

type Props = {
  label: string
  value: string | null | undefined
  onChange: (iso: string | null) => void
  withTime?: boolean
  error?: string
  required?: boolean
  name?: string
}

export function DateTimeField({ label, value, onChange, withTime = true, error, required, name }: Props) {
  const { i18n } = useTranslation()
  const isFa = i18n.language.toLowerCase().startsWith('fa')

  const calendar = isFa ? persian : gregorian
  const locale = isFa ? persian_fa : gregorian_en

  const plugins = useMemo(() => {
    if (!withTime) return []
    return [<TimePicker key="time" position="bottom" hideSeconds />]
  }, [withTime])

  const pickerValue = useMemo(() => {
    if (!value) return undefined
    try {
      const parts = tehranParts(value)
      if (!parts) return undefined
      const tehranDate = new DateObject({ ...parts, calendar: gregorian, locale: gregorian_en })
      return tehranDate.convert(calendar, locale)
    } catch {
      return undefined
    }
  }, [value, calendar, locale])

  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-bold text-slate-600">{label}{required ? <b className="ms-1 text-rose-500">*</b> : null}</span>
      <DatePicker
        value={pickerValue}
        onChange={(date: unknown) => {
          try {
            if (!date) {
              onChange(null)
              return
            }
            const obj = (Array.isArray(date) ? date[0] : date) as DateObjectInstance | null
            if (!obj || typeof obj.toDate !== 'function') {
              onChange(null)
              return
            }
            const gregorianDate = obj.convert(gregorian, gregorian_en)
            const parts = gregorianDate.toObject()
            const month = typeof parts.month === 'number' ? parts.month : parts.month.number
            if (!Number.isFinite(parts.year) || !Number.isFinite(month) || !Number.isFinite(parts.day)) {
              onChange(null)
              return
            }
            const utcMillis = Date.UTC(parts.year, month - 1, parts.day, parts.hour || 0, parts.minute || 0, parts.second || 0, parts.millisecond || 0) - TEHRAN_OFFSET_MINUTES * 60_000
            onChange(new Date(utcMillis).toISOString())
          } catch {
            onChange(null)
          }
        }}
        calendar={calendar}
        locale={locale}
        format={
          withTime
            ? isFa
              ? 'YYYY/MM/DD HH:mm'
              : 'YYYY-MM-DD HH:mm'
            : isFa
              ? 'YYYY/MM/DD'
              : 'YYYY-MM-DD'
        }
        calendarPosition={isFa ? 'bottom-right' : 'bottom-left'}
        headerOrder={['MONTH_YEAR', 'LEFT_BUTTON', 'RIGHT_BUTTON']}
        showOtherDays
        name={name}
        plugins={plugins}
        containerClassName="w-full"
        inputClass={`min-h-12 w-full rounded-xl border bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:ring-4 ${error ? 'border-rose-400 focus:ring-rose-100' : 'border-slate-200 focus:border-sky-400 focus:ring-sky-100'}`}
        style={{ width: '100%', background: 'transparent' }}
      />
      {error ? <span className="block text-xs text-red-400">{error}</span> : null}
    </label>
  )
}
