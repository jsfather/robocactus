import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

export function Corners({ className = '' }: { className?: string }) {
  return <span className={className} aria-hidden />
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
        'relative rounded-2xl border border-rc-line bg-white/90 shadow-[0_16px_45px_rgb(18_76_98/0.07)]',
        glow ? 'shadow-[0_18px_55px_rgb(36_152_216/0.12)]' : '',
        className,
      ].join(' ')}
    >
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
      <div className="mt-3 h-1 w-12 rounded-full bg-gradient-to-l from-rc-accent to-rc-blue" />
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
      className="group relative block overflow-hidden rounded-2xl border border-rc-line bg-white/90 p-5 shadow-[0_14px_40px_rgb(18_76_98/0.06)] transition hover:-translate-y-1 hover:border-rc-blue/30 hover:shadow-[0_20px_50px_rgb(18_76_98/0.11)]"
    >
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
