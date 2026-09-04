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
        'panel-surface relative overflow-hidden rounded-xl border border-slate-200 bg-white',
        glow ? 'ring-1 ring-emerald-100' : '',
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
    <div className="mb-4 flex items-start gap-3" data-index={index}>
      <span className="mt-1 h-6 w-0.5 shrink-0 bg-emerald-500" />
      <div>
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-black tracking-tight text-slate-800 md:text-xl">{title}</h2>
      </div>
      {hint ? <p className="mt-1 text-sm leading-6 text-slate-500">{hint}</p> : null}
      </div>
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
    <HudFrame className="group min-h-28 overflow-hidden p-4 transition hover:border-slate-300">
      <span className={`absolute inset-x-0 top-0 h-0.5 bg-gradient-to-l ${accentBar} to-transparent opacity-90`} />
      <div className="flex items-start justify-between gap-3"><p className="text-xs font-bold leading-5 text-slate-500">{label}</p>{index ? <span className="font-mono text-[10px] text-slate-400">{index}</span> : null}</div>
      <p className="mt-3 text-2xl font-black tabular-nums tracking-tight text-slate-900">{value}</p>
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
      data-index={index}
      className="group relative block min-h-32 overflow-hidden rounded-xl border border-slate-200 bg-white p-4 transition hover:border-sky-300 hover:bg-sky-50/30"
    >
      <span
        className={[
          'absolute inset-x-0 top-0 h-0.5 opacity-90',
          accent === 'orange'
            ? 'bg-gradient-to-r from-rc-accent to-transparent'
            : 'bg-gradient-to-r from-rc-blue to-transparent',
        ].join(' ')}
      />
      <div className="flex items-start justify-between gap-3"><div><p className="text-base font-black text-slate-800">{title}</p>{description ? <p className="mt-1.5 line-clamp-2 text-sm leading-6 text-slate-500">{description}</p> : null}</div><span className="text-lg text-slate-400 group-hover:text-sky-700">←</span></div>
      <p className="mt-4 text-xs font-black text-sky-700 group-hover:underline">{cta}</p>
    </Link>
  )
}
