import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import type { HomeStatCard } from '@/features/home/homeSectionsApi'
import { useCountUp } from '@/hooks/useCountUp'
import { useInViewOnce } from '@/hooks/useInViewOnce'
import { HomeSection } from './HomeSection'

function StatTile({ card, isEn }: { card: HomeStatCard; isEn: boolean }) {
  const [ref, active] = useInViewOnce(0.2)
  const shown = useCountUp(card.value_num, active)

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 16 }}
      animate={active ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
      transition={{ duration: 0.45 }}
      className="relative overflow-hidden border border-rc-line bg-rc-surface/80 p-5"
    >
      <div className="pointer-events-none absolute -end-6 -top-6 size-20 rounded-full bg-rc-blue/15 blur-2xl" />
      <p className="font-mono text-3xl font-semibold text-rc-blue md:text-4xl" dir="ltr">
        {shown.toLocaleString(isEn ? 'en-US' : 'fa-IR')}
        {card.suffix ?? ''}
      </p>
      <p className="mt-2 text-sm text-rc-muted">{isEn ? card.label_en : card.label_fa}</p>
    </motion.div>
  )
}

export function CompetitionStats({ cards }: { cards: HomeStatCard[] }) {
  const { t, i18n } = useTranslation()
  const isEn = i18n.language.startsWith('en')
  if (!cards.length) return null

  return (
    <HomeSection
      index="02"
      title={t('home.competitionStatsTitle')}
      subtitle={t('home.competitionStatsSubtitle')}
      className="bg-gradient-to-b from-transparent via-rc-navy/40 to-transparent"
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <StatTile key={card.id} card={card} isEn={isEn} />
        ))}
      </div>
    </HomeSection>
  )
}
