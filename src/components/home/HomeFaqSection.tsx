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
      <ul className="mx-auto max-w-4xl space-y-4">
        {faqs.map((faq) => {
          const open = openId === faq.id
          return (
            <li key={faq.id} className="overflow-hidden rounded-[1.5rem] border border-sky-100 bg-white shadow-[0_12px_35px_rgb(18_76_98/0.06)]">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-4 px-6 py-5 text-start"
                onClick={() => setOpenId(open ? null : faq.id)}
                aria-expanded={open}
              >
                <span className="font-medium">
                  {isEn ? faq.question_en : faq.question_fa}
                </span>
                <span
                  className={`flex size-9 items-center justify-center rounded-full bg-sky-50 text-xl text-rc-blue transition ${open ? 'rotate-45' : ''}`}
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
