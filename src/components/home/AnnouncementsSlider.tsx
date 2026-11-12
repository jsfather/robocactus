import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { Announcement } from '@/types/database'
import { formatAppDate } from '@/lib/dates'
import { HomeSectionHeading } from './HomeSection'
import { localizedAnnouncement } from '@/features/content/translations'

export function AnnouncementsSlider({ announcements: savedAnnouncements }: { announcements: Announcement[] }) {
  const { t, i18n } = useTranslation()
  const announcements = savedAnnouncements.map((item) => localizedAnnouncement(item, i18n.language))
  const isFa = i18n.language.startsWith('fa')

  if (!announcements.length) return null

  return (
    <section aria-label={t('content.announcementsTitle')} className="mt-10 border-y border-amber-200/70 bg-amber-50/60 sm:mt-14">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-8 sm:py-14">
        <HomeSectionHeading
          icon="announcement"
          title={t('content.announcementsTitle')}
          subtitle={t('content.announcementsSubtitle')}
          action={
            <Link to="/news" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-amber-200 bg-white px-4 text-sm font-bold text-amber-900 transition-colors hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2">
              {isFa ? 'همه اطلاعیه‌ها' : 'All announcements'}
              <svg viewBox="0 0 24 24" className="size-4 shrink-0 rtl:rotate-180" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>
            </Link>
          }
        />
        <ul className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {announcements.slice(0, 8).map((item) => (
            <li key={item.id} className="min-w-0">
              <Link to={`/news/${item.slug || item.id}`} className="group flex h-full flex-col overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-sm transition-[border-color,box-shadow] hover:border-amber-400 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-4 motion-reduce:transition-none">
                {item.cover_image ? <img src={item.cover_image} alt={item.cover_alt || ''} loading="lazy" className="aspect-[2/1] w-full object-cover" /> : null}
                <div className="flex flex-1 flex-col border-t-4 border-amber-400 p-5 sm:p-6">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-2 rounded-lg bg-amber-100 px-3 py-2 text-xs font-bold text-amber-950">
                      <svg viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 4-8 4H4v8h3l8 4V4ZM15 8h2a4 4 0 0 1 0 8h-2M7 16l2 5h3l-2-4" /></svg>
                      {isFa ? 'اطلاعیه' : 'Announcement'}
                    </span>
                    {item.published_at ? <time dateTime={item.published_at} className="text-xs text-slate-600">{formatAppDate(item.published_at, i18n.language)}</time> : null}
                  </div>
                  <h3 className="break-words text-lg font-black leading-8 text-slate-900 group-hover:text-amber-900">{item.title}</h3>
                  <p className="mt-3 line-clamp-3 break-words text-sm leading-7 text-slate-600">{item.excerpt || item.body.replace(/<[^>]+>/g, ' ').slice(0, 180)}</p>
                  <div className="mt-auto pt-6">
                    <span className="flex items-center justify-between gap-3 border-t border-slate-100 pt-4 text-sm font-bold text-sky-800">
                      {isFa ? 'مشاهده اطلاعیه' : 'View announcement'}
                      <svg viewBox="0 0 24 24" className="size-5 shrink-0 rtl:rotate-180" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>
                    </span>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
