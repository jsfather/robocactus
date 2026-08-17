import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import type { HomeStatCard } from '@/features/home/homeSectionsApi'
import { useCountUp } from '@/hooks/useCountUp'
import { useInViewOnce } from '@/hooks/useInViewOnce'

const motifs = [
  <path key="a" d="M7 17 17 7M8 7h9v9" />,
  <path key="b" d="M5 18V9l7-4 7 4v9l-7 4-7-4Zm7-13v17" />,
  <path key="c" d="M6 18c2-5 4-7 6-7s4 2 6 7M9 8a3 3 0 1 0 6 0 3 3 0 0 0-6 0Z" />,
]

function StatItem({ card, isEn, index }: { card: HomeStatCard; isEn: boolean; index: number }) {
  const [ref, active] = useInViewOnce(0.2)
  const shown = useCountUp(card.value_num, active)
  const colors = ['from-sky-500 to-cyan-400', 'from-emerald-500 to-green-400', 'from-teal-500 to-sky-500']
  return (
    <motion.article ref={ref} initial={{ opacity: 0, scale: .96 }} animate={active ? { opacity: 1, scale: 1 } : { opacity: 0, scale: .96 }} transition={{ duration: .45, delay: index * .08 }} className="group relative min-h-64 overflow-hidden rounded-[2rem] bg-white p-7 shadow-[0_22px_65px_rgb(16_84_105/0.09)] sm:p-8">
      <div className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-l ${colors[index % colors.length]}`} />
      <div className={`inline-flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br ${colors[index % colors.length]} text-white shadow-lg`}><svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{motifs[index % motifs.length]}</svg></div>
      <div className="mt-8 flex items-end gap-2" dir="ltr"><strong className="text-5xl font-black tracking-tighter text-slate-800 sm:text-6xl">{shown.toLocaleString(isEn ? 'en-US' : 'fa-IR')}</strong>{card.suffix ? <span className="pb-2 text-xl font-black text-rc-accent">{card.suffix}</span> : null}</div>
      <p className="mt-4 text-base font-bold text-slate-600">{isEn ? card.label_en : card.label_fa}</p>
      <div className="absolute -bottom-16 -end-14 size-40 rounded-full border-[28px] border-sky-50 transition duration-500 group-hover:scale-110 group-hover:border-emerald-50" />
    </motion.article>
  )
}

export function CompetitionStats({ cards }: { cards: HomeStatCard[] }) {
  const { t, i18n } = useTranslation()
  const isEn = i18n.language.startsWith('en')
  if (!cards.length) return null
  return <section className="relative py-24"><div className="mx-auto max-w-7xl px-4 sm:px-8"><div className="mb-12 grid items-end gap-6 lg:grid-cols-[.8fr_1.2fr]"><div><span className="inline-flex rounded-full bg-sky-50 px-4 py-2 text-sm font-bold text-rc-blue">رویداد در یک نگاه</span><h2 className="mt-4 text-3xl font-black text-slate-800 sm:text-5xl">{t('home.competitionStatsTitle')}</h2></div><p className="max-w-2xl text-base leading-8 text-slate-500 lg:justify-self-end">{t('home.competitionStatsSubtitle')}</p></div><div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{cards.map((card, i) => <StatItem key={card.id} card={card} isEn={isEn} index={i} />)}</div></div></section>
}
