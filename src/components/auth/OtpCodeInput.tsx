import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

type OtpState = 'idle' | 'verifying' | 'success' | 'error'

const normalizeDigits = (value: string) => value
  .replace(/[۰-۹]/g, (char) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(char)))
  .replace(/[٠-٩]/g, (char) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(char)))
  .replace(/\D/g, '')

export function OtpCodeInput({ value, onChange, onComplete, state = 'idle', disabled }: {
  value: string
  onChange: (value: string) => void
  onComplete?: (value: string) => void
  state?: OtpState
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const refs = useRef<Array<HTMLInputElement | null>>([])
  const digits = Array.from({ length: 6 }, (_, index) => value[index] ?? '')

  useEffect(() => {
    if (!disabled && !value) refs.current[0]?.focus()
  }, [disabled, value])

  const replaceAt = (index: number, digit: string) => {
    const next = [...digits]
    next[index] = digit
    const completeValue = next.join('').slice(0, 6)
    onChange(completeValue)
    if (completeValue.length === 6) window.setTimeout(() => onComplete?.(completeValue), 120)
    if (digit && index < 5) refs.current[index + 1]?.focus()
  }

  return (
    <fieldset disabled={disabled} className={`rounded-2xl p-1 transition ${state === 'verifying' ? 'bg-[conic-gradient(from_90deg,#0ea5e9,#10b981,#0ea5e9)]' : ''}`}>
      <legend className="sr-only">{t('auth.otpCode')}</legend>
      <div dir="ltr" className={`grid grid-cols-6 gap-2 rounded-[.85rem] bg-white p-1.5 sm:gap-3 ${state === 'success' ? 'otp-success' : state === 'error' ? 'otp-error' : ''}`}>
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(node) => { refs.current[index] = node }}
            aria-label={`${t('auth.otpCode')} ${index + 1}`}
            inputMode="numeric"
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            value={digit}
            maxLength={1}
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => replaceAt(index, normalizeDigits(event.target.value).slice(-1))}
            onKeyDown={(event) => {
              if (event.key === 'Backspace' && !digits[index] && index > 0) {
                replaceAt(index - 1, '')
              } else if (event.key === 'ArrowLeft' && index < 5) refs.current[index + 1]?.focus()
              else if (event.key === 'ArrowRight' && index > 0) refs.current[index - 1]?.focus()
            }}
            onPaste={(event) => {
              const pasted = normalizeDigits(event.clipboardData.getData('text')).slice(0, 6)
              if (!pasted) return
              event.preventDefault()
              onChange(pasted)
              if (pasted.length === 6) window.setTimeout(() => onComplete?.(pasted), 120)
              refs.current[Math.min(pasted.length, 5)]?.focus()
            }}
            className={`aspect-square min-w-0 rounded-xl border text-center text-xl font-black outline-none transition sm:text-2xl ${state === 'success' ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : state === 'error' ? 'border-rose-300 bg-rose-50 text-rose-700' : 'border-slate-200 bg-slate-50 text-slate-900 focus:border-sky-400 focus:bg-white focus:ring-4 focus:ring-sky-100'}`}
          />
        ))}
      </div>
      {state === 'verifying' ? <p className="mt-2 text-center text-xs font-bold text-sky-700">{t('auth.otpVerifying')}</p> : null}
      {state === 'success' ? <p className="mt-2 text-center text-sm font-black text-emerald-700">✓ {t('auth.otpVerified')}</p> : null}
    </fieldset>
  )
}
