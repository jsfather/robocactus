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
    'rounded-lg bg-rc-accent text-white shadow-sm hover:brightness-110 disabled:opacity-50',
  secondary:
    'rounded-lg border border-rc-blue/40 bg-rc-blue/10 text-rc-blue hover:bg-rc-blue/20 disabled:opacity-50',
  ghost: 'rounded-lg text-rc-muted hover:bg-rc-hover hover:text-rc-text disabled:opacity-50',
  danger:
    'rounded-lg border border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20 disabled:opacity-50',
}

export function Button({
  variant = 'primary',
  className = '',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition ${buttonVariants[variant]} ${className}`}
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
    <label className="block space-y-1.5" htmlFor={inputId}>
      <span className="text-sm text-rc-muted">{label}</span>
      <input
        id={inputId}
        className={`w-full rounded-md border border-rc-line bg-rc-surface px-3 py-2.5 text-rc-text outline-none transition placeholder:text-rc-muted/60 focus:border-rc-blue/50 focus:ring-1 focus:ring-rc-blue/40 ${className}`}
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
    <label className="block space-y-1.5" htmlFor={inputId}>
      <span className="text-sm text-rc-muted">{label}</span>
      <textarea
        id={inputId}
        className={`min-h-24 w-full rounded-md border border-rc-line bg-rc-surface px-3 py-2.5 text-rc-text outline-none transition placeholder:text-rc-muted/60 focus:border-rc-blue/50 focus:ring-1 focus:ring-rc-blue/40 ${className}`}
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
    <label className="block space-y-1.5" htmlFor={inputId}>
      <span className="text-sm text-rc-muted">{label}</span>
      <select
        id={inputId}
        className={`w-full rounded-md border border-rc-line bg-rc-navy px-3 py-2.5 text-rc-text outline-none transition focus:border-rc-blue/50 focus:ring-1 focus:ring-rc-blue/40 ${className}`}
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
  return <p className="text-sm text-red-400">{message}</p>
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
    <section className="relative overflow-hidden border border-rc-line bg-rc-surface/90 p-5 shadow-[inset_0_1px_0_0_rgba(56,189,248,0.12)] backdrop-blur-sm">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-l from-transparent via-rc-blue/50 to-transparent"
        aria-hidden
      />
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-rc-text">{title}</h2>
          {description ? <p className="mt-1 text-sm text-rc-muted">{description}</p> : null}
        </div>
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
    draft: 'border-white/20 bg-white/5 text-rc-muted',
    submitted: 'border-rc-blue/40 bg-rc-blue/10 text-rc-blue',
    under_review: 'border-amber-500/40 bg-amber-500/10 text-amber-200',
    approved: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
    rejected: 'border-red-500/40 bg-red-500/10 text-red-300',
    waitlisted: 'border-rc-orange/40 bg-rc-orange/10 text-rc-orange',
  }
  return (
    <span
      className={`inline-flex rounded-md border px-2 py-0.5 font-mono text-xs ${colors[status] ?? colors.draft}`}
    >
      {label}
    </span>
  )
}
