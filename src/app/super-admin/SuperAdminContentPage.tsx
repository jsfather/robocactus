import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Button,
  FieldError,
  Input,
  PanelCard,
  Select,
  Textarea,
} from '@/components/ui/FormControls'
import { ImageUploadField } from '@/components/ui/ImageUploadField'
import { RichTextEditor } from '@/components/ui/RichTextEditor'
import { PanelPage } from '@/components/layout/PanelShell'
import { useAuth } from '@/hooks/useAuth'
import {
  createGalleryItem,
  createContentCategory,
  deleteAnnouncement,
  deleteBlogPost,
  deleteGalleryCategory,
  deleteGalleryItem,
  fetchAllAnnouncements,
  fetchAllPosts,
  fetchContentCategories,
  fetchGalleryCategories,
  fetchGalleryItems,
  fetchLeaguesForContent,
  uploadContentMedia,
  upsertAnnouncement,
  upsertBlogPost,
  upsertGalleryCategory,
} from '@/features/content/api'
import { slugify } from '@/lib/validation'
import type {
  Announcement,
  BlogPost,
  ContentStatus,
  ContentCategory,
  GalleryCategory,
  GalleryItem,
  League,
} from '@/types/database'

type Tab = 'blog' | 'announcements' | 'gallery'

export function SuperAdminContentPage() {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const [tab, setTab] = useState<Tab>('blog')
  const [posts, setPosts] = useState<BlogPost[]>([])
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [gallery, setGallery] = useState<GalleryItem[]>([])
  const [galCategories, setGalCategories] = useState<GalleryCategory[]>([])
  const [leagues, setLeagues] = useState<League[]>([])
  const [contentCategories, setContentCategories] = useState<ContentCategory[]>([])
  const [newCategoryFa, setNewCategoryFa] = useState('')
  const [newCategoryEn, setNewCategoryEn] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  const [postId, setPostId] = useState<string | null>(null)
  const [postTitle, setPostTitle] = useState('')
  const [postSlug, setPostSlug] = useState('')
  const [postBody, setPostBody] = useState('')
  const [postStatus, setPostStatus] = useState<ContentStatus>('draft')
  const [postCover, setPostCover] = useState<string | null>(null)
  const [postExcerpt, setPostExcerpt] = useState('')
  const [postSeoTitle, setPostSeoTitle] = useState('')
  const [postMeta, setPostMeta] = useState('')
  const [postEditorKey, setPostEditorKey] = useState(0)
  const [postCategoryId, setPostCategoryId] = useState('')
  const [postAuthor, setPostAuthor] = useState('')
  const [postCoverAlt, setPostCoverAlt] = useState('')

  const [annId, setAnnId] = useState<string | null>(null)
  const [annTitle, setAnnTitle] = useState('')
  const [annBody, setAnnBody] = useState('')
  const [annLeagueId, setAnnLeagueId] = useState('')
  const [annStatus, setAnnStatus] = useState<ContentStatus>('draft')
  const [annExcerpt, setAnnExcerpt] = useState('')
  const [annSeoTitle, setAnnSeoTitle] = useState('')
  const [annMeta, setAnnMeta] = useState('')
  const [annCover, setAnnCover] = useState<string | null>(null)
  const [annEditorKey, setAnnEditorKey] = useState(0)
  const [annSlug, setAnnSlug] = useState('')
  const [annCategoryId, setAnnCategoryId] = useState('')
  const [annAuthor, setAnnAuthor] = useState('')
  const [annCoverAlt, setAnnCoverAlt] = useState('')

  const [galCaption, setGalCaption] = useState('')
  const [galLeagueId, setGalLeagueId] = useState('')
  const [galCategoryId, setGalCategoryId] = useState('')
  const [galYear, setGalYear] = useState(String(new Date().getFullYear()))
  const [galType, setGalType] = useState('image')
  const [galFile, setGalFile] = useState<File | null>(null)
  const [catId, setCatId] = useState<string | null>(null)
  const [catNameFa, setCatNameFa] = useState('')
  const [catNameEn, setCatNameEn] = useState('')
  const [catSort, setCatSort] = useState('0')
  const [catActive, setCatActive] = useState(true)

  const resetCatForm = () => {
    setCatId(null)
    setCatNameFa('')
    setCatNameEn('')
    setCatSort('0')
    setCatActive(true)
  }

  const reload = async () => {
    setLoading(true)
    setError(null)
    try {
      const [p, a, g, cats, l, editorialCategories] = await Promise.all([
        fetchAllPosts(),
        fetchAllAnnouncements(),
        fetchGalleryItems(),
        fetchGalleryCategories(true),
        fetchLeaguesForContent(),
        fetchContentCategories(),
      ])
      setPosts(p)
      setAnnouncements(a)
      setGallery(g)
      setGalCategories(cats)
      setLeagues(l)
      setContentCategories(editorialCategories)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
  }, [])

  const resetPostForm = () => {
    setPostId(null)
    setPostTitle('')
    setPostSlug('')
    setPostBody('')
    setPostStatus('draft')
    setPostCover(null)
    setPostExcerpt('')
    setPostSeoTitle('')
    setPostMeta('')
    setPostCategoryId('')
    setPostAuthor('')
    setPostCoverAlt('')
    setPostEditorKey((k) => k + 1)
  }

  const editPost = (post: BlogPost) => {
    setPostId(post.id)
    setPostTitle(post.title)
    setPostSlug(post.slug)
    setPostBody(post.body)
    setPostStatus(post.status)
    setPostCover(post.cover_image)
    setPostExcerpt(post.excerpt ?? '')
    setPostSeoTitle(post.seo_title ?? '')
    setPostMeta(post.meta_description ?? '')
    setPostCategoryId(post.category_id ?? '')
    setPostAuthor(post.author_name ?? '')
    setPostCoverAlt(post.cover_alt ?? '')
    setPostEditorKey((k) => k + 1)
    setTab('blog')
  }

  const savePost = async (event: FormEvent) => {
    event.preventDefault()
    if (!user) return
    setBusy(true)
    setError(null)
    try {
      await upsertBlogPost({
        id: postId ?? undefined,
        title: postTitle,
        slug: postSlug,
        body: postBody,
        status: postStatus,
        cover_image: postCover,
        author_id: user.id,
        excerpt: postExcerpt,
        seo_title: postSeoTitle,
        meta_description: postMeta,
        og_image: postCover,
        category_id: postCategoryId || null,
        author_name: postAuthor,
        cover_alt: postCoverAlt,
      })
      resetPostForm()
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  const resetAnnForm = () => {
    setAnnId(null)
    setAnnTitle('')
    setAnnBody('')
    setAnnLeagueId('')
    setAnnStatus('draft')
    setAnnExcerpt('')
    setAnnSeoTitle('')
    setAnnMeta('')
    setAnnCover(null)
    setAnnSlug('')
    setAnnCategoryId('')
    setAnnAuthor('')
    setAnnCoverAlt('')
    setAnnEditorKey((k) => k + 1)
  }

  const editAnnouncement = (item: Announcement) => {
    setAnnId(item.id)
    setAnnTitle(item.title)
    setAnnBody(item.body)
    setAnnLeagueId(item.league_id ?? '')
    setAnnStatus(item.status)
    setAnnExcerpt(item.excerpt ?? '')
    setAnnSeoTitle(item.seo_title ?? '')
    setAnnMeta(item.meta_description ?? '')
    setAnnCover(item.cover_image ?? null)
    setAnnSlug(item.slug ?? '')
    setAnnCategoryId(item.category_id ?? '')
    setAnnAuthor(item.author_name ?? '')
    setAnnCoverAlt(item.cover_alt ?? '')
    setAnnEditorKey((k) => k + 1)
    setTab('announcements')
  }

  const saveAnnouncement = async (event: FormEvent) => {
    event.preventDefault()
    if (!user) return
    setBusy(true)
    setError(null)
    try {
      await upsertAnnouncement({
        id: annId ?? undefined,
        title: annTitle,
        body: annBody,
        league_id: annLeagueId || null,
        status: annStatus,
        created_by: user.id,
        excerpt: annExcerpt,
        seo_title: annSeoTitle,
        meta_description: annMeta,
        cover_image: annCover,
        slug: annSlug,
        category_id: annCategoryId || null,
        author_name: annAuthor,
        cover_alt: annCoverAlt,
        og_image: annCover,
      })
      resetAnnForm()
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  const saveGallery = async (event: FormEvent) => {
    event.preventDefault()
    if (!user || !galFile) {
      setError(t('auth.required'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      const url = await uploadContentMedia(user.id, galFile)
      await createGalleryItem({
        media_url: url,
        media_type: galType,
        league_id: galLeagueId || null,
        category_id: galCategoryId || null,
        season_year: galYear ? Number(galYear) : null,
        caption: galCaption || null,
      })
      setGalCaption('')
      setGalFile(null)
      await reload()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'error'
      setError(msg === 'invalid_type' || msg === 'too_large' ? t(`content.mediaErrors.${msg}`) : msg)
    } finally {
      setBusy(false)
    }
  }

  const saveCategory = async (event: FormEvent) => {
    event.preventDefault()
    if (!catNameFa.trim() || !catNameEn.trim()) {
      setError(t('auth.required'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      await upsertGalleryCategory({
        id: catId ?? undefined,
        name_fa: catNameFa,
        name_en: catNameEn,
        sort_order: Number(catSort) || 0,
        is_active: catActive,
      })
      resetCatForm()
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  const catLabel = (cat: GalleryCategory) => (i18n.language?.startsWith('fa') ? cat.name_fa : cat.name_en)

  const addEditorialCategory = async () => {
    if (!newCategoryFa.trim() || !newCategoryEn.trim()) return
    setBusy(true)
    setError(null)
    try {
      const created = await createContentCategory({ name_fa: newCategoryFa, name_en: newCategoryEn })
      setContentCategories((items) => [...items, created])
      setNewCategoryFa('')
      setNewCategoryEn('')
    } catch (err) { setError(err instanceof Error ? err.message : t('common.error')) } finally { setBusy(false) }
  }

  return (
    <PanelPage index="CMS.01" title={t('content.cmsTitle')} description={t('content.cmsSubtitle')}>

      <div className="panel-tabs flex flex-wrap gap-2 rounded-2xl border border-white/80 bg-white p-2 shadow-[0_12px_40px_rgb(18_76_98/0.07)]">
        {(['blog', 'announcements', 'gallery'] as Tab[]).map((key) => (
          <Button
            key={key}
            type="button"
            variant={tab === key ? 'primary' : 'ghost'}
            onClick={() => setTab(key)}
          >
            {t(`content.tabs.${key}`)}
          </Button>
        ))}
      </div>

      <FieldError message={error ?? undefined} />
      {loading ? <p className="text-rc-muted">{t('app.loading')}</p> : null}

      {tab === 'blog' ? (
        <div className="space-y-4">
          <section className="overflow-hidden rounded-[2rem] bg-gradient-to-l from-[#063d59] via-[#0873a0] to-[#087b61] p-6 text-white shadow-[0_20px_60px_rgb(8_126_184/0.16)] sm:p-8"><p className="text-xs font-black tracking-widest text-emerald-200">EDITORIAL WORKSPACE</p><h2 className="mt-2 text-2xl font-black">{i18n.language.startsWith('en') ? 'Create structured, searchable and SEO-ready stories' : 'تولید محتوای منظم، خوانا و آماده برای موتورهای جست‌وجو'}</h2><p className="mt-3 max-w-3xl text-sm leading-7 text-white/80">{i18n.language.startsWith('en') ? 'Complete the editorial information, media accessibility, article body and search preview before publishing.' : 'پیش از انتشار، اطلاعات تحریریه، دسترس‌پذیری تصویر، ساختار مطلب و پیش‌نمایش سئو را کامل کنید.'}</p></section>

          <PanelCard title={i18n.language.startsWith('en') ? 'Article categories' : 'دسته‌بندی مطالب'} description={i18n.language.startsWith('en') ? 'Categories help readers filter stories and clarify the subject for search engines.' : 'دسته‌بندی به یافتن سریع‌تر مطالب و درک بهتر موضوع توسط موتور جست‌وجو کمک می‌کند.'}><div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]"><Input label="نام فارسی" value={newCategoryFa} onChange={(e) => setNewCategoryFa(e.target.value)} /><Input label="English name" value={newCategoryEn} onChange={(e) => setNewCategoryEn(e.target.value)} dir="ltr" /><Button type="button" disabled={busy || !newCategoryFa.trim() || !newCategoryEn.trim()} onClick={() => void addEditorialCategory()}>{i18n.language.startsWith('en') ? 'Add category' : 'افزودن دسته‌بندی'}</Button></div>{contentCategories.length ? <div className="mt-4 flex flex-wrap gap-2">{contentCategories.map((item) => <span key={item.id} className="rounded-full bg-sky-50 px-3 py-1.5 text-xs font-bold text-sky-800 ring-1 ring-sky-100">{i18n.language.startsWith('en') ? item.name_en : item.name_fa}</span>)}</div> : null}</PanelCard>
          <PanelCard
            title={postId ? t('content.editPost') : t('content.newPost')}
            actions={
              postId ? (
                <Button type="button" variant="ghost" onClick={resetPostForm}>
                  {t('common.cancel')}
                </Button>
              ) : null
            }
          >
            <form className="space-y-3" onSubmit={(e) => void savePost(e)}>
              <Input
                label={t('content.postTitle')}
                required
                value={postTitle}
                onChange={(e) => {
                  setPostTitle(e.target.value)
                  if (!postId) setPostSlug(slugify(e.target.value))
                }}
              />
              <Input
                label={t('content.slug')}
                required
                value={postSlug}
                onChange={(e) => setPostSlug(slugify(e.target.value))}
                dir="ltr"
              />
              <Select
                label={t('content.status')}
                value={postStatus}
                onChange={(e) => setPostStatus(e.target.value as ContentStatus)}
              >
                <option value="draft">{t('content.statusDraft')}</option>
                <option value="published">{t('content.statusPublished')}</option>
              </Select>
              <div className="grid gap-3 md:grid-cols-2"><Select label={i18n.language.startsWith('en') ? 'Category' : 'دسته‌بندی'} value={postCategoryId} onChange={(e) => setPostCategoryId(e.target.value)}><option value="">{i18n.language.startsWith('en') ? 'Uncategorized' : 'بدون دسته‌بندی'}</option>{contentCategories.map((item) => <option key={item.id} value={item.id}>{i18n.language.startsWith('en') ? item.name_en : item.name_fa}</option>)}</Select><Input label={i18n.language.startsWith('en') ? 'Author display name' : 'نام نمایشی نویسنده'} value={postAuthor} onChange={(e) => setPostAuthor(e.target.value)} /></div>
              <ImageUploadField
                label={t('content.cover')}
                value={postCover}
                onChange={setPostCover}
              />
              <Input label={i18n.language.startsWith('en') ? 'Cover image alternative text' : 'متن جایگزین تصویر شاخص'} value={postCoverAlt} onChange={(e) => setPostCoverAlt(e.target.value)} placeholder={postTitle} />
              <Textarea
                label={t('content.excerpt')}
                className="min-h-20"
                value={postExcerpt}
                onChange={(e) => setPostExcerpt(e.target.value)}
              />
              <RichTextEditor
                label={t('content.body')}
                value={postBody}
                onChange={setPostBody}
                resetKey={`post-${postId ?? 'new'}-${postEditorKey}`}
                hint={t('content.editorHint')}
              />
              <div className="rounded-lg border border-rc-line bg-rc-navy/30 p-3 space-y-3">
                <p className="text-sm font-medium">{t('content.seoSection')}</p>
                <Input
                  label={t('content.seoTitle')}
                  value={postSeoTitle}
                  onChange={(e) => setPostSeoTitle(e.target.value)}
                  placeholder={postTitle}
                />
                <Textarea
                  label={t('content.metaDescription')}
                  className="min-h-20"
                  value={postMeta}
                  onChange={(e) => setPostMeta(e.target.value)}
                  placeholder={postExcerpt || postTitle}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={busy}>
                  {busy ? t('app.loading') : t('common.save')}
                </Button>
                {postSlug && postStatus === 'published' ? (
                  <Link
                    to={`/blog/${postSlug}`}
                    className="self-center text-sm text-rc-blue hover:underline"
                  >
                    {t('admin.pages.preview')}
                  </Link>
                ) : null}
              </div>
            </form>
          </PanelCard>

          <PanelCard title={t('content.postsList')}>
            <ul className="grid gap-3 md:grid-cols-2">
              {posts.map((post) => (
                <li key={post.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-100 bg-gradient-to-br from-white to-sky-50/60 p-4 shadow-sm">
                  <div>
                    <p className="font-black text-slate-900">{post.title}</p>
                    <p className="font-mono text-xs text-rc-muted">
                      {post.slug} · {post.status}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="secondary" onClick={() => editPost(post)}>
                      {t('common.edit')}
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      onClick={() =>
                        void deleteBlogPost(post.id)
                          .then(reload)
                          .catch((err: Error) => setError(err.message))
                      }
                    >
                      {t('common.delete')}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </PanelCard>
        </div>
      ) : null}

      {tab === 'announcements' ? (
        <div className="space-y-4">
          <section className="rounded-[2rem] border border-amber-100 bg-gradient-to-l from-amber-50 via-white to-sky-50 p-6 sm:p-8"><p className="text-xs font-black tracking-widest text-amber-700">OFFICIAL NOTICE DESK</p><h2 className="mt-2 text-2xl font-black text-slate-950">{i18n.language.startsWith('en') ? 'Publish clear, traceable official notices' : 'انتشار اطلاعیه‌های رسمی، روشن و قابل پیگیری'}</h2><p className="mt-2 text-sm leading-7 text-slate-600">{i18n.language.startsWith('en') ? 'Every notice receives its own shareable and search-friendly detail page.' : 'هر اطلاعیه صفحه مستقل، قابل اشتراک‌گذاری و بهینه برای جست‌وجو خواهد داشت.'}</p></section>
          <PanelCard
            title={annId ? t('content.editAnnouncement') : t('content.newAnnouncement')}
            actions={
              annId ? (
                <Button type="button" variant="ghost" onClick={resetAnnForm}>
                  {t('common.cancel')}
                </Button>
              ) : null
            }
          >
            <form className="space-y-3" onSubmit={(e) => void saveAnnouncement(e)}>
              <Input
                label={t('content.postTitle')}
                required
                value={annTitle}
                onChange={(e) => setAnnTitle(e.target.value)}
              />
              <Input label={t('content.slug')} value={annSlug} onChange={(e) => setAnnSlug(slugify(e.target.value))} dir="ltr" placeholder={slugify(annTitle)} />
              <Select
                label={t('team.league')}
                value={annLeagueId}
                onChange={(e) => setAnnLeagueId(e.target.value)}
              >
                <option value="">{t('content.allLeaguesOptional')}</option>
                {leagues.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
              <div className="grid gap-3 md:grid-cols-2"><Select label={i18n.language.startsWith('en') ? 'Category' : 'دسته‌بندی'} value={annCategoryId} onChange={(e) => setAnnCategoryId(e.target.value)}><option value="">{i18n.language.startsWith('en') ? 'Uncategorized' : 'بدون دسته‌بندی'}</option>{contentCategories.map((item) => <option key={item.id} value={item.id}>{i18n.language.startsWith('en') ? item.name_en : item.name_fa}</option>)}</Select><Input label={i18n.language.startsWith('en') ? 'Author display name' : 'نام نمایشی نویسنده'} value={annAuthor} onChange={(e) => setAnnAuthor(e.target.value)} /></div>
              <Select
                label={t('content.status')}
                value={annStatus}
                onChange={(e) => setAnnStatus(e.target.value as ContentStatus)}
              >
                <option value="draft">{t('content.statusDraft')}</option>
                <option value="published">{t('content.statusPublished')}</option>
              </Select>
              <ImageUploadField
                label={t('content.cover')}
                value={annCover}
                onChange={setAnnCover}
              />
              <Input label={i18n.language.startsWith('en') ? 'Cover image alternative text' : 'متن جایگزین تصویر شاخص'} value={annCoverAlt} onChange={(e) => setAnnCoverAlt(e.target.value)} placeholder={annTitle} />
              <Textarea
                label={t('content.excerpt')}
                className="min-h-20"
                value={annExcerpt}
                onChange={(e) => setAnnExcerpt(e.target.value)}
              />
              <RichTextEditor
                label={t('content.body')}
                value={annBody}
                onChange={setAnnBody}
                resetKey={`ann-${annId ?? 'new'}-${annEditorKey}`}
                hint={t('content.editorHint')}
                minHeightClass="min-h-40"
              />
              <div className="rounded-lg border border-rc-line bg-rc-navy/30 p-3 space-y-3">
                <p className="text-sm font-medium">{t('content.seoSection')}</p>
                <Input
                  label={t('content.seoTitle')}
                  value={annSeoTitle}
                  onChange={(e) => setAnnSeoTitle(e.target.value)}
                  placeholder={annTitle}
                />
                <Textarea
                  label={t('content.metaDescription')}
                  className="min-h-20"
                  value={annMeta}
                  onChange={(e) => setAnnMeta(e.target.value)}
                  placeholder={annExcerpt || annTitle}
                />
              </div>
              <Button type="submit" disabled={busy}>
                {busy ? t('app.loading') : t('common.save')}
              </Button>
            </form>
          </PanelCard>

          <PanelCard title={t('content.announcementsList')}>
            <ul className="grid gap-3 md:grid-cols-2">
              {announcements.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-100 bg-gradient-to-br from-white to-amber-50/60 p-4 shadow-sm">
                  <div>
                    <p className="font-black text-slate-900">{item.title}</p>
                    <p className="font-mono text-xs text-rc-muted">{item.status}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="secondary" onClick={() => editAnnouncement(item)}>
                      {t('common.edit')}
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      onClick={() =>
                        void deleteAnnouncement(item.id)
                          .then(reload)
                          .catch((err: Error) => setError(err.message))
                      }
                    >
                      {t('common.delete')}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </PanelCard>
        </div>
      ) : null}

      {tab === 'gallery' ? (
        <div className="space-y-4">
          <PanelCard title={t('content.manageCategories')} description={t('content.manageCategoriesHint')}>
            <form className="grid gap-3 md:grid-cols-2" onSubmit={(e) => void saveCategory(e)}>
              <Input
                label={t('content.categoryNameFa')}
                required
                value={catNameFa}
                onChange={(e) => setCatNameFa(e.target.value)}
              />
              <Input
                label={t('content.categoryNameEn')}
                required
                value={catNameEn}
                onChange={(e) => setCatNameEn(e.target.value)}
                dir="ltr"
              />
              <Input
                label={t('content.categorySort')}
                type="number"
                value={catSort}
                onChange={(e) => setCatSort(e.target.value)}
                dir="ltr"
              />
              <label className="flex items-end gap-2 pb-2 text-sm text-rc-muted">
                <input
                  type="checkbox"
                  checked={catActive}
                  onChange={(e) => setCatActive(e.target.checked)}
                />
                {t('content.categoryActive')}
              </label>
              <div className="flex flex-wrap gap-2 md:col-span-2">
                <Button type="submit" disabled={busy}>
                  {catId ? t('common.save') : t('content.addCategory')}
                </Button>
                {catId ? (
                  <Button type="button" variant="ghost" onClick={resetCatForm}>
                    {t('common.cancel')}
                  </Button>
                ) : null}
              </div>
            </form>
            <ul className="mt-4 divide-y divide-white/10">
              {galCategories.map((cat) => (
                <li key={cat.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <div>
                    <span className="font-medium">{catLabel(cat)}</span>
                    <span className="ms-2 font-mono text-xs text-rc-muted">#{cat.sort_order}</span>
                    {!cat.is_active ? (
                      <span className="ms-2 text-xs text-amber-400/90">off</span>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setCatId(cat.id)
                        setCatNameFa(cat.name_fa)
                        setCatNameEn(cat.name_en)
                        setCatSort(String(cat.sort_order))
                        setCatActive(cat.is_active)
                      }}
                    >
                      {t('common.edit')}
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      onClick={() =>
                        void deleteGalleryCategory(cat.id)
                          .then(reload)
                          .catch((err: Error) => setError(err.message))
                      }
                    >
                      {t('common.delete')}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </PanelCard>

          <PanelCard title={t('content.addGallery')}>
            <form className="grid gap-3 md:grid-cols-2" onSubmit={(e) => void saveGallery(e)}>
              <Select
                label={t('content.mediaType')}
                value={galType}
                onChange={(e) => setGalType(e.target.value)}
              >
                <option value="image">image</option>
                <option value="video">video</option>
              </Select>
              <Input
                label={t('rankings.year')}
                type="number"
                value={galYear}
                onChange={(e) => setGalYear(e.target.value)}
                dir="ltr"
              />
              <Select
                label={t('content.categoryPick')}
                value={galCategoryId}
                onChange={(e) => setGalCategoryId(e.target.value)}
              >
                <option value="">{t('content.categoryPickHint')}</option>
                {galCategories
                  .filter((c) => c.is_active)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {catLabel(c)}
                    </option>
                  ))}
              </Select>
              <Select
                label={t('team.league')}
                value={galLeagueId}
                onChange={(e) => setGalLeagueId(e.target.value)}
              >
                <option value="">{t('content.allLeaguesOptional')}</option>
                {leagues.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
              <Input
                label={t('content.caption')}
                value={galCaption}
                onChange={(e) => setGalCaption(e.target.value)}
                className="md:col-span-2"
              />
              <div className="md:col-span-2">
                <label className="block space-y-1.5">
                  <span className="text-sm text-rc-muted">{t('content.mediaFile')}</span>
                  <input
                    type="file"
                    accept="image/*,video/mp4,video/webm"
                    className="block w-full text-sm text-rc-muted file:me-3 file:rounded-md file:border-0 file:bg-rc-blue/15 file:px-3 file:py-2 file:text-rc-blue"
                    onChange={(e) => setGalFile(e.target.files?.[0] ?? null)}
                  />
                </label>
              </div>
              <Button type="submit" disabled={busy}>
                {t('common.save')}
              </Button>
            </form>
          </PanelCard>

          <PanelCard title={t('content.galleryList')}>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {gallery.map((item) => {
                const cat = galCategories.find((c) => c.id === item.category_id)
                return (
                  <li key={item.id} className="rounded-lg border border-white/10 p-2">
                    {item.media_type === 'video' ? (
                      <video src={item.media_url} className="aspect-video w-full rounded bg-black" />
                    ) : (
                      <img
                        src={item.media_url}
                        alt=""
                        className="aspect-video w-full rounded object-cover"
                      />
                    )}
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="line-clamp-1 text-xs text-rc-muted">{item.caption ?? '—'}</span>
                        <p className="truncate text-[11px] text-rc-blue/80">
                          {cat ? catLabel(cat) : t('content.uncategorized')}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="danger"
                        onClick={() =>
                          void deleteGalleryItem(item.id)
                            .then(reload)
                            .catch((err: Error) => setError(err.message))
                        }
                      >
                        {t('common.delete')}
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </PanelCard>
        </div>
      ) : null}
    </PanelPage>
  )
}
