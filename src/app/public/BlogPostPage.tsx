import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { usePageSeo } from '@/components/seo/SeoManager'
import { ArticleDetail } from '@/components/content/ArticleDetail'
import { fetchPublishedPostBySlug } from '@/features/content/api'
import type { BlogPost } from '@/types/database'

export function BlogPostPage() {
  const { slug } = useParams()
  const { t, i18n } = useTranslation()
  const [post, setPost] = useState<BlogPost | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  usePageSeo({ title: post?.seo_title || post?.title, description: post?.meta_description || post?.excerpt || undefined, image: post?.og_image || post?.cover_image || undefined })
  useEffect(() => { if (!slug) return; setLoading(true); void fetchPublishedPostBySlug(slug).then((data) => { setPost(data); if (!data) setError(t('content.postNotFound')) }).catch((err: Error) => setError(err.message)).finally(() => setLoading(false)) }, [slug, t])
  if (loading) return <div className="px-4 py-20 text-center text-slate-500">{t('app.loading')}</div>
  if (!post) return <div className="mx-auto max-w-3xl px-4 py-20 text-center"><p className="font-black text-red-600">{error ?? t('content.postNotFound')}</p><Link to="/blog" className="mt-5 inline-flex text-sky-700 hover:underline">{t('content.backToBlog')}</Link></div>
  return <ArticleDetail kind="article" title={post.title} excerpt={post.excerpt} body={post.body} coverImage={post.cover_image} coverAlt={post.cover_alt} author={post.author_name} publishedAt={post.published_at} category={i18n.language.startsWith('en') ? post.category?.name_en : post.category?.name_fa} backTo="/blog" backLabel={t('content.backToBlog')} />
}
