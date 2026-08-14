import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import type { HomePartner } from '@/features/home/homeSectionsApi'
import { HomeSection } from './HomeSection'

export function ScientificPartners({ partners }: { partners: HomePartner[] }) {
  const { t, i18n } = useTranslation()
  const isEn = i18n.language.startsWith('en')
  if (!partners.length) return null

  return (
    <HomeSection
      index="05"
      title={t('home.partnersTitle')}
      subtitle={t('home.partnersSubtitle')}
      className="border-y border-rc-line bg-rc-navy/25"
    >
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {partners.map((p, i) => {
          const name = isEn ? p.name_en : p.name_fa
          const card = (
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.04 }}
              className="flex h-full flex-col items-center justify-center gap-3 border border-rc-line bg-rc-surface/60 p-6 text-center transition hover:border-rc-blue/40 hover:bg-rc-surface"
            >
              {p.logo_url ? (
                <img src={p.logo_url} alt="" className="h-12 w-auto object-contain" />
              ) : (
                <span className="flex size-12 items-center justify-center border border-rc-blue/30 font-mono text-xs text-rc-blue">
                  {name.slice(0, 2)}
                </span>
              )}
              <p className="text-sm font-medium">{name}</p>
              <p className="font-mono text-[10px] tracking-wide text-rc-muted uppercase">
                {t(`home.partnerKind.${p.kind}`)}
              </p>
            </motion.div>
          )
          return (
            <li key={p.id}>
              {p.link_url ? (
                <a href={p.link_url} target="_blank" rel="noreferrer" className="block h-full">
                  {card}
                </a>
              ) : (
                card
              )}
            </li>
          )
        })}
      </ul>
    </HomeSection>
  )
}
