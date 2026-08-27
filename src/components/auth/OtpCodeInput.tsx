import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useTranslation } from 'react-i18next'

type OtpState = 'idle' | 'verifying' | 'success' | 'error'

const OTP_LENGTH = 6
const normalizeDigits = (value: string) => value
  .replace(/[۰-۹]/g, (char) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(char)))
  .replace(/[٠-٩]/g, (char) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(char)))
  .replace(/\D/g, '')

function SuccessMark({ reducedMotion }: { reducedMotion: boolean }) {
  const particles = Array.from({ length: 6 }, (_, index) => {
    const angle = (Math.PI * 2 * index) / 6
    return { x: Math.cos(angle) * 46, y: Math.sin(angle) * 46 }
  })
  return <motion.div className="absolute inset-0 z-20 grid place-items-center" initial={{ opacity: 0, scale: reducedMotion ? 1 : .65 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 20 }}>
    <motion.span className="absolute size-20 rounded-full bg-emerald-300/25 blur-xl" initial={{ scale: .4, opacity: 0 }} animate={{ scale: [0.5, 1.35, 1], opacity: [0, .8, .35] }} transition={{ duration: reducedMotion ? .2 : .65 }} aria-hidden="true" />
    {!reducedMotion ? particles.map((particle, index) => <motion.span key={index} className="absolute size-1.5 rounded-full bg-emerald-400" style={{ left: '50%', top: '50%', marginLeft: -3, marginTop: -3 }} initial={{ x: 0, y: 0, opacity: 0, scale: 0 }} animate={{ x: particle.x, y: particle.y, opacity: [0, .8, 0], scale: [0, 1, .4] }} transition={{ duration: .65, delay: .08 + index * .025 }} aria-hidden="true" />) : null}
    <motion.span className="relative grid size-16 place-items-center rounded-full border border-emerald-200 bg-white text-emerald-600 shadow-[0_14px_40px_rgb(16_185_129/0.28)]" initial={{ rotate: reducedMotion ? 0 : -18 }} animate={{ rotate: 0 }}>
      <svg viewBox="0 0 52 52" className="size-10" fill="none" aria-hidden="true"><motion.circle cx="26" cy="26" r="22" stroke="currentColor" strokeWidth="2.5" initial={{ pathLength: 0, opacity: .2 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ duration: reducedMotion ? .15 : .45 }} /><motion.path d="m15 27 7 7 15-17" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: reducedMotion ? .15 : .32, delay: reducedMotion ? 0 : .28 }} /></svg>
    </motion.span>
  </motion.div>
}

