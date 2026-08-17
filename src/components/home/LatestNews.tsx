import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import type { BlogPost } from '@/types/database'

export function LatestNews({ posts }: { posts: BlogPost[] }) {
  const { t } = useTranslation()

  return (
    <section className="mx-auto max-w-7xl px-4 py-24 sm:px-8">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-3xl font-black text-slate-800 md:text-5xl">{t('home.newsTitle')}</h2>
          <p className="mt-1 text-rc-muted">{t('home.newsSubtitle')}</p>
        </div>
        <Link to="/blog" className="rounded-2xl bg-sky-50 px-5 py-3 text-sm font-bold text-rc-blue">
          {t('home.viewAll')}
        </Link>
      </div>

      {!posts.length ? (
        <p className="text-rc-muted">{t('content.blogEmpty')}</p>
      ) : (
        <ul className="grid gap-5 md:grid-cols-3">
          {posts.map((post, i) => (
            <motion.li
              key={post.id}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.06 }}
            >
              <Link
                to={`/blog/${post.slug}`}
                className="group block overflow-hidden rounded-[1.75rem] border border-sky-100 bg-white shadow-[0_18px_50px_rgb(18_76_98/0.08)] transition hover:-translate-y-1 hover:shadow-xl"
              >
                {post.cover_image ? (
                  <img
                    src={post.cover_image}
                    alt=""
                    className="h-52 w-full object-cover transition duration-500 group-hover:scale-105"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-52 items-center justify-center bg-gradient-to-br from-sky-100 to-emerald-100 text-lg font-black text-rc-blue">
                    تازه‌های تبرستان
                  </div>
                )}
                <div className="p-4">
                  <h3 className="line-clamp-2 font-semibold">{post.title}</h3>
                  {post.published_at ? (
                    <p className="mt-2 font-mono text-xs text-rc-muted">
                      {new Date(post.published_at).toLocaleDateString()}
                    </p>
                  ) : null}
                </div>
              </Link>
            </motion.li>
          ))}
        </ul>
      )}
    </section>
  )
}
