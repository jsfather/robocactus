import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import type { HomeStatCard } from '@/features/home/homeSectionsApi'
import { useCountUp } from '@/hooks/useCountUp'
import { useInViewOnce } from '@/hooks/useInViewOnce'

const statIcons = [
  <><circle cx="9" cy="9" r="3" /><circle cx="17" cy="8" r="2" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0M14 14a4 4 0 0 1 6.5 3" /></>,
  <><path d="M12 21s7-5.2 7-12a7 7 0 1 0-14 0c0 6.8 7 12 7 12Z" /><circle cx="12" cy="9" r="2.5" /></>,
  <><path d="M8 4h8v4a4 4 0 0 1-8 0V4Z" /><path d="M8 6H4v1a4 4 0 0 0 4 4M16 6h4v1a4 4 0 0 1-4 4M12 12v4M8 20h8" /></>,
  <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16M8 14h3M13 14h3" /></>,
]

function StatItem({ card, isEn, index, maxValue }: { card: HomeStatCard; isEn: boolean; index: number; maxValue: number }) {
  const [ref, active] = useInViewOnce(0.2)
  const shown = useCountUp(card.value_num, active)
  const ratio = Math.max(8, Math.round((card.value_num / Math.max(1, maxValue)) * 100))
  const tones = [
    { icon: 'bg-sky-50 text-sky-700', bar: 'from-sky-500 to-cyan-400' },
    { icon: 'bg-emerald-50 text-emerald-700', bar: 'from-emerald-500 to-green-400' },
    { icon: 'bg-amber-50 text-amber-700', bar: 'from-amber-500 to-orange-400' },
    { icon: 'bg-violet-50 text-violet-700', bar: 'from-violet-500 to-sky-400' },
  ]
  const tone = tones[index % tones.length]
  return <motion.article ref={ref} initial={{ opacity: 0, y: 14 }} animate={active ? { opacity: 1, y: 0 } : { opacity: 0, y: 14 }} transition={{ duration: .4, delay: index * .06 }} className="group rounded-2xl border border-slate-100 bg-white p-5 shadow-[0_12px_35px_rgb(16_84_105/0.06)] transition duration-300 hover:-translate-y-1 hover:border-sky-200 hover:shadow-[0_18px_42px_rgb(16_84_105/0.1)]">
    <div className="flex items-center justify-between gap-3"><span className={`grid size-11 shrink-0 place-items-center rounded-2xl ${tone.icon}`}><svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{statIcons[index % statIcons.length]}</svg></span><span className="text-[10px] font-black tracking-widest text-slate-300">{String(index + 1).padStart(2, '0')}</span></div>
    <div className="mt-4 flex items-end gap-1.5" dir="ltr"><strong className="text-4xl font-black tracking-tighter text-slate-800">{shown.toLocaleString(isEn ? 'en-US' : 'fa-IR')}</strong>{card.suffix ? <span className="pb-1 text-sm font-black text-rc-accent">{card.suffix}</span> : null}</div>
    <p className="mt-1 truncate text-sm font-bold text-slate-500">{isEn ? card.label_en : card.label_fa}</p>
    <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true"><motion.div initial={{ width: 0 }} animate={active ? { width: `${ratio}%` } : { width: 0 }} transition={{ duration: .8, delay: .15 + index * .06 }} className={`h-full rounded-full bg-gradient-to-r ${tone.bar}`} /></div>
  </motion.article>
}

export function CompetitionStats({ cards }: { cards: HomeStatCard[] }) {
  const { t, i18n } = useTranslation()
  const isEn = i18n.language.startsWith('en')
  if (!cards.length) return null
  const maxValue = Math.max(...cards.map((card) => card.value_num), 1)
  return <section className="relative py-16 sm:py-20"><div className="mx-auto max-w-7xl px-4 sm:px-8"><div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between"><div><span className="inline-flex rounded-full bg-sky-50 px-3 py-1.5 text-xs font-bold text-rc-blue">{t('home.statsEyebrow')}</span><h2 className="mt-3 text-3xl font-black text-slate-800 sm:text-4xl">{t('home.competitionStatsTitle')}</h2></div><p className="max-w-2xl text-sm leading-7 text-slate-500">{t('home.competitionStatsSubtitle')}</p></div><div className={`grid gap-4 sm:grid-cols-2 ${cards.length >= 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>{cards.map((card, index) => <StatItem key={card.id} card={card} isEn={isEn} index={index} maxValue={maxValue} />)}</div></div></section>
}
