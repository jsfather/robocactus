import type { ReactNode } from 'react'
import { motion } from 'framer-motion'

export type HomeSectionIconKey = 'calendar' | 'faq' | 'why' | 'spark' | 'stats' | 'leagues' | 'users' | 'news' | 'announcement' | 'partners'

export function HomeSectionIcon({ icon = 'spark' }: { icon?: HomeSectionIconKey }) {
  if (icon === 'calendar') return <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /></>
  if (icon === 'faq') return <><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 4.3 1.7c-1 .9-1.8 1.3-1.8 2.8M12 16.5h.01" /></>
  if (icon === 'why') return <path d="m12 3 2.3 5 5.4.6-4 3.6 1.1 5.3-4.8-2.7-4.8 2.7 1.1-5.3-4-3.6 5.4-.6L12 3Z" />
  if (icon === 'stats') return <><path d="M5 20V10M12 20V4M19 20v-7" /><path d="M3 20h18" /></>
  if (icon === 'leagues') return <><path d="M8 4h8v4a4 4 0 0 1-8 0V4Z" /><path d="M8 6H4v1a4 4 0 0 0 4 4M16 6h4v1a4 4 0 0 1-4 4M12 12v5M8 20h8" /></>
  if (icon === 'users') return <><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0M15 15a4.5 4.5 0 0 1 5.5 5" /></>
  if (icon === 'news' || icon === 'announcement') return <><path d="M5 4h12a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2V4Z" /><path d="M8 8h8M8 12h8M8 16h5" /></>
  if (icon === 'partners') return <><circle cx="6" cy="7" r="2.5" /><circle cx="18" cy="7" r="2.5" /><circle cx="12" cy="17" r="2.5" /><path d="m8 8.5 2.5 5M16 8.5l-2.5 5M8.5 7h7" /></>
  return <><path d="M12 3v18M3 12h18" /><circle cx="12" cy="12" r="8" /></>
}

export function HomeSectionHeading({ icon, title, subtitle, action, id }: { icon?: HomeSectionIconKey; title: string; subtitle?: string; action?: ReactNode; id?: string }) {
  return <div className="mb-8 flex flex-wrap items-end justify-between gap-3"><div><div className="flex items-center gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-sky-50 to-emerald-50 text-rc-blue"><svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><HomeSectionIcon icon={icon} /></svg></span><h2 id={id} className="text-3xl font-black text-slate-800 md:text-5xl">{title}</h2></div>{subtitle ? <p className="mt-2 text-rc-muted">{subtitle}</p> : null}</div>{action ? <div className="shrink-0">{action}</div> : null}</div>
}

export function HomeSection({ icon = 'spark', title, subtitle, children, className = '', action }: {
  icon?: HomeSectionIconKey
  title: string
  subtitle?: string
  children: ReactNode
  className?: string
  action?: ReactNode
}) {
  return (
    <section className={`relative overflow-hidden py-20 md:py-28 ${className}`}>
      <div className="mx-auto max-w-7xl px-4 sm:px-8">
        <motion.div initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-80px' }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} className="mb-12 flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <div className="flex items-center gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-sky-50 to-emerald-50 text-rc-blue"><svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><HomeSectionIcon icon={icon} /></svg></span><h2 className="text-3xl font-black leading-tight text-slate-800 md:text-5xl">{title}</h2></div>
            {subtitle ? <p className="mt-4 max-w-xl text-base leading-8 text-rc-muted">{subtitle}</p> : null}
            <div className="mt-5 h-1.5 w-16 rounded-full bg-gradient-to-l from-rc-accent to-rc-blue" />
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </motion.div>
        {children}
      </div>
    </section>
  )
}
