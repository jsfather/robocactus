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
        'panel-surface relative overflow-hidden rounded-[1.5rem] border border-white/80 bg-white/92 shadow-[0_16px_50px_rgb(18_76_98/0.075)]',
        glow ? 'ring-1 ring-sky-100 shadow-[0_22px_65px_rgb(36_152_216/0.14)]' : '',
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
    <div className="mb-5 flex items-start gap-3">
      <span className="mt-1 grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-sky-50 to-emerald-50 text-xs font-black text-rc-blue">{index?.replace(/\D/g, '').slice(-2) || '•'}</span>
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
    <HudFrame className="group min-h-36 overflow-hidden p-5 transition duration-300 hover:-translate-y-1 hover:shadow-[0_22px_60px_rgb(18_76_98/0.12)]">
      <span className={`absolute inset-y-0 start-0 w-1 bg-gradient-to-b ${accentBar} to-transparent opacity-90`} />
      {index ? (
        <p className="mb-2 font-mono text-[10px] tracking-[0.22em] text-rc-muted uppercase">{index}</p>
      ) : null}
      <div className="flex items-start justify-between gap-3"><p className="text-xs font-bold leading-5 text-slate-500">{label}</p><span className="size-2 rounded-full bg-emerald-400 shadow-[0_0_0_5px_rgb(52_211_153/0.12)]" /></div>
      <p className="mt-4 text-3xl font-black tabular-nums tracking-tight text-slate-900">{value}</p>
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
      className="group relative block min-h-44 overflow-hidden rounded-[1.5rem] border border-white/80 bg-white p-5 shadow-[0_14px_45px_rgb(18_76_98/0.07)] transition duration-300 hover:-translate-y-1 hover:border-sky-200 hover:shadow-[0_24px_60px_rgb(18_76_98/0.13)]"
    >
      <span
        className={[
          'absolute inset-y-0 start-0 w-1 opacity-90',
          accent === 'orange'
            ? 'bg-gradient-to-r from-rc-accent to-transparent'
            : 'bg-gradient-to-r from-rc-blue to-transparent',
        ].join(' ')}
      />
      {index ? (
        <p className="font-mono text-[10px] tracking-[0.22em] text-rc-blue uppercase">{index}</p>
      ) : null}
      <div className="flex items-start justify-between gap-3"><div><p className="text-base font-black text-slate-800">{title}</p>{description ? <p className="mt-2 text-sm leading-7 text-slate-500">{description}</p> : null}</div><span className={`grid size-10 shrink-0 place-items-center rounded-2xl ${accent === 'orange' ? 'bg-emerald-50 text-emerald-600' : 'bg-sky-50 text-rc-blue'}`}>↗</span></div>
      <p className="absolute bottom-5 start-5 text-xs font-black text-rc-blue group-hover:underline">{cta} ←</p>
    </Link>
  )
}
