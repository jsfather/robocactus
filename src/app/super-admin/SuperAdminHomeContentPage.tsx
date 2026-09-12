import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Button,
  FieldError,
  Input,
  PanelCard,
  Select,
  Textarea,
} from '@/components/ui/FormControls'
import { PanelPage } from '@/components/layout/PanelShell'
import { ImageUploadField } from '@/components/ui/ImageUploadField'
import { DateTimeField } from '@/components/ui/DateTimeField'
import {
  deleteBanner,
  fetchAllBanners,
  upsertBanner,
} from '@/features/home/api'
import {
  deleteEvent,
  deleteFaq,
  deletePartner,
  deleteSponsor,
  deleteStatCard,
  deleteWhyCard,
  fetchAllEvents,
  fetchAllFaqs,
  fetchAllPartners,
  fetchAllSponsors,
  fetchAllStatCards,
  fetchAllWhyCards,
  upsertEvent,
  upsertFaq,
  upsertPartner,
  upsertSponsor,
  upsertStatCard,
  upsertWhyCard,
  type HomeEvent,
  type HomeFaq,
  type HomePartner,
  type HomeSponsor,
  type HomeStatCard,
  type HomeWhyCard,
} from '@/features/home/homeSectionsApi'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/components/ui/Toast'
import type { HomeBanner } from '@/types/database'
import type { HomepageContent, SiteSettings } from '@/types/database'
import { fetchSiteSettings, updateSiteSettings } from '@/features/settings/api'

type Tab =
  | 'banners'
  | 'sponsors'
  | 'stats'
  | 'why'
  | 'events'
  | 'partners'
  | 'faqs'
  | 'landing'

function formatHeroStats(items?: Array<{ value: string; label: string }>) {
  return (items ?? []).map((item) => `${item.value} | ${item.label}`).join('\n')
}