export function OtpCodeInput({ value, onChange, onComplete, state = 'idle', disabled }: {
  value: string
  onChange: (value: string) => void
  onComplete?: (value: string) => void
  state?: OtpState
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const reducedMotion = Boolean(useReducedMotion())
  const refs = useRef<Array<HTMLInputElement | null>>([])
  const boxRefs = useRef<Array<HTMLDivElement | null>>([])
  const stageRef = useRef<HTMLDivElement | null>(null)
  const [centerOffsets, setCenterOffsets] = useState<number[]>(Array(OTP_LENGTH).fill(0))
  const [orbiting, setOrbiting] = useState(false)
  const digits = Array.from({ length: OTP_LENGTH }, (_, index) => value[index] ?? '')
  const locked = Boolean(disabled || state === 'verifying' || state === 'success')

  useEffect(() => {
    if (!locked && !value) refs.current[0]?.focus()
  }, [locked, value])

  useLayoutEffect(() => {
    if (state !== 'verifying' && state !== 'success') return
    const measure = () => {
      const stage = stageRef.current?.getBoundingClientRect()
      if (!stage) return
      const center = stage.left + stage.width / 2
      setCenterOffsets(boxRefs.current.map((box) => {
        const rect = box?.getBoundingClientRect()
        return rect ? center - (rect.left + rect.width / 2) : 0
      }))
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [state])

  useEffect(() => {
    if (state !== 'verifying' || reducedMotion) { setOrbiting(false); return }
    const timer = window.setTimeout(() => setOrbiting(true), 380)
    return () => window.clearTimeout(timer)
  }, [reducedMotion, state])

  const replaceAt = (index: number, digit: string) => {
    const next = [...digits]
    next[index] = digit
    const completeValue = next.join('').slice(0, OTP_LENGTH)
    onChange(completeValue)
    if (completeValue.length === OTP_LENGTH) window.setTimeout(() => onComplete?.(completeValue), 120)
    if (digit && index < OTP_LENGTH - 1) refs.current[index + 1]?.focus()
  }

  const animationFor = (index: number) => {
    if (reducedMotion) return state === 'success' ? { opacity: 0, scale: .9 } : { opacity: 1, x: 0, y: 0, rotate: 0, scale: 1 }
    if (state === 'success') return { x: centerOffsets[index], y: 0, rotate: index % 2 ? 25 : -25, scale: .12, opacity: 0 }
    if (state !== 'verifying') return { x: 0, y: 0, rotate: 0, scale: 1, opacity: 1 }
    const center = centerOffsets[index]
    if (!orbiting) return { x: center, y: 0, rotate: (index - 2.5) * 9, scale: .72, opacity: .95 }
    const angle = (Math.PI * 2 * index) / OTP_LENGTH
    const points = [0, 1, 2, 3, 0].map((step) => angle + (Math.PI * 2 * step) / 3)
    return {
      x: points.map((point) => center + Math.cos(point) * 24),
      y: points.map((point) => Math.sin(point) * 18),
      rotate: [0, 110, 230, 360, 0],
      scale: .62,
      opacity: .88,
    }
  }

  return (
    <fieldset disabled={locked} aria-busy={state === 'verifying'} className="min-w-0">
      <legend className="sr-only">{t('auth.otpCode')}</legend>
      <motion.div animate={state === 'error' && !reducedMotion ? { x: [0, -7, 6, -4, 3, 0] } : { x: 0 }} transition={{ duration: .36 }} className={`relative overflow-visible rounded-2xl border p-2 transition-colors duration-300 ${state === 'error' ? 'border-rose-200 bg-rose-50/60' : state === 'success' ? 'border-emerald-200 bg-emerald-50/60' : state === 'verifying' ? 'border-sky-200 bg-gradient-to-r from-sky-50/80 to-emerald-50/80' : 'border-transparent bg-white'}`}>
        <div ref={stageRef} dir="ltr" className="relative grid min-h-16 grid-cols-6 gap-2 sm:min-h-20 sm:gap-3">
          {digits.map((digit, index) => (
            <motion.div key={index} ref={(node) => { boxRefs.current[index] = node }} animate={animationFor(index)} transition={state === 'verifying' && orbiting && !reducedMotion ? { duration: 1.15, ease: 'easeInOut', repeat: Infinity } : { duration: reducedMotion ? .12 : state === 'success' ? .34 : .38, ease: [0.22, 1, 0.36, 1] }} className="relative z-10 min-w-0 will-change-transform">
              <input
                ref={(node) => { refs.current[index] = node }}
                aria-label={`${t('auth.otpCode')} ${index + 1}`}
                inputMode="numeric"
                autoComplete={index === 0 ? 'one-time-code' : 'off'}
                value={digit}
                maxLength={1}
                onFocus={(event) => event.currentTarget.select()}
                onChange={(event) => replaceAt(index, normalizeDigits(event.target.value).slice(-1))}
                onKeyDown={(event) => {
                  if (event.key === 'Backspace') {
                    event.preventDefault()
                    if (digits[index]) replaceAt(index, '')
                    else if (index > 0) { replaceAt(index - 1, ''); refs.current[index - 1]?.focus() }
                  } else if (event.key === 'ArrowLeft' && index > 0) refs.current[index - 1]?.focus()
                  else if (event.key === 'ArrowRight' && index < OTP_LENGTH - 1) refs.current[index + 1]?.focus()
                }}
                onPaste={(event) => {
                  const pasted = normalizeDigits(event.clipboardData.getData('text')).slice(0, OTP_LENGTH)
                  if (!pasted) return
                  event.preventDefault(); onChange(pasted)
                  if (pasted.length === OTP_LENGTH) window.setTimeout(() => onComplete?.(pasted), 120)
                  refs.current[Math.min(pasted.length, OTP_LENGTH - 1)]?.focus()
                }}
                className={`aspect-square w-full min-w-0 rounded-xl border text-center text-xl font-black outline-none transition-colors sm:text-2xl ${state === 'error' ? 'border-rose-300 bg-white text-rose-700' : state === 'verifying' ? 'border-sky-300 bg-white text-sky-700 shadow-md' : 'border-slate-200 bg-slate-50 text-slate-900 focus:border-sky-400 focus:bg-white focus:ring-4 focus:ring-sky-100'}`}
              />
            </motion.div>
          ))}
          <AnimatePresence>{state === 'success' ? <SuccessMark key="success" reducedMotion={reducedMotion} /> : null}</AnimatePresence>
        </div>
      </motion.div>
      <div className="min-h-7 pt-2 text-center" aria-live="polite">
        {state === 'verifying' ? <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs font-bold text-sky-700">{t('auth.otpVerifying')}</motion.p> : null}
        {state === 'success' ? <motion.p initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="text-sm font-black text-emerald-700">{t('auth.otpVerified')}</motion.p> : null}
      </div>
    </fieldset>
  )
}
