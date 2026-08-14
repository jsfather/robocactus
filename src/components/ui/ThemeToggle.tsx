import { useTheme } from '@/hooks/useTheme'

/** Compact sun/moon theme switch used in public header and panel chrome. */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Light' : 'Dark'}
      className={[
        'relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border border-rc-line transition',
        isDark ? 'bg-rc-navy' : 'bg-amber-100/80',
        className,
      ].join(' ')}
    >
      <span
        className={[
          'absolute top-0.5 flex size-7 items-center justify-center rounded-full shadow transition-all duration-300',
          isDark
            ? 'left-0.5 bg-slate-800 text-amber-200'
            : 'left-[1.65rem] bg-white text-amber-500',
        ].join(' ')}
      >
        {isDark ? (
          <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor" aria-hidden>
            <path d="M21 14.3A8.5 8.5 0 0 1 9.7 3a7 7 0 1 0 11.3 11.3Z" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor" aria-hidden>
            <circle cx="12" cy="12" r="4" />
            <path
              d="M12 2v2.5M12 19.5V22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M2 12h2.5M19.5 12H22M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              fill="none"
            />
          </svg>
        )}
      </span>
    </button>
  )
}