export function SuperAdminHomeContentPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const toast = useToast()
  const [tab, setTab] = useState<Tab>('banners')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<{ tab: Tab; id: string } | null>(null)

  const [banners, setBanners] = useState<HomeBanner[]>([])
  const [sponsors, setSponsors] = useState<HomeSponsor[]>([])
  const [stats, setStats] = useState<HomeStatCard[]>([])
  const [why, setWhy] = useState<HomeWhyCard[]>([])
  const [events, setEvents] = useState<HomeEvent[]>([])
  const [partners, setPartners] = useState<HomePartner[]>([])
  const [faqs, setFaqs] = useState<HomeFaq[]>([])
  const [siteSettings, setSiteSettings] = useState<SiteSettings | null>(null)

  const reload = async () => {
    setLoading(true)
    setError(null)
    try {
      const [b, sp, st, w, ev, pa, f, settings] = await Promise.all([
        fetchAllBanners(),
        fetchAllSponsors(),
        fetchAllStatCards(),
        fetchAllWhyCards(),
        fetchAllEvents(),
        fetchAllPartners(),
        fetchAllFaqs(),
        fetchSiteSettings(),
      ])
      setBanners(b)
      setSponsors(sp)
      setStats(st)
      setWhy(w)
      setEvents(ev)
      setPartners(pa)
      setFaqs(f)
      setSiteSettings(settings)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
  }, [])

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'banners', label: t('home.bannersTab') },
    { id: 'sponsors', label: t('home.sponsorsTab') },
    { id: 'stats', label: t('home.statsTab') },
    { id: 'why', label: t('home.whyTab') },
    { id: 'events', label: t('home.eventsTab') },
    { id: 'partners', label: t('home.partnersTab') },
    { id: 'faqs', label: t('home.faqsTab') },
    { id: 'landing', label: t('home.landingTab') },
  ]

  return (
    <PanelPage index="HOME" title={t('home.adminTitle')} description={t('home.adminSubtitle')}>
      <FieldError message={error ?? undefined} />
      <div className="panel-tabs mb-6 flex flex-wrap gap-2 rounded-2xl border border-white/80 bg-white p-2 shadow-[0_12px_40px_rgb(18_76_98/0.07)]">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`border px-3 py-1.5 text-sm ${
              tab === item.id
                ? 'border-rc-blue/40 bg-rc-blue/15 text-rc-blue'
                : 'border-rc-line text-rc-muted hover:text-rc-text'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {loading ? <p className="text-rc-muted">{t('app.loading')}</p> : null}

      {tab === 'banners' ? (
        <BannersTab
          banners={banners}
          busy={busy}
          setBusy={setBusy}
          setError={setError}
          userId={user?.id}
          onReload={reload}
        />
      ) : null}

      {tab === 'landing' ? <HomepageContentForm settings={siteSettings} busy={busy} setBusy={setBusy} onReload={reload} setError={setError} /> : null}

      {tab === 'sponsors' ? (
        <SimpleCrud
          title={t('home.sponsorsTab')}
          items={sponsors.map((s) => ({
            id: s.id,
            label: s.name,
            onEdit: () => setEditing({ tab: 'sponsors', id: s.id }),
            onDelete: () => deleteSponsor(s.id).then(reload).then(() => toast.success(t('common.saved'))),
          }))}
        >
          <SponsorForm
            key={editing?.tab === 'sponsors' ? editing.id : 'new-sponsor'}
            initial={editing?.tab === 'sponsors' ? sponsors.find((row) => row.id === editing.id) : undefined}
            onCancel={() => setEditing(null)}
            busy={busy}
            setBusy={setBusy}
            onSaved={() => {
              toast.success(t('common.saved'))
              setEditing(null)
              void reload()
            }}
          />
        </SimpleCrud>
      ) : null}

      {tab === 'stats' ? (
        <SimpleCrud
          title={t('home.statsTab')}
          items={stats.map((s) => ({
            id: s.id,
            label: `${s.label_fa} / ${s.value_num} · ${s.is_active ? 'فعال' : 'غیرفعال'}`,
            onEdit: () => setEditing({ tab: 'stats', id: s.id }),
            onDelete: () => deleteStatCard(s.id).then(reload).then(() => toast.success(t('common.saved'))),
            actionLabel: s.is_active ? 'غیرفعال کردن' : 'فعال کردن',
            onAction: () => upsertStatCard({ ...s, is_active: !s.is_active }).then(reload),
          }))}
        >
          <StatForm
            key={editing?.tab === 'stats' ? editing.id : 'new-stat'}
            initial={editing?.tab === 'stats' ? stats.find((row) => row.id === editing.id) : undefined}
            onCancel={() => setEditing(null)}
            busy={busy}
            setBusy={setBusy}
            onSaved={() => {
              toast.success(t('common.saved'))
              setEditing(null)
              void reload()
            }}
          />
        </SimpleCrud>
      ) : null}

      {tab === 'why' ? (
        <SimpleCrud
          title={t('home.whyTab')}
          items={why.map((s) => ({
            id: s.id,
            label: s.title_fa,
            onEdit: () => setEditing({ tab: 'why', id: s.id }),
            onDelete: () => deleteWhyCard(s.id).then(reload).then(() => toast.success(t('common.saved'))),
          }))}
        >
          <WhyForm
            key={editing?.tab === 'why' ? editing.id : 'new-why'}
            initial={editing?.tab === 'why' ? why.find((row) => row.id === editing.id) : undefined}
            onCancel={() => setEditing(null)}
            busy={busy}
            setBusy={setBusy}
            onSaved={() => {
              toast.success(t('common.saved'))
              setEditing(null)
              void reload()
            }}
          />
        </SimpleCrud>
      ) : null}

      {tab === 'events' ? (
        <SimpleCrud
          title={t('home.eventsTab')}
          items={events.map((s) => ({
            id: s.id,
            label: `${s.title_fa} · ${s.event_date}`,
            onEdit: () => setEditing({ tab: 'events', id: s.id }),
            onDelete: () => deleteEvent(s.id).then(reload).then(() => toast.success(t('common.saved'))),
          }))}
        >
          <EventForm
            key={editing?.tab === 'events' ? editing.id : 'new-event'}
            initial={editing?.tab === 'events' ? events.find((row) => row.id === editing.id) : undefined}
            onCancel={() => setEditing(null)}
            busy={busy}
            setBusy={setBusy}
            onSaved={() => {
              toast.success(t('common.saved'))
              setEditing(null)
              void reload()
            }}
          />
        </SimpleCrud>
      ) : null}

      {tab === 'partners' ? (
        <SimpleCrud
          title={t('home.partnersTab')}
          items={partners.map((s) => ({
            id: s.id,
            label: s.name_fa,
            onEdit: () => setEditing({ tab: 'partners', id: s.id }),
            onDelete: () => deletePartner(s.id).then(reload).then(() => toast.success(t('common.saved'))),
          }))}
        >
          <PartnerForm
            key={editing?.tab === 'partners' ? editing.id : 'new-partner'}
            initial={editing?.tab === 'partners' ? partners.find((row) => row.id === editing.id) : undefined}
            onCancel={() => setEditing(null)}
            busy={busy}
            setBusy={setBusy}
            onSaved={() => {
              toast.success(t('common.saved'))
              setEditing(null)
              void reload()
            }}
          />
        </SimpleCrud>
      ) : null}

      {tab === 'faqs' ? (
        <SimpleCrud
          title={t('home.faqsTab')}
          items={faqs.map((s) => ({
            id: s.id,
            label: s.question_fa,
            onEdit: () => setEditing({ tab: 'faqs', id: s.id }),
            onDelete: () => deleteFaq(s.id).then(reload).then(() => toast.success(t('common.saved'))),
          }))}
        >
          <FaqForm
            key={editing?.tab === 'faqs' ? editing.id : 'new-faq'}
            initial={editing?.tab === 'faqs' ? faqs.find((row) => row.id === editing.id) : undefined}
            onCancel={() => setEditing(null)}
            busy={busy}
            setBusy={setBusy}
            onSaved={() => {
              toast.success(t('common.saved'))
              setEditing(null)
              void reload()
            }}
          />
        </SimpleCrud>
      ) : null}

      {/* Contact inbox moved to /super-admin/contact-inbox for a focused workflow.
      {tab === 'inbox' ? (
        <PanelCard title={t('home.inboxTab')}>
          {messages.length === 0 ? (
            <p className="text-sm text-rc-muted">{t('home.inboxEmpty')}</p>
          ) : (
            <ul className="divide-y divide-rc-line">
              {messages.map((m) => (
                <li key={m.id} className="py-3 text-sm">
                  <p className="font-medium">
                    {m.full_name} · {m.subject}
                  </p>
                  <p className="text-rc-muted">{m.body}</p>
                </li>
              ))}
            </ul>
          )}
        </PanelCard>
      ) : null} */}
    </PanelPage>
  )
}

function HomepageContentForm({
  settings,
  busy,
  setBusy,
  onReload,
  setError,
}: {
  settings: SiteSettings | null
  busy: boolean
  setBusy: (value: boolean) => void
  onReload: () => Promise<void>
  setError: (value: string | null) => void
}) {
  const toast = useToast()
  const [draft, setDraft] = useState<HomepageContent>(() => settings?.homepage_content ?? {})
  const settingsContentKey = useMemo(() => JSON.stringify(settings?.homepage_content ?? {}), [settings?.homepage_content])
  const [statsFaText, setStatsFaText] = useState(() => formatHeroStats(settings?.homepage_content?.hero?.stats_fa))
  const [statsEnText, setStatsEnText] = useState(() => formatHeroStats(settings?.homepage_content?.hero?.stats_en))
  useEffect(() => {
    if (!settings) return
    setDraft(settings?.homepage_content ?? {})
    setStatsFaText(formatHeroStats(settings.homepage_content?.hero?.stats_fa))
    setStatsEnText(formatHeroStats(settings.homepage_content?.hero?.stats_en))
  }, [settingsContentKey])
  const patch = <S extends keyof HomepageContent>(section: S, key: keyof NonNullable<HomepageContent[S]>, value: string | Array<{ value: string; label: string }> | string[]) => {
    setDraft((current) => ({ ...current, [section]: { ...(current[section] ?? {}), [key]: value } }))
  }
  const section = <S extends keyof HomepageContent>(key: S): NonNullable<HomepageContent[S]> => (draft[key] ?? {}) as NonNullable<HomepageContent[S]>
  const parseStats = (value: string) => value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => { const [statValue, ...label] = line.split('|'); return { value: statValue.trim(), label: label.join('|').trim() } }).filter((item) => item.value && item.label)
  const badgesText = (items?: string[]) => (items ?? []).join('\n')
  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (!settings) return
    setBusy(true)
    setError(null)
    try {
      const homepageContent: HomepageContent = { ...draft, hero: { ...(draft.hero ?? {}), stats_fa: parseStats(statsFaText), stats_en: parseStats(statsEnText) } }
      await updateSiteSettings({ homepage_content: homepageContent })
      await onReload()
      toast.success('محتوای صفحه اصلی ذخیره شد.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'ذخیره محتوای صفحه اصلی ناموفق بود.'
      setError(message)
      toast.error(message)
    } finally {
      setBusy(false)
    }
  }
  if (!settings) return <PanelCard title="محتوای صفحه اصلی"><p className="text-sm text-rc-muted">تنظیمات سایت در دسترس نیست.</p></PanelCard>
  return <form className="space-y-5" onSubmit={(event) => void save(event)}>
    <PanelCard title="متن‌های هیرو" description="متن‌های ثابت هیرو و سه شاخص پایین آن از این بخش خوانده می‌شوند.">
      <div className="grid gap-3 md:grid-cols-2">
        <Input label="برچسب بالای هیرو (FA)" value={section('hero').eyebrow_fa ?? ''} onChange={(event) => patch('hero', 'eyebrow_fa', event.target.value)} />
        <Input label="Hero eyebrow (EN)" dir="ltr" value={section('hero').eyebrow_en ?? ''} onChange={(event) => patch('hero', 'eyebrow_en', event.target.value)} />
        <Input label="کد/نام رویداد (FA)" value={section('hero').kicker_fa ?? ''} onChange={(event) => patch('hero', 'kicker_fa', event.target.value)} />
        <Input label="Event kicker (EN)" dir="ltr" value={section('hero').kicker_en ?? ''} onChange={(event) => patch('hero', 'kicker_en', event.target.value)} />
        <Input label="متن دکمه ثبت‌نام (FA)" value={section('hero').primary_label_fa ?? ''} onChange={(event) => patch('hero', 'primary_label_fa', event.target.value)} />
        <Input label="Primary CTA (EN)" dir="ltr" value={section('hero').primary_label_en ?? ''} onChange={(event) => patch('hero', 'primary_label_en', event.target.value)} />
        <Input label="متن دکمه لیگ‌ها (FA)" value={section('hero').secondary_label_fa ?? ''} onChange={(event) => patch('hero', 'secondary_label_fa', event.target.value)} />
        <Input label="Leagues CTA (EN)" dir="ltr" value={section('hero').secondary_label_en ?? ''} onChange={(event) => patch('hero', 'secondary_label_en', event.target.value)} />
        <Textarea label="شاخص‌های هیرو (FA)" className="min-h-24" value={statsFaText} onChange={(event) => setStatsFaText(event.target.value)} placeholder="آمل | شهر علم و طبیعت\nمازندران | میزبان نوآوری" />
        <Textarea label="Hero stats (EN)" dir="ltr" className="min-h-24" value={statsEnText} onChange={(event) => setStatsEnText(event.target.value)} placeholder="Amol | City of science and nature\nMazandaran | Home of innovation" />
      </div>
    </PanelCard>
    <PanelCard title="بخش معرفی رویداد" description="متن بخش «ریشه در تبرستان، نگاه به جهان» و کارت هویت رویداد قابل ویرایش است.">
      <div className="grid gap-3 md:grid-cols-2">
        <Input label="برچسب بخش (FA)" value={section('story').eyebrow_fa ?? ''} onChange={(event) => patch('story', 'eyebrow_fa', event.target.value)} />
        <Input label="Section eyebrow (EN)" dir="ltr" value={section('story').eyebrow_en ?? ''} onChange={(event) => patch('story', 'eyebrow_en', event.target.value)} />
        <Input label="عنوان بخش (FA)" value={section('story').title_fa ?? ''} onChange={(event) => patch('story', 'title_fa', event.target.value)} />
        <Input label="Section title (EN)" dir="ltr" value={section('story').title_en ?? ''} onChange={(event) => patch('story', 'title_en', event.target.value)} />
        <Textarea label="توضیحات بخش (FA)" className="min-h-28" value={section('story').body_fa ?? ''} onChange={(event) => patch('story', 'body_fa', event.target.value)} />
        <Textarea label="Section body (EN)" dir="ltr" className="min-h-28" value={section('story').body_en ?? ''} onChange={(event) => patch('story', 'body_en', event.target.value)} />
        <Textarea label="برچسب‌های بخش (FA)" className="min-h-24" value={badgesText(section('story').badges_fa)} onChange={(event) => patch('story', 'badges_fa', event.target.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))} />
        <Textarea label="Story badges (EN)" dir="ltr" className="min-h-24" value={badgesText(section('story').badges_en)} onChange={(event) => patch('story', 'badges_en', event.target.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))} />
        <Input label="عنوان کارت هویت (FA)" value={section('story').metric_label_fa ?? ''} onChange={(event) => patch('story', 'metric_label_fa', event.target.value)} />
        <Input label="Metric label (EN)" dir="ltr" value={section('story').metric_label_en ?? ''} onChange={(event) => patch('story', 'metric_label_en', event.target.value)} />
        <Input label="مقدار شاخص" dir="ltr" value={section('story').metric_value ?? ''} onChange={(event) => patch('story', 'metric_value', event.target.value)} />
        <Input label="عنوان کارت (FA)" value={section('story').metric_title_fa ?? ''} onChange={(event) => patch('story', 'metric_title_fa', event.target.value)} />
        <Input label="Metric title (EN)" dir="ltr" value={section('story').metric_title_en ?? ''} onChange={(event) => patch('story', 'metric_title_en', event.target.value)} />
        <Textarea label="توضیح کارت (FA)" className="min-h-24" value={section('story').metric_body_fa ?? ''} onChange={(event) => patch('story', 'metric_body_fa', event.target.value)} />
        <Textarea label="Metric body (EN)" dir="ltr" className="min-h-24" value={section('story').metric_body_en ?? ''} onChange={(event) => patch('story', 'metric_body_en', event.target.value)} />
      </div>
    </PanelCard>
    <PanelCard title="فراخوان پایانی صفحه اصلی">
      <div className="grid gap-3 md:grid-cols-2">
        <Input label="عنوان پایانی (FA)" value={section('cta').title_fa ?? ''} onChange={(event) => patch('cta', 'title_fa', event.target.value)} />
        <Input label="Final CTA title (EN)" dir="ltr" value={section('cta').title_en ?? ''} onChange={(event) => patch('cta', 'title_en', event.target.value)} />
        <Textarea label="توضیح پایانی (FA)" value={section('cta').body_fa ?? ''} onChange={(event) => patch('cta', 'body_fa', event.target.value)} />
        <Textarea label="Final CTA body (EN)" dir="ltr" value={section('cta').body_en ?? ''} onChange={(event) => patch('cta', 'body_en', event.target.value)} />
        <Input label="دکمه اصلی (FA)" value={section('cta').primary_label_fa ?? ''} onChange={(event) => patch('cta', 'primary_label_fa', event.target.value)} />
        <Input label="Primary button (EN)" dir="ltr" value={section('cta').primary_label_en ?? ''} onChange={(event) => patch('cta', 'primary_label_en', event.target.value)} />
        <Input label="دکمه دوم (FA)" value={section('cta').secondary_label_fa ?? ''} onChange={(event) => patch('cta', 'secondary_label_fa', event.target.value)} />
        <Input label="Secondary button (EN)" dir="ltr" value={section('cta').secondary_label_en ?? ''} onChange={(event) => patch('cta', 'secondary_label_en', event.target.value)} />
      </div>
    </PanelCard>
    <Button type="submit" disabled={busy}>{busy ? 'در حال ذخیره…' : 'ذخیره محتوای صفحه اصلی'}</Button>
  </form>
}

function SimpleCrud({
  title,
  items,
  children,
}: {
  title: string
  items: Array<{ id: string; label: string; onDelete: () => Promise<unknown>; onEdit?: () => void; actionLabel?: string; onAction?: () => Promise<unknown> }>
  children: React.ReactNode
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const run = async (action: () => Promise<unknown>) => {
    try { await action() } catch (err) { toast.error(err instanceof Error ? err.message : t('common.error')) }
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <PanelCard title={title}>{children}</PanelCard>
      <PanelCard title={t('home.list')}>
        <ul className="divide-y divide-rc-line">
          {items.length === 0 ? (
            <li className="py-2 text-sm text-rc-muted">{t('home.emptyList')}</li>
          ) : (
            items.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span>{item.label}</span>
                <div className="flex flex-wrap gap-2">{item.onEdit ? <Button type="button" variant="ghost" onClick={item.onEdit}>{t('common.edit')}</Button> : null}{item.onAction ? <Button type="button" variant="secondary" onClick={() => void run(item.onAction!)}>{item.actionLabel}</Button> : null}<Button type="button" variant="danger" onClick={() => void run(item.onDelete)}>{t('common.delete')}</Button></div>
              </li>
            ))
          )}
        </ul>
      </PanelCard>
    </div>
  )
}

function BannersTab({
  banners,
  busy,
  setBusy,
  setError,
  userId,
  onReload,
}: {
  banners: HomeBanner[]
  busy: boolean
  setBusy: (v: boolean) => void
  setError: (v: string | null) => void
  userId?: string
  onReload: () => Promise<void>
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [editingId, setEditingId] = useState<string | undefined>()
  const [sortOrder, setSortOrder] = useState(0)
  const [isActive, setIsActive] = useState(true)

  const reset = () => {
    setEditingId(undefined)
    setTitle('')
    setSubtitle('')
    setImageUrl('')
    setLinkUrl('')
    setSortOrder(0)
    setIsActive(true)
  }

  const edit = (banner: HomeBanner) => {
    setEditingId(banner.id)
    setTitle(banner.title)
    setSubtitle(banner.subtitle ?? '')
    setImageUrl(banner.image_url)
    setLinkUrl(banner.link_url ?? '')
    setSortOrder(banner.sort_order)
    setIsActive(banner.is_active)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      await upsertBanner({ id: editingId, title, subtitle, image_url: imageUrl, link_url: linkUrl, sort_order: sortOrder, is_active: isActive })
      reset()
      await onReload()
      toast.success(t('common.saved'))
    } catch (err) {
      const message = err instanceof Error ? err.message : t('common.error')
      setError(message)
      toast.error(message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(340px,0.8fr)_minmax(0,1.35fr)]">
      <div className="space-y-4 xl:sticky xl:top-24">
        <PanelCard title={editingId ? t('home.editBanner') : t('home.newBanner')}>
          <form className="space-y-4" onSubmit={(e) => void save(e)}>
            <div className="overflow-hidden rounded-2xl border border-rc-line bg-slate-900">
              <div className="relative aspect-[16/7]">
                {imageUrl ? <img src={imageUrl} alt="" className="h-full w-full object-cover opacity-80" /> : <div className="grid h-full place-items-center text-xs text-white/60">{t('home.bannerImageUrl')}</div>}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-4 text-white"><strong className="block text-base">{title || t('content.title')}</strong><span className="mt-1 block line-clamp-1 text-xs text-white/70">{subtitle || t('home.bannerSubtitle')}</span></div>
              </div>
            </div>
            <Input label={t('content.title')} value={title} onChange={(e) => setTitle(e.target.value)} required />
            <Input label={t('home.bannerSubtitle')} value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
            <ImageUploadField label={t('home.bannerImageUrl')} value={imageUrl || null} onChange={(url) => setImageUrl(url ?? '')} />
            <Input label={t('home.bannerLink')} value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} dir="ltr" />
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label={t('home.bannerOrder')} type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} />
              <label className="flex cursor-pointer items-center justify-between rounded-xl border border-rc-line bg-slate-50 px-4 py-3 text-sm font-bold text-rc-text"><span>{isActive ? t('home.bannerActive') : t('home.bannerInactive')}</span><input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-5 w-5 accent-rc-blue" /></label>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={busy || !imageUrl || !userId}>{t('common.save')}</Button>
              {editingId ? <Button type="button" variant="secondary" onClick={reset}>{t('common.cancel')}</Button> : null}
            </div>
          </form>
        </PanelCard>
      </div>
      <PanelCard title={`${t('home.bannersList')} (${banners.length})`}>
        {banners.length === 0 ? <div className="rounded-2xl border border-dashed border-rc-line p-10 text-center text-sm text-rc-muted">{t('home.emptyList')}</div> : null}
        <div className="grid gap-4 md:grid-cols-2">
          {banners.map((banner) => (
            <article key={banner.id} className={`group overflow-hidden rounded-2xl border bg-white transition hover:-translate-y-0.5 hover:shadow-lg ${editingId === banner.id ? 'border-rc-blue ring-4 ring-rc-blue/10' : 'border-rc-line'}`}>
              <button type="button" onClick={() => edit(banner)} className="block w-full text-start">
                <div className="relative aspect-[16/7] overflow-hidden bg-slate-100"><img src={banner.image_url} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /><span className={`absolute end-3 top-3 rounded-full px-2.5 py-1 text-[10px] font-black ${banner.is_active ? 'bg-emerald-500 text-white' : 'bg-slate-800/80 text-white'}`}>{banner.is_active ? t('home.bannerActive') : t('home.bannerInactive')}</span></div>
                <div className="p-4"><div className="flex items-start justify-between gap-3"><strong className="line-clamp-1 text-sm text-rc-text">{banner.title}</strong><span className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-bold text-rc-muted">#{banner.sort_order}</span></div><p className="mt-2 line-clamp-2 min-h-10 text-xs leading-5 text-rc-muted">{banner.subtitle || '—'}</p></div>
              </button>
              <div className="flex items-center justify-between border-t border-rc-line px-4 py-3"><Button type="button" variant="secondary" onClick={() => edit(banner)}>{t('common.edit')}</Button><Button type="button" variant="danger" onClick={() => void deleteBanner(banner.id).then(onReload)}>{t('common.delete')}</Button></div>
            </article>
          ))}
        </div>
      </PanelCard>
    </div>
  )
}

function SponsorForm({
  initial,
  onCancel,
  busy,
  setBusy,
  onSaved,
}: {
  initial?: HomeSponsor
  onCancel: () => void
  busy: boolean
  setBusy: (v: boolean) => void
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const [name, setName] = useState(initial?.name ?? '')
  const [logo, setLogo] = useState(initial?.logo_url ?? '')
  const [link, setLink] = useState(initial?.link_url ?? '')
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        setBusy(true)
        void upsertSponsor({ id: initial?.id, name, logo_url: logo, link_url: link || null })
          .then(onSaved)
          .then(() => {
            setName('')
            setLogo('')
            setLink('')
          })
          .catch((err: unknown) => toast.error(err instanceof Error ? err.message : t('common.error')))
          .finally(() => setBusy(false))
      }}
    >
      <Input label={t('home.sponsorsTitle')} value={name} onChange={(e) => setName(e.target.value)} required />
      <ImageUploadField label={t('home.logo')} value={logo || null} onChange={(url) => setLogo(url ?? '')} />
      <Input label={t('home.bannerLink')} value={link} onChange={(e) => setLink(e.target.value)} dir="ltr" />
      <Button type="submit" disabled={busy || !logo}>
        {t('common.save')}
      </Button>
      {initial ? <Button type="button" variant="secondary" onClick={onCancel}>{t('common.cancel')}</Button> : null}
    </form>
  )
}

function StatForm({
  initial,
  onCancel,
  busy,
  setBusy,
  onSaved,
}: {
  initial?: HomeStatCard
  onCancel: () => void
  busy: boolean
  setBusy: (v: boolean) => void
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const [labelFa, setLabelFa] = useState(initial?.label_fa ?? '')
  const [labelEn, setLabelEn] = useState(initial?.label_en ?? '')
  const [value, setValue] = useState(String(initial?.value_num ?? 0))
  const [active, setActive] = useState(initial?.is_active ?? true)
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        setBusy(true)
        void upsertStatCard({
          id: initial?.id,
          label_fa: labelFa,
          label_en: labelEn,
          value_num: Number(value) || 0,
          is_active: active,
        })
          .then(onSaved)
          .then(() => {
            setLabelFa('')
            setLabelEn('')
            setValue('0')
          })
          .catch((err: unknown) => toast.error(err instanceof Error ? err.message : t('common.error')))
          .finally(() => setBusy(false))
      }}
    >
      <Input label="FA" value={labelFa} onChange={(e) => setLabelFa(e.target.value)} required />
      <Input label="EN" value={labelEn} onChange={(e) => setLabelEn(e.target.value)} required />
      <Input label={t('home.statValue')} type="number" value={value} onChange={(e) => setValue(e.target.value)} />
      <label className="flex items-center gap-2 rounded-xl border border-sky-100 bg-sky-50 p-3 text-sm font-bold text-slate-700"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />نمایش در صفحه اصلی</label>
      <Button type="submit" disabled={busy}>
        {t('common.save')}
      </Button>
      {initial ? <Button type="button" variant="secondary" onClick={onCancel}>{t('common.cancel')}</Button> : null}
    </form>
  )
}

function WhyForm({
  initial,
  onCancel,
  busy,
  setBusy,
  onSaved,
}: {
  initial?: HomeWhyCard
  onCancel: () => void
  busy: boolean
  setBusy: (v: boolean) => void
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const [titleFa, setTitleFa] = useState(initial?.title_fa ?? '')
  const [titleEn, setTitleEn] = useState(initial?.title_en ?? '')
  const [bodyFa, setBodyFa] = useState(initial?.body_fa ?? '')
  const [bodyEn, setBodyEn] = useState(initial?.body_en ?? '')
  const [icon, setIcon] = useState(initial?.icon_key ?? 'star')
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        setBusy(true)
        void upsertWhyCard({
          id: initial?.id,
          title_fa: titleFa,
          title_en: titleEn,
          body_fa: bodyFa,
          body_en: bodyEn,
          icon_key: icon,
        })
          .then(onSaved)
          .then(() => {
            setTitleFa('')
            setTitleEn('')
            setBodyFa('')
            setBodyEn('')
          })
          .catch((err: unknown) => toast.error(err instanceof Error ? err.message : t('common.error')))
          .finally(() => setBusy(false))
      }}
    >
      <Input label="Title FA" value={titleFa} onChange={(e) => setTitleFa(e.target.value)} required />
      <Input label="Title EN" value={titleEn} onChange={(e) => setTitleEn(e.target.value)} required />
      <Textarea label="Body FA" value={bodyFa} onChange={(e) => setBodyFa(e.target.value)} />
      <Textarea label="Body EN" value={bodyEn} onChange={(e) => setBodyEn(e.target.value)} />
      <Select label="Icon" value={icon} onChange={(e) => setIcon(e.target.value)}>
        {['globe', 'judge', 'certificate', 'trophy', 'network', 'rocket', 'star'].map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
      </Select>
      <Button type="submit" disabled={busy}>
        {t('common.save')}
      </Button>
      {initial ? <Button type="button" variant="secondary" onClick={onCancel}>{t('common.cancel')}</Button> : null}
    </form>
  )
}

function EventForm({
  initial,
  onCancel,
  busy,
  setBusy,
  onSaved,
}: {
  initial?: HomeEvent
  onCancel: () => void
  busy: boolean
  setBusy: (v: boolean) => void
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const [groupTitleFa, setGroupTitleFa] = useState(initial?.group_title_fa ?? '')
  const [groupTitleEn, setGroupTitleEn] = useState(initial?.group_title_en ?? '')
  const [titleFa, setTitleFa] = useState(initial?.title_fa ?? '')
  const [titleEn, setTitleEn] = useState(initial?.title_en ?? '')
  const [date, setDate] = useState(initial?.event_date ?? '')
  const [endDate, setEndDate] = useState(initial?.end_date ?? '')
  const [locFa, setLocFa] = useState(initial?.location_fa ?? '')
  const [locEn, setLocEn] = useState(initial?.location_en ?? '')
  const [descFa, setDescFa] = useState(initial?.description_fa ?? '')
  const [descEn, setDescEn] = useState(initial?.description_en ?? '')
  const [icon, setIcon] = useState<HomeEvent['icon_key']>(initial?.icon_key ?? 'calendar')
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        setBusy(true)
        void upsertEvent({
          id: initial?.id,
          group_title_fa: groupTitleFa || null,
          group_title_en: groupTitleEn || null,
          title_fa: titleFa,
          title_en: titleEn || titleFa,
          event_date: date,
          end_date: endDate || null,
          location_fa: locFa || null,
          location_en: locEn || null,
          description_fa: descFa || null,
          description_en: descEn || descFa || null,
          icon_key: icon,
        })
          .then(onSaved)
          .then(() => {
            setTitleFa('')
            setTitleEn('')
            setDate('')
            setEndDate('')
            setLocFa('')
            setDescFa('')
          })
          .catch((err: unknown) => toast.error(err instanceof Error ? err.message : t('common.error')))
          .finally(() => setBusy(false))
      }}
    >
      <Input label="عنوان رویداد مادر" value={groupTitleFa} onChange={(e) => setGroupTitleFa(e.target.value)} placeholder="مسابقات فصل پاییز جام تبرستان" />
      <Input label="Event group title (EN)" value={groupTitleEn} onChange={(e) => setGroupTitleEn(e.target.value)} dir="ltr" />
      <Input label="Title FA" value={titleFa} onChange={(e) => setTitleFa(e.target.value)} required />
      <Input label="Title EN" value={titleEn} onChange={(e) => setTitleEn(e.target.value)} />
      <DateTimeField label={t('home.eventDate')} withTime={false} value={date ? `${date}T12:00:00.000Z` : null} onChange={(iso) => setDate(iso?.slice(0, 10) ?? '')} />
      <DateTimeField label="تاریخ پایان" withTime={false} value={endDate ? `${endDate}T12:00:00.000Z` : null} onChange={(iso) => setEndDate(iso?.slice(0, 10) ?? '')} />
      <Select label="آیکن مرحله" value={icon} onChange={(e) => setIcon(e.target.value as HomeEvent['icon_key'])}><option value="registration">ثبت‌نام</option><option value="payment">پرداخت</option><option value="team_review">تأیید تیم</option><option value="trophy">مسابقه</option><option value="calendar">تقویم</option></Select>
      <Input label={t('home.eventLocation')} value={locFa} onChange={(e) => setLocFa(e.target.value)} />
      <Input label="Location (EN)" value={locEn} onChange={(e) => setLocEn(e.target.value)} dir="ltr" />
      <Textarea label={t('content.body')} value={descFa} onChange={(e) => setDescFa(e.target.value)} />
      <Textarea label="Description (EN)" value={descEn} onChange={(e) => setDescEn(e.target.value)} dir="ltr" />
      <Button type="submit" disabled={busy || !date}>
        {t('common.save')}
      </Button>
      {initial ? <Button type="button" variant="secondary" onClick={onCancel}>{t('common.cancel')}</Button> : null}
    </form>
  )
}

function PartnerForm({
  initial,
  onCancel,
  busy,
  setBusy,
  onSaved,
}: {
  initial?: HomePartner
  onCancel: () => void
  busy: boolean
  setBusy: (v: boolean) => void
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const [nameFa, setNameFa] = useState(initial?.name_fa ?? '')
  const [nameEn, setNameEn] = useState(initial?.name_en ?? '')
  const [kind, setKind] = useState<'university' | 'scientific' | 'organization'>(initial?.kind ?? 'university')
  const [logo, setLogo] = useState(initial?.logo_url ?? '')
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        setBusy(true)
        void upsertPartner({
          id: initial?.id,
          name_fa: nameFa,
          name_en: nameEn || nameFa,
          kind,
          logo_url: logo || null,
        })
          .then(onSaved)
          .then(() => {
            setNameFa('')
            setNameEn('')
            setLogo('')
          })
          .catch((err: unknown) => toast.error(err instanceof Error ? err.message : t('common.error')))
          .finally(() => setBusy(false))
      }}
    >
      <Input label="Name FA" value={nameFa} onChange={(e) => setNameFa(e.target.value)} required />
      <Input label="Name EN" value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
      <Select
        label={t('home.partnerType')}
        value={kind}
        onChange={(e) => setKind(e.target.value as typeof kind)}
      >
        <option value="university">{t('home.partnerKind.university')}</option>
        <option value="scientific">{t('home.partnerKind.scientific')}</option>
        <option value="organization">{t('home.partnerKind.organization')}</option>
      </Select>
      <ImageUploadField label={t('home.logo')} value={logo || null} onChange={(url) => setLogo(url ?? '')} />
      <Button type="submit" disabled={busy}>
        {t('common.save')}
      </Button>
      {initial ? <Button type="button" variant="secondary" onClick={onCancel}>{t('common.cancel')}</Button> : null}
    </form>
  )
}

function FaqForm({
  initial,
  onCancel,
  busy,
  setBusy,
  onSaved,
}: {
  initial?: HomeFaq
  onCancel: () => void
  busy: boolean
  setBusy: (v: boolean) => void
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const [qFa, setQFa] = useState(initial?.question_fa ?? '')
  const [qEn, setQEn] = useState(initial?.question_en ?? '')
  const [aFa, setAFa] = useState(initial?.answer_fa ?? '')
  const [aEn, setAEn] = useState(initial?.answer_en ?? '')
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        setBusy(true)
        void upsertFaq({
          id: initial?.id,
          question_fa: qFa,
          question_en: qEn || qFa,
          answer_fa: aFa,
          answer_en: aEn || aFa,
        })
          .then(onSaved)
          .then(() => {
            setQFa('')
            setQEn('')
            setAFa('')
            setAEn('')
          })
          .catch((err: unknown) => toast.error(err instanceof Error ? err.message : t('common.error')))
          .finally(() => setBusy(false))
      }}
    >
      <Input label="Q FA" value={qFa} onChange={(e) => setQFa(e.target.value)} required />
      <Input label="Q EN" value={qEn} onChange={(e) => setQEn(e.target.value)} />
      <Textarea label="A FA" value={aFa} onChange={(e) => setAFa(e.target.value)} required />
      <Textarea label="A EN" value={aEn} onChange={(e) => setAEn(e.target.value)} />
      <Button type="submit" disabled={busy}>
        {t('common.save')}
      </Button>
      {initial ? <Button type="button" variant="secondary" onClick={onCancel}>{t('common.cancel')}</Button> : null}
    </form>
  )
}
