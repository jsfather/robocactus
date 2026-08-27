import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, FieldError, Input, Select, Textarea } from '@/components/ui/FormControls'
import { PanelPage } from '@/components/layout/PanelShell'
import { HudFrame, SectionLabel } from '@/components/panel/HudKit'
import { ImageUploadField } from '@/components/ui/ImageUploadField'
import { RichTextEditor } from '@/components/ui/RichTextEditor'
import { fetchStaticPages, upsertStaticPage } from '@/features/leagues/adminApi'
import type { StaticPage } from '@/types/database'
import { formatAppDateTime } from '@/lib/dates'

const KNOWN_SLUGS = ['about', 'contact', 'faq', 'privacy', 'terms', 'registration-guide'] as const

export function SuperAdminPagesPage() {
  const { t, i18n } = useTranslation()
  const [pages, setPages] = useState<StaticPage[]>([])
  const [slug, setSlug] = useState<(typeof KNOWN_SLUGS)[number]>('about')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [titleEn, setTitleEn] = useState('')
  const [bodyEn, setBodyEn] = useState('')
  const [excerptEn, setExcerptEn] = useState('')
  const [excerpt, setExcerpt] = useState('')
  const [seoTitle, setSeoTitle] = useState('')
  const [meta, setMeta] = useState('')
  const [cover, setCover] = useState<string | null>(null)
  const [editorKey, setEditorKey] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [savedAt, setSavedAt] = useState<string | null>(null)

  const applyPage = (current: StaticPage | undefined) => {
    setTitle(current?.title ?? '')
    setBody(current?.body ?? '')
    setTitleEn(current?.title_en ?? '')
    setBodyEn(current?.body_en ?? '')
    setExcerptEn(current?.excerpt_en ?? '')
    setExcerpt(current?.excerpt ?? '')
    setSeoTitle(current?.seo_title ?? '')
    setMeta(current?.meta_description ?? '')
    setCover(current?.cover_image ?? current?.og_image ?? null)
    setEditorKey((k) => k + 1)
  }

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchStaticPages()
      setPages(data)
      applyPage(data.find((p) => p.slug === slug))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    applyPage(pages.find((p) => p.slug === slug))
    setSavedAt(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const saved = await upsertStaticPage({
        slug,
        title: title.trim(),
        body,
        title_en: titleEn,
        body_en: bodyEn,
        excerpt_en: excerptEn,
        excerpt,
        seo_title: seoTitle,
        meta_description: meta,
        cover_image: cover,
        og_image: cover,
      })
      setPages((prev) => {
        const rest = prev.filter((p) => p.slug !== saved.slug)
        return [...rest, saved].sort((a, b) => a.slug.localeCompare(b.slug))
      })
      setSavedAt(saved.updated_at)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  const publicPath = `/${slug}`

  return (
    <PanelPage index="CMS.03" title={t('admin.pages.title')} description={t('admin.pages.subtitle')}>
      <FieldError message={error ?? undefined} />
      {loading ? <p className="text-rc-muted">{t('app.loading')}</p> : null}

      <HudFrame className="p-4">
        <SectionLabel index="PG.01" title={t('admin.pages.editorTitle')} />
        <form className="space-y-3" onSubmit={(e) => void onSubmit(e)}>
          <Select
            label={t('admin.pages.slug')}
            value={slug}
            onChange={(e) => setSlug(e.target.value as (typeof KNOWN_SLUGS)[number])}
          >
            {KNOWN_SLUGS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
          <Input label={t('admin.pages.pageTitle')} required value={title} onChange={(e) => setTitle(e.target.value)} />
          <ImageUploadField label={t('content.cover')} value={cover} onChange={setCover} />
          <Textarea
            label={t('content.excerpt')}
            className="min-h-20"
            value={excerpt}
            onChange={(e) => setExcerpt(e.target.value)}
          />
          <RichTextEditor
            label={t('content.body')}
            value={body}
            onChange={setBody}
            resetKey={`${slug}-${editorKey}`}
            hint={t('content.editorHint')}
          />
          <div className="space-y-3 rounded-2xl border border-sky-100 bg-sky-50/50 p-4" dir="ltr"><p className="text-sm font-black text-sky-800">English content</p><Input label="English title" value={titleEn} onChange={(event) => setTitleEn(event.target.value)} /><Textarea label="English excerpt" className="min-h-20" value={excerptEn} onChange={(event) => setExcerptEn(event.target.value)} /><RichTextEditor label="English body" value={bodyEn} onChange={setBodyEn} resetKey={`${slug}-en-${editorKey}`} /></div>
          <div className="space-y-3 border border-rc-line bg-rc-navy/30 p-3">
            <p className="text-sm font-medium">{t('content.seoSection')}</p>
            <Input
              label={t('content.seoTitle')}
              value={seoTitle}
              onChange={(e) => setSeoTitle(e.target.value)}
              placeholder={title}
            />
            <Textarea
              label={t('content.metaDescription')}
              className="min-h-20"
              value={meta}
              onChange={(e) => setMeta(e.target.value)}
              placeholder={excerpt || title}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy}>
              {busy ? t('app.loading') : t('common.save')}
            </Button>
            <Link to={publicPath} className="self-center text-sm text-rc-blue hover:underline">
              {t('admin.pages.preview')}
            </Link>
          </div>
          {savedAt ? (
            <p className="text-xs text-rc-muted">
              {t('admin.pages.saved')} {formatAppDateTime(savedAt, i18n.language)}
            </p>
          ) : null}
        </form>
      </HudFrame>
    </PanelPage>
  )
}
