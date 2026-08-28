import { motion, useReducedMotion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import type { HomeStatCard } from '@/features/home/homeSectionsApi'
import { useCountUp } from '@/hooks/useCountUp'
import { useInViewOnce } from '@/hooks/useInViewOnce'

function StatValue({ card, locale, maxValue }: { card: HomeStatCard; locale: string; maxValue: number }) {
  const [ref, active] = useInViewOnce(0.25)
  const reducedMotion = useReducedMotion()
  const shown = useCountUp(card.value_num, active)
  const ratio = Math.max(6, Math.round((card.value_num / Math.max(1, maxValue)) * 100))
  return <motion.li ref={ref} initial={reducedMotion ? false : { opacity: 0, y: 8 }} animate={active ? { opacity: 1, y: 0 } : undefined} transition={{ duration: .3 }} className="relative min-w-0 border-b border-slate-200 py-5 last:border-b-0 sm:border-b-0 sm:border-e sm:px-6 sm:first:ps-0 sm:last:border-e-0 sm:last:pe-0">
    <div className="flex items-baseline gap-1.5" dir="ltr"><strong className="text-3xl font-black tracking-[-.04em] text-slate-900 sm:text-4xl tabular-nums">{shown.toLocaleString(locale)}</strong>{card.suffix ? <span className="text-sm font-bold text-rc-blue">{card.suffix}</span> : null}</div>
    <p className="mt-1.5 text-sm font-semibold leading-6 text-slate-600">{locale === 'en-US' ? card.label_en : card.label_fa}</p>
    <span className="absolute inset-x-0 bottom-0 h-0.5 bg-slate-100" aria-hidden="true"><motion.span className="block h-full bg-rc-blue" initial={{ width: 0 }} animate={active ? { width: `${ratio}%` } : undefined} transition={{ duration: .45 }} /></span>
  </motion.li>
}

export function CompetitionStats({ cards }: { cards: HomeStatCard[] }) {
  const { t, i18n } = useTranslation()
  if (!cards.length) return null
  const locale = i18n.language.startsWith('en') ? 'en-US' : 'fa-IR'
  const maxValue = Math.max(...cards.map((card) => card.value_num), 1)
  return <section className="py-12 sm:py-16" aria-labelledby="competition-stats-title"><div className="mx-auto max-w-7xl px-4 sm:px-8">
    <div className="grid gap-6 border-y border-slate-300 py-7 lg:grid-cols-[minmax(15rem,.8fr)_2fr] lg:items-center lg:gap-10">
      <div><p className="text-xs font-black uppercase tracking-[.16em] text-rc-blue">{t('home.statsEyebrow')}</p><h2 id="competition-stats-title" className="mt-2 text-2xl font-black leading-tight text-slate-900 sm:text-3xl">{t('home.competitionStatsTitle')}</h2><p className="mt-3 max-w-md text-sm leading-7 text-slate-600">{t('home.competitionStatsSubtitle')}</p></div>
      <ul className={`grid sm:grid-cols-2 ${cards.length >= 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>{cards.map((card) => <StatValue key={card.id} card={card} locale={locale} maxValue={maxValue} />)}</ul>
    </div>
  </div></section>
}
