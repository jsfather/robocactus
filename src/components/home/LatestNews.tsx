import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import type { BlogPost } from '@/types/database'
import { ArticleCard } from '@/components/content/ArticleCard'
import { HomeSectionHeading } from './HomeSection'

export function LatestNews({ posts }: { posts: BlogPost[] }) {
  const { t, i18n } = useTranslation()
  return <section className="mx-auto w-full max-w-7xl overflow-hidden px-4 py-16 sm:px-8 sm:py-20"><HomeSectionHeading icon="news" title={t('home.newsTitle')} subtitle={t('home.newsSubtitle')} action={<Link to="/blog" className="shrink-0 rounded-xl bg-sky-700 px-5 py-3 text-sm font-black text-white transition hover:bg-sky-800">{t('home.viewAll')}</Link>} />{!posts.length ? <p className="rounded-2xl border border-dashed border-sky-200 p-10 text-center text-slate-500">{t('content.blogEmpty')}</p> : <ul className="grid min-w-0 grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">{posts.map((post, index) => <motion.li className="min-w-0" key={post.id} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: index * 0.06 }}><ArticleCard to={`/blog/${post.slug}`} title={post.title} excerpt={post.excerpt} image={post.cover_image} imageAlt={post.cover_alt} publishedAt={post.published_at} category={i18n.language.startsWith('en') ? post.category?.name_en : post.category?.name_fa} /></motion.li>)}</ul>}</section>
}
