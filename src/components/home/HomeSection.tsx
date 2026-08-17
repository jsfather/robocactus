import type { ReactNode } from 'react'
import { motion } from 'framer-motion'

export function HomeSection({
  index,
  title,
  subtitle,
  children,
  className = '',
  action,
}: {
  index?: string
  title: string
  subtitle?: string
  children: ReactNode
  className?: string
  action?: ReactNode
}) {
  return (
    <section className={`relative overflow-hidden py-20 md:py-28 ${className}`}>
      <div className="mx-auto max-w-7xl px-4 sm:px-8">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="mb-12 flex flex-wrap items-end justify-between gap-6"
        >
          <div className="max-w-2xl">
            {index ? (
              <p className="mb-3 inline-flex rounded-full bg-sky-50 px-3 py-1.5 text-xs font-bold text-rc-blue">
                فصل {index}
              </p>
            ) : null}
            <h2 className="text-3xl font-black leading-tight text-slate-800 md:text-5xl">{title}</h2>
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
