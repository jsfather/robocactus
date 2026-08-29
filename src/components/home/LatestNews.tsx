import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import type { BlogPost } from '@/types/database'
import { ArticleCard } from '@/components/content/ArticleCard'

export function LatestNews({ posts }: { posts: BlogPost[] }) {
  const { t, i18n } = useTranslation()
  return <section className="mx-auto max-w-7xl px-4 py-24 sm:px-8"><div className="mb-8 flex flex-wrap items-end justify-between gap-3"><div><span className="text-xs font-black tracking-[0.18em] text-emerald-700">EDITORIAL</span><h2 className="mt-2 text-3xl font-black text-slate-900 md:text-5xl">{t('home.newsTitle')}</h2><p className="mt-2 text-slate-600">{t('home.newsSubtitle')}</p></div><Link to="/blog" className="rounded-2xl bg-sky-700 px-5 py-3 text-sm font-black text-white shadow-lg transition hover:-translate-y-0.5">{t('home.viewAll')}</Link></div>{!posts.length ? <p className="rounded-2xl border border-dashed border-sky-200 p-10 text-center text-slate-500">{t('content.blogEmpty')}</p> : <ul className="grid gap-6 md:grid-cols-3">{posts.map((post, index) => <motion.li key={post.id} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: index * 0.06 }}><ArticleCard to={`/blog/${post.slug}`} title={post.title} excerpt={post.excerpt} image={post.cover_image} imageAlt={post.cover_alt} publishedAt={post.published_at} category={i18n.language.startsWith('en') ? post.category?.name_en : post.category?.name_fa} /></motion.li>)}</ul>}</section>
}
