import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import type { BlogPost } from '@/types/database'

export function LatestNews({ posts }: { posts: BlogPost[] }) {
  const { t } = useTranslation()

  return (
    <section className="mx-auto max-w-6xl px-4 py-16">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold md:text-3xl">{t('home.newsTitle')}</h2>
          <p className="mt-1 text-rc-muted">{t('home.newsSubtitle')}</p>
        </div>
        <Link to="/blog" className="text-sm text-rc-blue hover:underline">
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
                className="block overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] transition hover:border-rc-blue/40"
              >
                {post.cover_image ? (
                  <img
                    src={post.cover_image}
                    alt=""
                    className="h-40 w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-40 items-center justify-center bg-rc-navy font-mono text-rc-blue">
                    NEWS
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
