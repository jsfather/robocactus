import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { fetchPublishedPosts } from '@/features/content/api'
import type { BlogPost } from '@/types/database'
import { formatAppDate } from '@/lib/dates'

export function BlogListPage() {
  const { t, i18n } = useTranslation()
  const [posts, setPosts] = useState<BlogPost[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void fetchPublishedPosts()
      .then(setPosts)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-12">
      <div>
        <h1 className="text-3xl font-semibold">{t('content.blogTitle')}</h1>
        <p className="mt-1 text-rc-muted">{t('content.blogSubtitle')}</p>
      </div>

      {loading ? <p className="text-rc-muted">{t('app.loading')}</p> : null}
      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      {!loading && posts.length === 0 ? (
        <p className="text-rc-muted">{t('content.blogEmpty')}</p>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => (
            <li key={post.id}>
              <Link
                to={`/blog/${post.slug}`}
                className="flex h-full flex-col overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] transition hover:border-rc-blue/40"
              >
                {post.cover_image ? (
                  <img
                    src={post.cover_image}
                    alt=""
                    className="h-40 w-full object-cover"
                  />
                ) : (
                  <div className="flex h-40 items-center justify-center bg-rc-navy font-mono text-rc-blue">
                    NEWS
                  </div>
                )}
                <div className="flex flex-1 flex-col p-4">
                  <h2 className="text-lg font-semibold text-rc-text">{post.title}</h2>
                  {post.published_at ? (
                    <p className="mt-2 font-mono text-xs text-rc-muted">
                      {formatAppDate(post.published_at, i18n.language)}
                    </p>
                  ) : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
