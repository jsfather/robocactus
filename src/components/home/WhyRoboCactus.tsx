import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import type { HomeWhyCard } from '@/features/home/homeSectionsApi'
import { HomeSection } from './HomeSection'

const ICONS: Record<string, string> = {
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 0c2.5 2.8 4 6 4 9s-1.5 6.2-4 9c-2.5-2.8-4-6-4-9s1.5-6.2 4-9Zm-8.5 9h17',
  judge: 'M12 3v18M7 8h10M8 12h8M9 16h6',
  certificate: 'M8 4h8v12H8V4Zm2 14 2 2 2-2M10 8h4M10 11h4',
  trophy: 'M8 5h8v4a4 4 0 0 1-8 0V5Zm2 9h4v4H10v-4Zm-1 4h6',
  network: 'M6 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm12 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM12 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM7.5 8.5 10.5 15M16.5 8.5 13.5 15',
  rocket: 'M12 3c3 3 4 7 4 10l-2 2-2-1-1-2c0-3 1-7 1-9Zm-4 12-2 4 4-2',
  star: 'M12 3l2.2 6.6H21l-5.4 4 2.1 6.4L12 16.8 6.3 20l2.1-6.4L3 9.6h6.8L12 3Z',
}

function WhyIcon({ iconKey }: { iconKey: string }) {
  const d = ICONS[iconKey] ?? ICONS.star
  return (
    <svg viewBox="0 0 24 24" className="size-6" fill="none" aria-hidden>
      <path d={d} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function WhyRoboCactus({ cards }: { cards: HomeWhyCard[] }) {
  const { t, i18n } = useTranslation()
  const isEn = i18n.language.startsWith('en')
  if (!cards.length) return null

  return (
    <HomeSection
      index="03"
      title={t('home.whyTitle')}
      subtitle={t('home.whySubtitle')}
    >
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card, i) => (
          <motion.article
            key={card.id}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.45, delay: i * 0.05 }}
            whileHover={{ y: -6 }}
            className="group relative overflow-hidden rounded-[1.75rem] border border-emerald-100 bg-white p-7 shadow-[0_18px_50px_rgb(18_76_98/0.07)]"
          >
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-rc-blue/10 via-transparent to-rc-accent/5 opacity-0 transition group-hover:opacity-100" />
            <div className="relative mb-5 inline-flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-100 to-emerald-100 text-rc-blue">
              <WhyIcon iconKey={card.icon_key} />
            </div>
            <h3 className="relative text-xl font-black text-slate-800">
              {isEn ? card.title_en : card.title_fa}
            </h3>
            {(isEn ? card.body_en : card.body_fa) ? (
              <p className="relative mt-2 text-sm leading-relaxed text-rc-muted">
                {isEn ? card.body_en : card.body_fa}
              </p>
            ) : null}
          </motion.article>
        ))}
      </div>
    </HomeSection>
  )
}
