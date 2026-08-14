import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import type { HomeFaq } from '@/features/home/homeSectionsApi'
import { HomeSection } from './HomeSection'

export function HomeFaqSection({ faqs }: { faqs: HomeFaq[] }) {
  const { t, i18n } = useTranslation()
  const isEn = i18n.language.startsWith('en')
  const [openId, setOpenId] = useState<string | null>(faqs[0]?.id ?? null)
  if (!faqs.length) return null

  return (
    <HomeSection index="06" title={t('home.faqTitle')} subtitle={t('home.faqHomeSubtitle')}>
      <ul className="mx-auto max-w-3xl space-y-2">
        {faqs.map((faq) => {
          const open = openId === faq.id
          return (
            <li key={faq.id} className="border border-rc-line bg-rc-surface/60">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-4 py-4 text-start"
                onClick={() => setOpenId(open ? null : faq.id)}
                aria-expanded={open}
              >
                <span className="font-medium">
                  {isEn ? faq.question_en : faq.question_fa}
                </span>
                <span
                  className={[
                    'font-mono text-rc-blue transition duration-300',
                    open ? 'rotate-45' : '',
                  ].join(' ')}
                >
                  +
                </span>
              </button>
              <AnimatePresence initial={false}>
                {open ? (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.28 }}
                    className="overflow-hidden"
                  >
                    <p className="border-t border-rc-line px-4 py-4 text-sm leading-relaxed text-rc-muted">
                      {isEn ? faq.answer_en : faq.answer_fa}
                    </p>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </li>
          )
        })}
      </ul>
    </HomeSection>
  )
}
