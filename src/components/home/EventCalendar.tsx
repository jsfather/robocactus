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
    <HomeSection index="04" title={t('home.calendarTitle')} subtitle={t('home.calendarSubtitle')}>
      <div className="overflow-hidden rounded-[2.25rem] border border-sky-100 bg-gradient-to-br from-white via-sky-50/55 to-emerald-50/50 shadow-[0_28px_80px_rgb(18_76_98/0.10)]">
        <div className="grid lg:grid-cols-[17rem_minmax(0,1fr)]">
          <aside className="relative overflow-hidden bg-gradient-to-br from-[#063d59] via-[#0873a0] to-[#087b61] p-7 text-white sm:p-9">
            <span className="absolute -end-16 -top-16 size-48 rounded-full border-[32px] border-white/10" aria-hidden="true" />
            <span className="relative grid size-14 place-items-center rounded-2xl bg-white/15 shadow-lg backdrop-blur"><svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M8 3v4M16 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" /></svg></span>
            <p className="relative mt-6 text-xs font-black tracking-[0.18em] text-emerald-200 uppercase">{isEn ? 'Event roadmap' : 'نقشه زمانی رویدادها'}</p>
            <p className="relative mt-3 text-sm leading-7 text-sky-50/85">{isEn ? 'Important competition dates, workshops and milestones in one clear timeline.' : 'تاریخ مسابقات، کارگاه‌ها و نقاط مهم را در یک مسیر زمانی روشن دنبال کنید.'}</p>
            <div className="relative mt-7 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-bold"><span className="size-2 rounded-full bg-emerald-300 shadow-[0_0_0_5px_rgb(110_231_183/0.12)]" />{events.length.toLocaleString(isEn ? 'en-US' : 'fa-IR')} {isEn ? 'scheduled events' : 'رویداد برنامه‌ریزی‌شده'}</div>
          </aside>
          <ol className="relative p-5 sm:p-8">
            {events.map((event, index) => {
              const location = isEn ? event.location_en : event.location_fa
              const description = isEn ? event.description_en : event.description_fa
              return (
                <motion.li key={event.id} initial={{ opacity: 0, x: 12 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: index * 0.06 }} className="group relative ps-12 sm:ps-16">
                  {index < events.length - 1 ? <span className="absolute start-[1.18rem] top-10 h-[calc(100%-1rem)] w-px bg-gradient-to-b from-sky-300 to-emerald-200 sm:start-[1.68rem]" aria-hidden="true" /> : null}
                  <span className="absolute start-0 top-6 grid size-10 place-items-center rounded-2xl border-4 border-white bg-sky-600 text-xs font-black text-white shadow-[0_8px_24px_rgb(2_132_199/0.24)] transition group-hover:scale-110 sm:size-14">{String(index + 1).padStart(2, '0')}</span>
                  <article className="mb-4 rounded-[1.5rem] border border-sky-100 bg-white p-5 shadow-[0_14px_38px_rgb(18_76_98/0.06)] transition duration-300 group-hover:-translate-y-0.5 group-hover:border-sky-200 group-hover:shadow-[0_18px_48px_rgb(18_76_98/0.11)] sm:p-6">
                    <div className="flex flex-wrap items-center gap-3"><time className="inline-flex items-center gap-2 rounded-xl bg-sky-50 px-3 py-2 text-xs font-black text-sky-800 ring-1 ring-sky-100" dir="ltr"><span aria-hidden="true">●</span>{formatAppDate(event.event_date, i18n.language)}{event.end_date ? ` → ${formatAppDate(event.end_date, i18n.language)}` : ''}</time>{location ? <span className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">{location}</span> : null}</div>
                    <h3 className="mt-4 text-lg font-black text-slate-900">{isEn ? event.title_en : event.title_fa}</h3>
                    {description ? <p className="mt-2 text-sm leading-7 text-slate-600">{description}</p> : null}
                  </article>
                </motion.li>
              )
            })}
          </ol>
        </div>
      </div>
    </HomeSection>
  )
}
