import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArticleDetail } from '@/components/content/ArticleDetail'
import { usePageSeo } from '@/components/seo/SeoManager'
import { fetchPublishedAnnouncementBySlug } from '@/features/content/api'
import type { Announcement } from '@/types/database'

export function AnnouncementPage() {
  const { slug } = useParams(); const { t, i18n } = useTranslation(); const [item, setItem] = useState<Announcement | null>(null); const [loading, setLoading] = useState(true)
  usePageSeo({ title: item?.seo_title || item?.title, description: item?.meta_description || item?.excerpt || undefined, image: item?.og_image || item?.cover_image || undefined })
  useEffect(() => { if (!slug) return; void fetchPublishedAnnouncementBySlug(slug).then(setItem).finally(() => setLoading(false)) }, [slug])
  if (loading) return <div className="px-4 py-20 text-center text-slate-500">{t('app.loading')}</div>
  if (!item) return <div className="mx-auto max-w-3xl px-4 py-20 text-center"><p className="font-black text-red-600">{t('content.postNotFound')}</p><Link to="/news" className="mt-5 inline-flex text-sky-700">{t('content.announcementsTitle')}</Link></div>
  return <ArticleDetail kind="announcement" title={item.title} excerpt={item.excerpt} body={item.body} coverImage={item.cover_image} coverAlt={item.cover_alt} author={item.author_name} publishedAt={item.published_at} category={i18n.language.startsWith('en') ? item.category?.name_en : item.category?.name_fa} backTo="/news" backLabel={t('content.announcementsTitle')} />
}
