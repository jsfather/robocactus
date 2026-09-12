import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'

export type CityOption = {
  value: string
  label: string
}

type CitySelectProps = {
  label: string
  value: string
  options: CityOption[]
  placeholder: string
  disabled?: boolean
  required?: boolean
  error?: string
  onChange: (value: string) => void
}

type MenuPosition = {
  left: number
  top: number
  width: number
  maxHeight: number
}

/**
 * A searchable, portal-backed city picker. Native select popovers cannot be
 * sized or positioned consistently for a list of 1,000+ cities, especially
 * inside overflow-hidden cards and on small screens.
 */
export function CitySelect({ label, value, options, placeholder, disabled = false, required = false, error, onChange }: CitySelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [position, setPosition] = useState<MenuPosition | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const selected = options.find((option) => option.value === value) ?? (value ? { value, label: value } : null)
  const filteredOptions = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    if (!needle) return options
    return options.filter((option) => option.label.toLocaleLowerCase().includes(needle))
  }, [options, query])

  useEffect(() => {
    if (!open) return
    const updatePosition = () => {
      const button = buttonRef.current
      if (!button) return
      const rect = button.getBoundingClientRect()
      const gap = 8
      const below = window.innerHeight - rect.bottom - gap
      const above = rect.top - gap
      const opensAbove = below < 230 && above > below
      const available = Math.max(140, Math.min(340, opensAbove ? above : below))
      setPosition({
        left: Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8)),
        top: opensAbove ? Math.max(8, rect.top - available) : rect.bottom + gap,
        width: Math.min(rect.width, window.innerWidth - 16),
        maxHeight: available,
      })
    }
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    setQuery('')
    requestAnimationFrame(() => searchRef.current?.focus())
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (!buttonRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false)
    }
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const openMenu = () => {
    if (disabled) return
    setOpen(true)
  }

  const handleButtonKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      openMenu()
    }
  }

  const choose = (next: string) => {
    onChange(next)
    setOpen(false)
    setQuery('')
    requestAnimationFrame(() => buttonRef.current?.focus())
  }

  return (
    <div className="group block space-y-2">
      <span className="text-[13px] font-bold text-slate-600 transition group-focus-within:text-rc-blue">
        {label}{required ? <span className="ms-1 text-rose-500" aria-hidden="true">*</span> : null}
      </span>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-invalid={Boolean(error)}
        className={`flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border bg-white px-4 py-3 text-start text-sm text-slate-800 outline-none transition focus:ring-4 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 ${error ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-100' : 'border-slate-200 focus:border-sky-400 focus:ring-sky-100'}`}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={handleButtonKeyDown}
      >
        <span className={selected ? 'truncate' : 'truncate text-slate-400'}>{selected?.label ?? placeholder}</span>
        <span className={`shrink-0 text-xs text-slate-400 transition ${open ? 'rotate-180' : ''}`} aria-hidden="true">⌄</span>
      </button>
      {error ? <span className="block text-xs text-red-400">{error}</span> : null}
      {open && position && typeof document !== 'undefined' ? createPortal(
        <div
          ref={menuRef}
          role="dialog"
          aria-label={`${label} — انتخاب`}
          dir="rtl"
          className="fixed z-[300] overflow-hidden rounded-xl border border-slate-200 bg-white p-2 text-slate-800 shadow-[0_18px_50px_rgb(15_23_42/0.2)]"
          style={{ left: position.left, top: position.top, width: position.width, maxHeight: position.maxHeight }}
        >
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="جست‌وجوی شهر"
            aria-label="جست‌وجوی شهر"
            className="mb-2 min-h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
          />
          <div role="listbox" aria-label={label} className="min-h-0 overflow-y-auto overscroll-contain" style={{ maxHeight: Math.max(80, position.maxHeight - 62) }}>
            <button type="button" role="option" aria-selected={!value} onClick={() => choose('')} className={`block w-full rounded-lg px-3 py-2 text-start text-sm hover:bg-sky-50 ${!value ? 'bg-sky-50 font-bold text-sky-800' : 'text-slate-500'}`}>{placeholder}</button>
            {filteredOptions.map((option) => (
              <button key={option.value} type="button" role="option" aria-selected={option.value === value} onClick={() => choose(option.value)} className={`block w-full rounded-lg px-3 py-2 text-start text-sm hover:bg-sky-50 ${option.value === value ? 'bg-sky-50 font-bold text-sky-800' : ''}`}>
                {option.label}
              </button>
            ))}
            {!filteredOptions.length ? <p className="px-3 py-4 text-center text-xs text-slate-500">شهری با این عبارت پیدا نشد.</p> : null}
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  )
}
