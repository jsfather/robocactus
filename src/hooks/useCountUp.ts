import { useEffect, useState } from 'react'
import { useReducedMotion } from 'framer-motion'

/** Animate a number from 0 → target once `active` becomes true. */
export function useCountUp(target: number, active: boolean, durationMs = 1400) {
  const safeTarget = Number.isFinite(Number(target)) ? Number(target) : 0
  const [value, setValue] = useState(0)
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    if (!active) return

    if (reduceMotion) {
      setValue(safeTarget)
      return
    }

    let cancelled = false
    let frame = 0
    const start = performance.now()

    const tick = (now: number) => {
      if (cancelled) return
      const p = Math.min(1, (now - start) / durationMs)
      setValue(Math.round(safeTarget * (1 - Math.pow(1 - p, 3))))
      if (p < 1) frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
    }
  }, [active, safeTarget, durationMs, reduceMotion])

  return value
}
