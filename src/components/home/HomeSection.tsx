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
    <section className={`relative py-16 md:py-20 ${className}`}>
      <div className="mx-auto max-w-6xl px-4">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="mb-10 flex flex-wrap items-end justify-between gap-4"
        >
          <div className="max-w-2xl">
            {index ? (
              <p className="mb-2 font-mono text-[10px] tracking-[0.28em] text-rc-blue uppercase">
                {index}
              </p>
            ) : null}
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">{title}</h2>
            {subtitle ? <p className="mt-3 text-rc-muted">{subtitle}</p> : null}
            <div className="mt-4 h-px max-w-xs bg-gradient-to-l from-rc-blue/60 via-rc-line to-transparent" />
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </motion.div>
        {children}
      </div>
    </section>
  )
}
