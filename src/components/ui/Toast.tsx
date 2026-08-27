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

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((item) => item.id !== id))
  }, [])

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
      <div className="pointer-events-none fixed end-4 top-4 z-[200] flex w-[min(25rem,calc(100vw-2rem))] flex-col gap-3 sm:end-6 sm:top-6">
        {items.map((item) => (
          <div
            key={item.id}
            className={[
              'app-toast pointer-events-auto relative overflow-hidden rounded-2xl border bg-white/95 p-4 text-sm shadow-[0_18px_55px_rgb(15_51_69/0.18)] backdrop-blur-xl',
              item.kind === 'success'
                ? 'border-emerald-200 text-emerald-950'
                : item.kind === 'error'
                  ? 'border-rose-200 text-rose-950'
                  : 'border-sky-200 text-sky-950',
            ].join(' ')}
            role={item.kind === 'error' ? 'alert' : 'status'}
          >
            <div className="flex items-start gap-3">
              <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl text-lg font-black ${item.kind === 'success' ? 'bg-emerald-100 text-emerald-700' : item.kind === 'error' ? 'bg-rose-100 text-rose-700' : 'bg-sky-100 text-sky-700'}`}>
                {item.kind === 'success' ? '✓' : item.kind === 'error' ? '!' : 'i'}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-black">{item.kind === 'success' ? 'عملیات موفق' : item.kind === 'error' ? 'خطا' : 'اطلاع‌رسانی'}</p>
                <p className="mt-1 leading-6 text-slate-600">{item.message}</p>
              </div>
              <button type="button" onClick={() => dismiss(item.id)} className="flex size-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label="بستن اعلان">×</button>
            </div>
            <span className={`toast-progress absolute inset-x-0 bottom-0 h-1 origin-right ${item.kind === 'success' ? 'bg-emerald-500' : item.kind === 'error' ? 'bg-rose-500' : 'bg-sky-500'}`} />
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
