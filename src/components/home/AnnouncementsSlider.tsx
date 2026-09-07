import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArticleCard } from '@/components/content/ArticleCard'
import type { Announcement } from '@/types/database'

export function AnnouncementsSlider({ announcements }: { announcements: Announcement[] }) {
  const { i18n } = useTranslation()
  const railRef = useRef<HTMLUListElement>(null)
  if (!announcements.length) return null
  const move = (direction: number) => railRef.current?.scrollBy({ left: direction * Math.min(window.innerWidth * 0.82, 420), behavior: 'smooth' })
  const isFa = i18n.language.startsWith('fa')

  return <section className="mx-auto w-full max-w-7xl overflow-hidden px-4 py-14 sm:px-8 sm:py-18">
    <header className="mb-6 flex items-end justify-between gap-4">
      <div><p className="text-xs font-black tracking-[.16em] text-emerald-700">{isFa ? 'اطلاع‌رسانی رسمی' : 'OFFICIAL UPDATES'}</p><h2 className="mt-2 text-3xl font-black text-slate-900 sm:text-4xl">{isFa ? 'اخبار و اطلاعیه‌ها' : 'News & announcements'}</h2></div>
      <div className="hidden gap-2 sm:flex"><button type="button" onClick={() => move(isFa ? 1 : -1)} className="grid size-10 place-items-center rounded-full border border-slate-200 bg-white text-slate-700" aria-label={isFa ? 'قبلی' : 'Previous'}>→</button><button type="button" onClick={() => move(isFa ? -1 : 1)} className="grid size-10 place-items-center rounded-full border border-slate-200 bg-white text-slate-700" aria-label={isFa ? 'بعدی' : 'Next'}>←</button></div>
    </header>
    <ul ref={railRef} className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4 [scrollbar-width:thin]">
      {announcements.slice(0, 8).map((item) => <li key={item.id} className="w-[86vw] max-w-[380px] shrink-0 snap-start sm:w-[360px]"><ArticleCard kind="announcement" to={`/news/${item.slug || item.id}`} title={item.title} excerpt={item.excerpt || item.body.replace(/<[^>]+>/g, ' ').slice(0, 180)} image={item.cover_image} imageAlt={item.cover_alt} publishedAt={item.published_at} /></li>)}
    </ul>
    <Link to="/news" className="mt-3 inline-flex text-sm font-black text-sky-700">{isFa ? 'مشاهده همه اطلاعیه‌ها ←' : 'View all announcements →'}</Link>
  </section>
}
