type RegistrationStep = {
  id: string
  label: string
}

export function RegistrationStepper({ steps, currentId, ariaLabel }: { steps: RegistrationStep[]; currentId: string; ariaLabel: string }) {
  const currentIndex = Math.max(0, steps.findIndex((item) => item.id === currentId))
  const progress = steps.length <= 1 ? 100 : Math.round((currentIndex / (steps.length - 1)) * 100)

  return (
    <section className="mt-7 rounded-[1.75rem] border border-sky-100 bg-gradient-to-br from-white via-sky-50/50 to-emerald-50/40 p-4 shadow-[0_16px_45px_rgb(8_126_184/0.08)] sm:p-6" aria-label={ariaLabel}>
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-black text-slate-500">{steps[currentIndex]?.label}</p>
          <p className="mt-1 text-[11px] font-bold text-slate-400">{currentIndex + 1} / {steps.length}</p>
        </div>
        <span className="rounded-full bg-sky-600 px-3 py-1.5 text-xs font-black tabular-nums text-white shadow-lg shadow-sky-200">{progress}%</span>
      </div>

      <div className="relative">
        <div className="absolute inset-x-5 top-5 h-1 overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
          <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-sky-500 transition-[width] duration-500 ease-out" style={{ width: `${progress}%` }} />
        </div>
        <ol className="relative grid" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
          {steps.map((item, index) => {
            const completed = index < currentIndex
            const active = index === currentIndex
            return (
              <li key={item.id} className="flex min-w-0 flex-col items-center px-1 text-center" aria-current={active ? 'step' : undefined}>
                <span className={`relative z-10 grid size-10 place-items-center rounded-full border-2 text-xs font-black transition-all duration-500 ${completed ? 'border-emerald-500 bg-emerald-500 text-white shadow-lg shadow-emerald-200' : active ? 'scale-110 border-sky-500 bg-white text-sky-700 shadow-[0_0_0_6px_rgb(14_165_233/0.12)]' : 'border-slate-200 bg-white text-slate-400'}`}>
                  {completed ? <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg> : String(index + 1).padStart(2, '0')}
                </span>
                <span className={`mt-3 hidden max-w-24 text-[11px] font-black leading-5 transition-colors sm:block ${completed ? 'text-emerald-700' : active ? 'text-sky-800' : 'text-slate-400'}`}>{item.label}</span>
                <span className={`mt-2 size-1.5 rounded-full sm:hidden ${completed ? 'bg-emerald-500' : active ? 'bg-sky-500' : 'bg-slate-300'}`} aria-label={item.label} />
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}
