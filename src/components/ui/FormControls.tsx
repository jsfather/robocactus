import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  children: ReactNode
}

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    'rounded-xl bg-gradient-to-l from-[#087eb8] to-[#0b9b65] text-white shadow-[0_10px_28px_rgb(8_126_184/0.2)] hover:-translate-y-0.5 hover:shadow-[0_14px_34px_rgb(8_126_184/0.28)] disabled:opacity-50 disabled:hover:translate-y-0',
  secondary:
    'rounded-xl border border-sky-200 bg-sky-50 text-rc-blue shadow-sm hover:bg-sky-100 disabled:opacity-50',
  ghost: 'rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50',
  danger:
    'rounded-xl border border-red-200 bg-red-50 text-red-700 shadow-sm hover:bg-red-100 disabled:opacity-50',
}

export function Button({
  variant = 'primary',
  className = '',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center gap-2 px-5 py-2.5 text-sm font-bold transition duration-200 ${buttonVariants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
}

export function Input({ label, error, id, className = '', ...props }: InputProps) {
  const inputId = id ?? props.name
  return (
    <label className="group block space-y-2" htmlFor={inputId}>
      <span className="text-[13px] font-bold text-slate-600 transition group-focus-within:text-rc-blue">{label}</span>
      <input
        id={inputId}
        className={`min-h-12 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-300 focus:border-sky-400 focus:ring-4 focus:ring-sky-100 ${className}`}
        {...props}
      />
      {error ? <span className="block text-xs text-red-400">{error}</span> : null}
    </label>
  )
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string
  error?: string
}

export function Textarea({ label, error, id, className = '', ...props }: TextareaProps) {
  const inputId = id ?? props.name
  return (
    <label className="group block space-y-2" htmlFor={inputId}>
      <span className="text-[13px] font-bold text-slate-600 transition group-focus-within:text-rc-blue">{label}</span>
      <textarea
        id={inputId}
        className={`min-h-28 w-full resize-y rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm leading-7 text-slate-800 outline-none transition placeholder:text-slate-300 focus:border-sky-400 focus:ring-4 focus:ring-sky-100 ${className}`}
        {...props}
      />
      {error ? <span className="block text-xs text-red-400">{error}</span> : null}
    </label>
  )
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string
  error?: string
  children: ReactNode
}

export function Select({ label, error, id, className = '', children, ...props }: SelectProps) {
  const inputId = id ?? props.name
  return (
    <label className="group block space-y-2" htmlFor={inputId}>
      <span className="text-[13px] font-bold text-slate-600 transition group-focus-within:text-rc-blue">{label}</span>
      <select
        id={inputId}
        className={`min-h-12 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100 ${className}`}
        {...props}
      >
        {children}
      </select>
      {error ? <span className="block text-xs text-red-400">{error}</span> : null}
    </label>
  )
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <div role="alert" className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-gradient-to-l from-rose-50 to-white px-4 py-3.5 text-sm text-rose-800 shadow-sm"><span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-rose-100 font-black text-rose-700">!</span><p className="pt-1 font-bold leading-6">{message}</p></div>
}

export function PanelCard({
  title,
  description,
  children,
  actions,
}: {
  title: string
  description?: string
  children: ReactNode
  actions?: ReactNode
}) {
  return (
    <section className="panel-surface relative overflow-hidden rounded-[1.5rem] border border-white/80 bg-white/92 p-5 shadow-[0_16px_50px_rgb(18_76_98/0.075)] backdrop-blur-sm sm:p-6">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-l from-transparent via-rc-blue/50 to-transparent"
        aria-hidden
      />
      <div className="panel-card-heading -mx-5 -mt-5 mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-gradient-to-l from-slate-50/90 to-white px-5 py-4 sm:-mx-6 sm:-mt-6 sm:px-6">
        <div className="flex items-start gap-3"><span className="mt-1 h-9 w-1 rounded-full bg-gradient-to-b from-rc-blue to-emerald-400" /><div>
          <h2 className="text-lg font-black tracking-tight text-slate-800">{title}</h2>
          {description ? <p className="mt-1.5 text-sm leading-6 text-slate-500">{description}</p> : null}
        </div></div>
        {actions}
      </div>
      {children}
    </section>
  )
}

export function StatusBadge({
  status,
  label,
}: {
  status: string
  label: string
}) {
  const colors: Record<string, string> = {
    draft: 'border-slate-200 bg-slate-50 text-slate-600',
    submitted: 'border-sky-200 bg-sky-50 text-sky-700',
    under_review: 'border-amber-200 bg-amber-50 text-amber-700',
    approved: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    rejected: 'border-red-200 bg-red-50 text-red-700',
    waitlisted: 'border-orange-200 bg-orange-50 text-orange-700',
  }
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-extrabold ${colors[status] ?? colors.draft}`}
    >
      {label}
    </span>
  )
}
