import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArticleCard } from '@/components/content/ArticleCard'
import type { Announcement } from '@/types/database'
import { HomeSectionHeading } from './HomeSection'
import { localizedAnnouncement } from '@/features/content/translations'

export function AnnouncementsSlider({ announcements: savedAnnouncements }: { announcements: Announcement[] }) {
  const { t, i18n } = useTranslation()
  const railRef = useRef<HTMLUListElement>(null)
  const announcements=savedAnnouncements.map((item)=>localizedAnnouncement(item,i18n.language))
  if (!announcements.length) return null
  const move = (direction: number) => railRef.current?.scrollBy({ left: direction * Math.min(window.innerWidth * 0.82, 420), behavior: 'smooth' })
  const isFa = i18n.language.startsWith('fa')

  return <section aria-label={t('content.announcementsTitle')} className="w-full overflow-hidden border-y border-amber-100 bg-gradient-to-b from-amber-50/70 to-white"><div className="mx-auto max-w-7xl px-4 py-10 sm:px-8 sm:py-14">
    <HomeSectionHeading icon="announcement" title={t('content.announcementsTitle')} subtitle={t('content.announcementsSubtitle')} action={<div className="flex gap-2"><button type="button" onClick={() => move(isFa ? 1 : -1)} className="grid size-11 place-items-center rounded-full border border-amber-200 bg-white text-amber-900 focus-visible:ring-2 focus-visible:ring-amber-500" aria-label={isFa ? 'قبلی' : 'Previous'}>→</button><button type="button" onClick={() => move(isFa ? -1 : 1)} className="grid size-11 place-items-center rounded-full border border-amber-200 bg-white text-amber-900 focus-visible:ring-2 focus-visible:ring-amber-500" aria-label={isFa ? 'بعدی' : 'Next'}>←</button></div>} />
    <ul ref={railRef} className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4 [scrollbar-width:thin]">
      {announcements.slice(0, 8).map((item) => <li key={item.id} className="w-[86vw] max-w-[380px] shrink-0 snap-start sm:w-[360px]"><ArticleCard kind="announcement" to={`/news/${item.slug || item.id}`} title={item.title} excerpt={item.excerpt || item.body.replace(/<[^>]+>/g, ' ').slice(0, 180)} image={item.cover_image} imageAlt={item.cover_alt} publishedAt={item.published_at} /></li>)}
    </ul>
    <Link to="/news" className="mt-3 inline-flex text-sm font-black text-sky-700">{isFa ? 'مشاهده همه اطلاعیه‌ها ←' : 'View all announcements →'}</Link>
  </div></section>
}
