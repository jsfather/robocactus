import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import type { HomeEvent } from '@/features/home/homeSectionsApi'
import { formatAppDate } from '@/lib/dates'
import { HomeSection } from './HomeSection'

export function EventCalendar({ events }: { events: HomeEvent[] }) {
  const { t, i18n } = useTranslation()
  const isEn = i18n.language.startsWith('en')
  if (!events.length) return null

  return (
    <HomeSection
      index="04"
      title={t('home.calendarTitle')}
      subtitle={t('home.calendarSubtitle')}
    >
      <ol className="grid gap-5 md:grid-cols-2">
        {events.map((ev, i) => (
          <motion.li
            key={ev.id}
            initial={{ opacity: 0, x: 12 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: i * 0.06 }}
            className="relative"
          >
            <article className="h-full rounded-[1.75rem] border border-sky-100 bg-white p-6 shadow-[0_18px_45px_rgb(18_76_98/0.07)] md:p-7">
              <div className="flex flex-wrap items-center gap-3">
                <time className="rounded-full bg-sky-50 px-3 py-1.5 text-xs font-bold text-rc-blue" dir="ltr">
                  {formatAppDate(ev.event_date, i18n.language)}
                  {ev.end_date ? ` → ${formatAppDate(ev.end_date, i18n.language)}` : ''}
                </time>
                {(isEn ? ev.location_en : ev.location_fa) ? (
                  <span className="text-xs text-rc-muted">
                    {isEn ? ev.location_en : ev.location_fa}
                  </span>
                ) : null}
              </div>
              <h3 className="mt-2 text-lg font-semibold">
                {isEn ? ev.title_en : ev.title_fa}
              </h3>
              {(isEn ? ev.description_en : ev.description_fa) ? (
                <p className="mt-2 text-sm text-rc-muted">
                  {isEn ? ev.description_en : ev.description_fa}
                </p>
              ) : null}
            </article>
          </motion.li>
        ))}
      </ol>
    </HomeSection>
  )
}
