import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { usePageSeo } from '@/components/seo/SeoManager'
import { fetchStaticPage } from '@/features/leagues/adminApi'
import { sanitizeHtml } from '@/lib/sanitize'
import type { StaticPage } from '@/types/database'

export function StaticContentPage({
  slug: slugProp,
  fallbackTitleKey,
}: {
  slug?: string
  fallbackTitleKey?: string
}) {
  const { slug: paramSlug } = useParams()
  const slug = slugProp ?? paramSlug ?? 'about'
  const { t } = useTranslation()
  const [page, setPage] = useState<StaticPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  usePageSeo({
    title: page?.seo_title || page?.title,
    description: page?.meta_description || page?.excerpt || undefined,
    image: page?.og_image || page?.cover_image || undefined,
  })

  useEffect(() => {
    let mounted = true
    void fetchStaticPage(slug)
      .then((data) => {
        if (mounted) setPage(data)
      })
      .catch((err: Error) => {
        if (mounted) setError(err.message)
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [slug])

  if (loading) {
    return <div className="px-4 py-12 text-center text-rc-muted">{t('app.loading')}</div>
  }

  return (
    <div className="pb-16">
      <section className="relative min-h-[36vh] overflow-hidden border-b border-rc-line">
        {page?.cover_image ? (
          <img src={page.cover_image} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-rc-navy via-rc-bg to-rc-blue/25" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-rc-bg via-rc-bg/75 to-transparent" />
        <div className="relative mx-auto flex max-w-3xl flex-col justify-end px-4 pb-10 pt-24">
          <p className="font-mono text-[10px] tracking-[0.28em] text-rc-blue uppercase">{slug}</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight">
            {page?.title ?? (fallbackTitleKey ? t(fallbackTitleKey) : slug)}
          </h1>
          {page?.excerpt ? <p className="mt-3 max-w-2xl text-lg text-rc-muted">{page.excerpt}</p> : null}
        </div>
      </section>

      <div className="mx-auto max-w-3xl px-4 pt-10">
        {error ? <p className="mb-4 text-sm text-red-400">{error}</p> : null}
        {page?.body ? (
          <div
            className="prose-invert space-y-4 leading-relaxed text-rc-muted [&_a]:text-rc-blue [&_blockquote]:border-s-2 [&_blockquote]:border-rc-blue/40 [&_blockquote]:ps-3 [&_h2]:text-rc-text [&_h3]:text-rc-text [&_img]:my-4 [&_img]:w-full [&_img]:border [&_img]:border-rc-line [&_ol]:list-decimal [&_ol]:ps-5 [&_strong]:text-rc-text [&_ul]:list-disc [&_ul]:ps-5"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(page.body) }}
          />
        ) : (
          <p className="text-rc-muted">{t('admin.pages.emptyPublic')}</p>
        )}
      </div>
    </div>
  )
}
