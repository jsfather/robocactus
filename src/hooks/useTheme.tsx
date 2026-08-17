import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react'

export type AppTheme = 'light'
type ThemeContextValue = { theme: AppTheme; toggleTheme: () => void; setTheme: (theme: AppTheme) => void }
const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const root = document.documentElement
    root.classList.add('light')
    root.classList.remove('dark')
    root.style.colorScheme = 'light'
    try { localStorage.removeItem('robocactus-theme') } catch { /* ignore */ }
  }, [])
  const value = useMemo<ThemeContextValue>(() => ({ theme: 'light', toggleTheme: () => undefined, setTheme: () => undefined }), [])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
