import { motion, useReducedMotion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import type { HomeStatCard } from '@/features/home/homeSectionsApi'
import { useCountUp } from '@/hooks/useCountUp'
import { useInViewOnce } from '@/hooks/useInViewOnce'

const icons = [
  <><circle cx="12" cy="8" r="3" /><path d="M5 20a7 7 0 0 1 14 0" /></>,
  <><rect x="6" y="3" width="12" height="18" rx="2" /><path d="M9 7h6M9 11h6M9 15h4" /></>,
  <><path d="M8 4h8v4a4 4 0 0 1-8 0V4Z" /><path d="M8 6H4v1a4 4 0 0 0 4 4M16 6h4v1a4 4 0 0 1-4 4M12 12v4M8 20h8" /></>,
  <><path d="M4 19V9l8-5 8 5v10" /><path d="M8 19v-6h8v6M3 20h18" /></>,
]

function StatCard({ card, locale, index }: { card: HomeStatCard; locale: string; index: number }) {
  const [ref, active] = useInViewOnce(0.2)
  const reducedMotion = useReducedMotion()
  const value = useCountUp(card.value_num, active)
  const ratio = 100
  const blue = index % 2 === 0
  return <motion.li ref={ref} initial={reducedMotion ? false : { opacity: 0, y: 12 }} animate={active ? { opacity: 1, y: 0 } : undefined} transition={{ duration: .4, delay: index * .05 }} className="relative pb-3">
    <span className="absolute inset-x-5 bottom-0 h-8 rounded-[1.5rem] bg-slate-200/70" aria-hidden="true" style={{ opacity: ratio / 100 }} />
    <article className="relative flex min-h-28 items-center gap-4 rounded-[1.65rem] bg-white px-5 py-4 shadow-[0_18px_42px_rgb(15_23_42/0.07)] sm:px-6">
      <div className="min-w-0 flex-1"><p className="text-sm font-bold leading-6 text-slate-500">{locale === 'en-US' ? card.label_en : card.label_fa}</p></div>
      <span className={`grid size-12 shrink-0 place-items-center rounded-full text-white shadow-[0_10px_25px_rgb(8_126_184/0.18)] ${blue ? 'bg-rc-blue' : 'bg-rc-accent'}`}><svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icons[index % icons.length]}</svg></span>
      <div className="flex shrink-0 items-baseline gap-1" dir="ltr"><strong className="text-3xl font-black tracking-[-.04em] text-slate-950 tabular-nums">{value.toLocaleString(locale)}</strong>{card.suffix ? <span className={`text-xs font-black ${blue ? 'text-rc-blue' : 'text-rc-accent'}`}>{card.suffix}</span> : null}</div>
    </article>
  </motion.li>
}

export function CompetitionStats({ cards }: { cards: HomeStatCard[] }) {
  const { t, i18n } = useTranslation()
  if (!cards.length) return null
  const locale = i18n.language.startsWith('en') ? 'en-US' : 'fa-IR'
  return <section className="bg-slate-50 py-16 sm:py-20" aria-labelledby="stats-heading"><div className="mx-auto max-w-7xl px-4 sm:px-8">
    <header className="mb-9 text-center"><h2 id="stats-heading" className="text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">{t('home.competitionStatsTitle')}</h2><p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-slate-500">{t('home.competitionStatsSubtitle')}</p><div className="mx-auto mt-4 flex w-fit gap-1" aria-hidden="true">{Array.from({ length: 3 }, (_, i) => <span key={i} className={`size-1.5 rounded-full ${i === 1 ? 'bg-rc-accent' : 'bg-rc-blue/25'}`} />)}</div></header>
    <ul className={`grid gap-5 sm:grid-cols-2 ${cards.length === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>{cards.map((card, index) => <StatCard key={card.id} card={card} locale={locale} index={index} />)}</ul>
  </div></section>
}
