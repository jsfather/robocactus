import type { AttendanceSettings } from '@/features/attendance/api'
import { teamFlowSteps, type TeamFlowStepKey } from '@/features/registration/flowSteps'

export function RegistrationFlowProgress({
  settings,
  activeKey,
  completed = false,
  english = false,
}: {
  settings: AttendanceSettings | null | undefined
  activeKey: TeamFlowStepKey
  completed?: boolean
  english?: boolean
}) {
  const steps = teamFlowSteps(settings)
  const activeIndex = steps.findIndex((step) => step.key === activeKey)
  const stageIndex = completed ? steps.length : Math.max(0, activeIndex)

  return (
    <nav className="overflow-x-auto pb-2" aria-label={english ? 'Registration progress' : 'مراحل ثبت‌نام'}>
      <ol className="flex min-w-[620px] items-start">
        {steps.map((item, index) => {
          const done = index < stageIndex
          const active = !completed && index === stageIndex
          return (
            <li key={item.key} className="relative flex flex-1 flex-col items-center text-center before:absolute before:start-0 before:top-5 before:h-0.5 before:w-full before:bg-slate-200 first:before:start-1/2 first:before:w-1/2 last:before:w-1/2">
              <span aria-current={active ? 'step' : undefined} className={`relative z-10 grid size-10 place-items-center rounded-full border-4 border-white text-sm font-black shadow-sm ${done ? 'bg-emerald-600 text-white' : active ? 'bg-amber-500 text-white' : 'bg-slate-200 text-slate-500'}`}>{done ? '✓' : index + 1}</span>
              <strong className={`mt-2 text-xs ${active ? 'text-slate-900' : 'text-slate-500'}`}>{english ? item.labelEn : item.labelFa}</strong>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
