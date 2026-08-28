import { motion, useReducedMotion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import type { HomeStatCard } from '@/features/home/homeSectionsApi'
import { useCountUp } from '@/hooks/useCountUp'
import { useInViewOnce } from '@/hooks/useInViewOnce'

function Stat({ card, locale, index }: { card: HomeStatCard; locale: string; index: number }) {
  const [ref, active] = useInViewOnce(0.2)
  const reducedMotion = useReducedMotion()
  const value = useCountUp(card.value_num, active)
  const ratio = 100
  return <motion.li ref={ref} initial={reducedMotion ? false : { opacity: 0, y: 10 }} animate={active ? { opacity: 1, y: 0 } : undefined} transition={{ duration: .35, delay: index * .04 }} className="group relative border-t border-slate-200 py-6 sm:border-s sm:border-t-0 sm:px-6 sm:first:border-s-0 sm:first:ps-0">
    <span className="absolute inset-x-0 top-0 h-px origin-start scale-x-0 bg-rc-blue transition-transform duration-300 group-hover:scale-x-100 sm:inset-x-auto sm:inset-y-0 sm:start-0 sm:h-auto sm:w-px" style={{ opacity: ratio / 100 }} aria-hidden="true" />
    <div className="flex items-baseline gap-2" dir="ltr"><strong className="text-[2.5rem] font-black leading-none tracking-[-.05em] text-slate-950 sm:text-5xl tabular-nums">{value.toLocaleString(locale)}</strong>{card.suffix ? <span className="text-sm font-black text-rc-blue">{card.suffix}</span> : null}</div>
    <p className="mt-3 text-sm font-bold leading-6 text-slate-600">{locale === 'en-US' ? card.label_en : card.label_fa}</p>
  </motion.li>
}

export function CompetitionStats({ cards }: { cards: HomeStatCard[] }) {
  const { t, i18n } = useTranslation()
  if (!cards.length) return null
  const locale = i18n.language.startsWith('en') ? 'en-US' : 'fa-IR'
  return <section className="bg-white py-16 sm:py-20" aria-labelledby="stats-heading"><div className="mx-auto max-w-7xl px-4 sm:px-8">
    <header className="mb-10 grid gap-4 md:grid-cols-[.8fr_1.2fr] md:items-end"><div><p className="text-xs font-black tracking-[.14em] text-rc-blue">{t('home.statsEyebrow')}</p><h2 id="stats-heading" className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">{t('home.competitionStatsTitle')}</h2></div><p className="max-w-2xl text-sm leading-7 text-slate-600 md:justify-self-end">{t('home.competitionStatsSubtitle')}</p></header>
    <ul className={`grid sm:grid-cols-2 ${cards.length >= 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>{cards.map((card, index) => <Stat key={card.id} card={card} locale={locale} index={index} />)}</ul>
  </div></section>
}
