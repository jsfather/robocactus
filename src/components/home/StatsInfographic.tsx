import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import type { HomeStats } from '@/features/home/api'
import { useCountUp } from '@/hooks/useCountUp'
import { useInViewOnce } from '@/hooks/useInViewOnce'

function StatCell({ label, value }: { label: string; value: number }) {
  const [ref, active] = useInViewOnce(0.25)
  const shown = useCountUp(value, active)

  return (
    <div ref={ref} className="text-center">
      <p className="font-mono text-3xl font-semibold text-rc-blue md:text-4xl" dir="ltr">
        {shown.toLocaleString()}
      </p>
      <p className="mt-2 text-sm text-rc-muted">{label}</p>
    </div>
  )
}

export function StatsInfographic({ stats }: { stats: HomeStats }) {
  const { t } = useTranslation()
  const [ref, inView] = useInViewOnce(0.15)

  const items = [
    { key: 'teams', value: stats.teams, label: t('home.stats.teams') },
    { key: 'cities', value: stats.cities, label: t('home.stats.cities') },
    { key: 'leagues', value: stats.leagues, label: t('home.stats.leagues') },
    { key: 'seasons', value: stats.seasons, label: t('home.stats.seasons') },
  ] as const

  return (
    <motion.section
      ref={ref}
      initial={{ opacity: 0, y: 16 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
      transition={{ duration: 0.45 }}
      className="border-y border-white/10 bg-rc-navy/40"
    >
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-4 py-12 md:grid-cols-4 md:py-14">
        {items.map((item) => (
          <StatCell key={item.key} label={item.label} value={item.value} />
        ))}
      </div>
    </motion.section>
  )
}
