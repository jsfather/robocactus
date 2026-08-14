import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

export function Corners({ className = '' }: { className?: string }) {
  return (
    <>
      <span className={`pointer-events-none absolute start-0 top-0 size-3 border-s-2 border-t-2 border-rc-blue/50 ${className}`} />
      <span className={`pointer-events-none absolute end-0 top-0 size-3 border-e-2 border-t-2 border-rc-blue/50 ${className}`} />
      <span className={`pointer-events-none absolute bottom-0 start-0 size-3 border-s-2 border-b-2 border-rc-blue/40 ${className}`} />
      <span className={`pointer-events-none absolute bottom-0 end-0 size-3 border-e-2 border-b-2 border-rc-blue/40 ${className}`} />
    </>
  )
}

export function HudFrame({
  children,
  className = '',
  glow = false,
}: {
  children: ReactNode
  className?: string
  glow?: boolean
}) {
  return (
    <div
      className={[
        'relative border border-rc-line bg-rc-surface/90',
        glow ? 'shadow-[0_0_40px_-12px_var(--rc-glow-blue)]' : '',
        className,
      ].join(' ')}
    >
      <Corners />
      {children}
    </div>
  )
}

export function SectionLabel({
  index,
  title,
  hint,
}: {
  index?: string
  title: string
  hint?: string
}) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-3">
        {index ? (
          <span className="font-mono text-[10px] tracking-[0.28em] text-rc-blue uppercase">{index}</span>
        ) : null}
        <h2 className="text-lg font-semibold tracking-tight md:text-xl">{title}</h2>
      </div>
      {hint ? <p className="mt-1 text-sm text-rc-muted">{hint}</p> : null}
      <div className="mt-3 h-px w-full bg-gradient-to-l from-rc-blue/50 via-rc-line to-transparent" />
    </div>
  )
}

export function StatCard({
  label,
  value,
  hint,
  accent = 'blue',
  index,
}: {
  label: string
  value: string | number
  hint?: string
  accent?: 'blue' | 'orange' | 'green' | 'red'
  index?: string
}) {
  const accentBar =
    accent === 'orange'
      ? 'from-rc-accent'
      : accent === 'green'
        ? 'from-emerald-400'
        : accent === 'red'
          ? 'from-red-400'
          : 'from-rc-blue'

  return (
    <HudFrame className="overflow-hidden p-4">
      <span className={`absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r ${accentBar} to-transparent opacity-80`} />
      {index ? (
        <p className="mb-2 font-mono text-[10px] tracking-[0.22em] text-rc-muted uppercase">{index}</p>
      ) : null}
      <p className="font-mono text-[10px] tracking-[0.18em] text-rc-muted uppercase">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
      {hint ? <p className="mt-1 text-xs text-rc-muted">{hint}</p> : null}
    </HudFrame>
  )
}

export function QuickAction({
  to,
  title,
  description,
  accent = 'blue',
  index,
  cta,
}: {
  to: string
  title: string
  description?: string
  accent?: 'blue' | 'orange'
  index?: string
  cta: string
}) {
  return (
    <Link
      to={to}
      className="group relative block overflow-hidden border border-rc-line bg-rc-surface/80 p-4 transition hover:border-rc-blue/50 hover:bg-rc-hover"
    >
      <Corners />
      <span
        className={[
          'absolute inset-x-0 top-0 h-0.5 opacity-80',
          accent === 'orange'
            ? 'bg-gradient-to-r from-rc-accent to-transparent'
            : 'bg-gradient-to-r from-rc-blue to-transparent',
        ].join(' ')}
      />
      {index ? (
        <p className="font-mono text-[10px] tracking-[0.22em] text-rc-blue uppercase">{index}</p>
      ) : null}
      <p className="mt-1 text-base font-semibold">{title}</p>
      {description ? <p className="mt-2 text-sm leading-relaxed text-rc-muted">{description}</p> : null}
      <p className="mt-3 font-mono text-[11px] tracking-wide text-rc-blue group-hover:underline">
        {cta} →
      </p>
    </Link>
  )
}
