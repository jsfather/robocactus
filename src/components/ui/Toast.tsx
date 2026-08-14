import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type ToastKind = 'success' | 'error' | 'info'

type ToastItem = {
  id: number
  kind: ToastKind
  message: string
}

type ToastCtx = {
  push: (message: string, kind?: ToastKind) => void
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
}

const ToastContext = createContext<ToastCtx | null>(null)

let seq = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])

  const push = useCallback((message: string, kind: ToastKind = 'info') => {
    const id = ++seq
    setItems((prev) => [...prev, { id, kind, message }])
    window.setTimeout(() => {
      setItems((prev) => prev.filter((x) => x.id !== id))
    }, 3800)
  }, [])

  const value = useMemo(
    () => ({
      push,
      success: (m: string) => push(m, 'success'),
      error: (m: string) => push(m, 'error'),
      info: (m: string) => push(m, 'info'),
    }),
    [push],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 start-4 z-[100] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2">
        {items.map((item) => (
          <div
            key={item.id}
            className={[
              'pointer-events-auto border px-3 py-2.5 text-sm shadow-lg backdrop-blur-md',
              item.kind === 'success'
                ? 'border-emerald-500/40 bg-emerald-950/90 text-emerald-100'
                : item.kind === 'error'
                  ? 'border-red-500/40 bg-red-950/90 text-red-100'
                  : 'border-rc-blue/40 bg-rc-navy/95 text-rc-text',
            ].join(' ')}
          >
            <p className="font-mono text-[9px] tracking-[0.2em] text-rc-muted uppercase">
              {item.kind === 'success' ? 'OK' : item.kind === 'error' ? 'ERR' : 'SYS'}
            </p>
            <p className="mt-0.5">{item.message}</p>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    return {
      push: () => undefined,
      success: () => undefined,
      error: () => undefined,
      info: () => undefined,
    }
  }
  return ctx
}
