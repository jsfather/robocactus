import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArticleCard } from '@/components/content/ArticleCard'
import { fetchPublishedAnnouncements } from '@/features/content/api'
import type { Announcement } from '@/types/database'

export function NewsPage() {
  const { t, i18n } = useTranslation(); const isEn = i18n.language.startsWith('en'); const [items, setItems] = useState<Announcement[]>([]); const [error, setError] = useState<string | null>(null); const [loading, setLoading] = useState(true)
  useEffect(() => { void fetchPublishedAnnouncements().then(setItems).catch((err: Error) => setError(err.message)).finally(() => setLoading(false)) }, [])
  return <main className="mx-auto max-w-7xl px-4 py-14 sm:px-8"><header className="mb-8 rounded-[2.25rem] border border-amber-100 bg-gradient-to-l from-amber-50 via-white to-sky-50 p-7 sm:p-10"><span className="inline-flex rounded-full bg-amber-500 px-3 py-1.5 text-xs font-black text-white">{isEn ? 'OFFICIAL' : 'مرکز اطلاع‌رسانی رسمی'}</span><h1 className="mt-4 text-3xl font-black text-slate-950 sm:text-5xl">{t('content.announcementsTitle')}</h1><p className="mt-3 text-sm leading-7 text-slate-600">{t('content.announcementsSubtitle')}</p></header>{loading ? <p className="py-16 text-center text-slate-500">{t('app.loading')}</p> : null}{error ? <p className="text-red-600">{error}</p> : null}{!loading && !items.length ? <p className="rounded-2xl border border-dashed border-sky-200 p-12 text-center text-slate-600">{t('content.announcementsEmpty')}</p> : <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">{items.map((item) => <ArticleCard key={item.id} to={`/news/${item.slug}`} title={item.title} excerpt={item.excerpt} image={item.cover_image} imageAlt={item.cover_alt} publishedAt={item.published_at} category={isEn ? item.category?.name_en : item.category?.name_fa} kind="announcement" />)}</div>}</main>
}
