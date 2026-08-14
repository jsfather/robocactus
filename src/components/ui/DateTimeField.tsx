import { useMemo, type ComponentType } from 'react'
import { useTranslation } from 'react-i18next'
import Rmdp from 'react-multi-date-picker'
import TimePickerMod from 'react-multi-date-picker/plugins/time_picker'
import persian from 'react-date-object/calendars/persian'
import persian_fa from 'react-date-object/locales/persian_fa'
import gregorian from 'react-date-object/calendars/gregorian'
import gregorian_en from 'react-date-object/locales/gregorian_en'

type DateObjectInstance = { toDate: () => Date }
type DateObjectCtor = new (args: Record<string, unknown>) => DateObjectInstance

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
}

export function DateTimeField({ label, value, onChange, withTime = true, error }: Props) {
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
      const d = new Date(value)
      if (Number.isNaN(d.getTime())) return undefined
      return new DateObject({ date: d, calendar, locale })
    } catch {
      return undefined
    }
  }, [value, calendar, locale])

  return (
    <label className="block space-y-1.5">
      <span className="text-sm text-rc-muted">{label}</span>
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
            const js = obj.toDate()
            if (!(js instanceof Date) || Number.isNaN(js.getTime())) {
              onChange(null)
              return
            }
            onChange(js.toISOString())
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
        plugins={plugins}
        containerClassName="w-full"
        inputClass="w-full rounded-lg border border-rc-line bg-rc-surface px-3 py-2.5 text-rc-text outline-none transition placeholder:text-rc-muted/60 focus:border-rc-blue/50 focus:ring-1 focus:ring-rc-blue/40"
        style={{ width: '100%', background: 'transparent' }}
      />
      {error ? <span className="block text-xs text-red-400">{error}</span> : null}
    </label>
  )
}
