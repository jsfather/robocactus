import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { usePageSeo } from '@/components/seo/SeoManager'
import { fetchPublishedPostBySlug } from '@/features/content/api'
import type { BlogPost } from '@/types/database'

export function BlogPostPage() {
  const { slug } = useParams()
  const { t } = useTranslation()
  const [post, setPost] = useState<BlogPost | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  usePageSeo({
    title: post?.seo_title || post?.title,
    description:
      post?.meta_description ||
      post?.excerpt ||
      (post?.title ? `${post.title} — ${t('seo.pages.blog.description')}` : undefined),
    image: post?.og_image || post?.cover_image || undefined,
  })

  useEffect(() => {
    if (!slug) return
    setLoading(true)
    void fetchPublishedPostBySlug(slug)
      .then((data) => {
        setPost(data)
        if (!data) setError(t('content.postNotFound'))
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [slug, t])

  if (loading) {
    return <div className="px-4 py-12 text-center text-rc-muted">{t('app.loading')}</div>
  }

  if (!post) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <p className="text-red-400">{error ?? t('content.postNotFound')}</p>
        <p className="mt-2 text-sm text-rc-muted">{t('content.draftHiddenHint')}</p>
        <Link to="/blog" className="mt-4 inline-block text-rc-blue hover:underline">
          {t('content.backToBlog')}
        </Link>
      </div>
    )
  }

  return (
    <article className="mx-auto max-w-3xl px-4 py-12">
      {post.cover_image ? (
        <img
          src={post.cover_image}
          alt=""
          className="mb-6 max-h-80 w-full rounded-xl border border-white/10 object-cover"
        />
      ) : null}
      <p className="font-mono text-xs text-rc-blue">
        {post.published_at ? new Date(post.published_at).toLocaleString() : ''}
      </p>
      <h1 className="mt-2 text-3xl font-semibold">{post.title}</h1>
      {post.excerpt ? <p className="mt-3 text-lg text-rc-muted">{post.excerpt}</p> : null}
      <div
        className="prose-invert mt-6 space-y-3 leading-relaxed text-rc-muted [&_a]:text-rc-blue [&_blockquote]:border-s-2 [&_blockquote]:border-rc-blue/40 [&_blockquote]:ps-3 [&_h2]:text-rc-text [&_h3]:text-rc-text [&_img]:rounded-lg [&_ol]:list-decimal [&_ol]:ps-5 [&_strong]:text-rc-text [&_ul]:list-disc [&_ul]:ps-5"
        dangerouslySetInnerHTML={{ __html: post.body }}
      />
      <Link to="/blog" className="mt-8 inline-block text-sm text-rc-blue hover:underline">
        ← {t('content.backToBlog')}
      </Link>
    </article>
  )
}
