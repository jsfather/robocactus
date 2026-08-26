import { useEffect, useState, type FormEvent } from 'react'
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
import {
  deleteBanner,
  fetchAllBanners,
  fetchContactMessages,
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
import type { ContactMessage, HomeBanner } from '@/types/database'

type Tab =
  | 'banners'
  | 'sponsors'
  | 'stats'
  | 'why'
  | 'events'
  | 'partners'
  | 'faqs'
  | 'inbox'

export function SuperAdminHomeContentPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const toast = useToast()
  const [tab, setTab] = useState<Tab>('banners')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  const [banners, setBanners] = useState<HomeBanner[]>([])
  const [messages, setMessages] = useState<ContactMessage[]>([])
  const [sponsors, setSponsors] = useState<HomeSponsor[]>([])
  const [stats, setStats] = useState<HomeStatCard[]>([])
  const [why, setWhy] = useState<HomeWhyCard[]>([])
  const [events, setEvents] = useState<HomeEvent[]>([])
  const [partners, setPartners] = useState<HomePartner[]>([])
  const [faqs, setFaqs] = useState<HomeFaq[]>([])

  const reload = async () => {
    setLoading(true)
    setError(null)
    try {
      const [b, m, sp, st, w, ev, pa, f] = await Promise.all([
        fetchAllBanners(),
        fetchContactMessages(),
        fetchAllSponsors(),
        fetchAllStatCards(),
        fetchAllWhyCards(),
        fetchAllEvents(),
        fetchAllPartners(),
        fetchAllFaqs(),
      ])
      setBanners(b)
      setMessages(m as ContactMessage[])
      setSponsors(sp)
      setStats(st)
      setWhy(w)
      setEvents(ev)
      setPartners(pa)
      setFaqs(f)
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
    { id: 'inbox', label: t('home.inboxTab') },
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

      {tab === 'sponsors' ? (
        <SimpleCrud
          title={t('home.sponsorsTab')}
          items={sponsors.map((s) => ({
            id: s.id,
            label: s.name,
            onDelete: () => deleteSponsor(s.id).then(reload),
          }))}
        >
          <SponsorForm
            busy={busy}
            setBusy={setBusy}
            onSaved={() => {
              toast.success(t('common.saved'))
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
            label: `${s.label_fa} / ${s.value_num}`,
            onDelete: () => deleteStatCard(s.id).then(reload),
          }))}
        >
          <StatForm
            busy={busy}
            setBusy={setBusy}
            onSaved={() => {
              toast.success(t('common.saved'))
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
            onDelete: () => deleteWhyCard(s.id).then(reload),
          }))}
        >
          <WhyForm
            busy={busy}
            setBusy={setBusy}
            onSaved={() => {
              toast.success(t('common.saved'))
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
            onDelete: () => deleteEvent(s.id).then(reload),
          }))}
        >
          <EventForm
            busy={busy}
            setBusy={setBusy}
            onSaved={() => {
              toast.success(t('common.saved'))
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
            onDelete: () => deletePartner(s.id).then(reload),
          }))}
        >
          <PartnerForm
            busy={busy}
            setBusy={setBusy}
            onSaved={() => {
              toast.success(t('common.saved'))
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
            onDelete: () => deleteFaq(s.id).then(reload),
          }))}
        >
          <FaqForm
            busy={busy}
            setBusy={setBusy}
            onSaved={() => {
              toast.success(t('common.saved'))
              void reload()
            }}
          />
        </SimpleCrud>
      ) : null}

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
      ) : null}
    </PanelPage>
  )
}

function SimpleCrud({
  title,
  items,
  children,
}: {
  title: string
  items: Array<{ id: string; label: string; onDelete: () => Promise<unknown> }>
  children: React.ReactNode
}) {
  const { t } = useTranslation()
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
                <Button type="button" variant="danger" onClick={() => void item.onDelete()}>
                  {t('common.delete')}
                </Button>
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
  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [linkUrl, setLinkUrl] = useState('')

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      await upsertBanner({ title, subtitle, image_url: imageUrl, link_url: linkUrl })
      setTitle('')
      setSubtitle('')
      setImageUrl('')
      setLinkUrl('')
      await onReload()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <PanelCard title={t('home.newBanner')}>
        <form className="space-y-3" onSubmit={(e) => void save(e)}>
          <Input label={t('content.title')} value={title} onChange={(e) => setTitle(e.target.value)} required />
          <Input label={t('home.bannerSubtitle')} value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
          <ImageUploadField label={t('home.bannerImageUrl')} value={imageUrl || null} onChange={(url) => setImageUrl(url ?? '')} />
          <Input label={t('home.bannerLink')} value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} dir="ltr" />
          <Button type="submit" disabled={busy || !imageUrl || !userId}>
            {t('common.save')}
          </Button>
        </form>
      </PanelCard>
      <PanelCard title={t('home.bannersList')}>
        <ul className="divide-y divide-rc-line">
          {banners.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-2 py-2 text-sm">
              <span>{b.title}</span>
              <Button type="button" variant="danger" onClick={() => void deleteBanner(b.id).then(onReload)}>
                {t('common.delete')}
              </Button>
            </li>
          ))}
        </ul>
      </PanelCard>
    </div>
  )
}

function SponsorForm({
  busy,
  setBusy,
  onSaved,
}: {
  busy: boolean
  setBusy: (v: boolean) => void
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [logo, setLogo] = useState('')
  const [link, setLink] = useState('')
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        setBusy(true)
        void upsertSponsor({ name, logo_url: logo, link_url: link || null })
          .then(onSaved)
          .then(() => {
            setName('')
            setLogo('')
            setLink('')
          })
          .finally(() => setBusy(false))
      }}
    >
      <Input label={t('home.sponsorsTitle')} value={name} onChange={(e) => setName(e.target.value)} required />
      <ImageUploadField label={t('home.logo')} value={logo || null} onChange={(url) => setLogo(url ?? '')} />
      <Input label={t('home.bannerLink')} value={link} onChange={(e) => setLink(e.target.value)} dir="ltr" />
      <Button type="submit" disabled={busy || !logo}>
        {t('common.save')}
      </Button>
    </form>
  )
}

function StatForm({
  busy,
  setBusy,
  onSaved,
}: {
  busy: boolean
  setBusy: (v: boolean) => void
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const [labelFa, setLabelFa] = useState('')
  const [labelEn, setLabelEn] = useState('')
  const [value, setValue] = useState('0')
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        setBusy(true)
        void upsertStatCard({
          label_fa: labelFa,
          label_en: labelEn,
          value_num: Number(value) || 0,
        })
          .then(onSaved)
          .then(() => {
            setLabelFa('')
            setLabelEn('')
            setValue('0')
          })
          .finally(() => setBusy(false))
      }}
    >
      <Input label="FA" value={labelFa} onChange={(e) => setLabelFa(e.target.value)} required />
      <Input label="EN" value={labelEn} onChange={(e) => setLabelEn(e.target.value)} required />
      <Input label={t('home.statValue')} type="number" value={value} onChange={(e) => setValue(e.target.value)} />
      <Button type="submit" disabled={busy}>
        {t('common.save')}
      </Button>
    </form>
  )
}

function WhyForm({
  busy,
  setBusy,
  onSaved,
}: {
  busy: boolean
  setBusy: (v: boolean) => void
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const [titleFa, setTitleFa] = useState('')
  const [titleEn, setTitleEn] = useState('')
  const [bodyFa, setBodyFa] = useState('')
  const [bodyEn, setBodyEn] = useState('')
  const [icon, setIcon] = useState('star')
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        setBusy(true)
        void upsertWhyCard({
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
    </form>
  )
}

function EventForm({
  busy,
  setBusy,
  onSaved,
}: {
  busy: boolean
  setBusy: (v: boolean) => void
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const [titleFa, setTitleFa] = useState('')
  const [titleEn, setTitleEn] = useState('')
  const [date, setDate] = useState('')
  const [locFa, setLocFa] = useState('')
  const [descFa, setDescFa] = useState('')
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        setBusy(true)
        void upsertEvent({
          title_fa: titleFa,
          title_en: titleEn || titleFa,
          event_date: date,
          location_fa: locFa || null,
          description_fa: descFa || null,
          description_en: descFa || null,
        })
          .then(onSaved)
          .then(() => {
            setTitleFa('')
            setTitleEn('')
            setDate('')
            setLocFa('')
            setDescFa('')
          })
          .finally(() => setBusy(false))
      }}
    >
      <Input label="Title FA" value={titleFa} onChange={(e) => setTitleFa(e.target.value)} required />
      <Input label="Title EN" value={titleEn} onChange={(e) => setTitleEn(e.target.value)} />
      <Input label={t('home.eventDate')} type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      <Input label={t('home.eventLocation')} value={locFa} onChange={(e) => setLocFa(e.target.value)} />
      <Textarea label={t('content.body')} value={descFa} onChange={(e) => setDescFa(e.target.value)} />
      <Button type="submit" disabled={busy}>
        {t('common.save')}
      </Button>
    </form>
  )
}

function PartnerForm({
  busy,
  setBusy,
  onSaved,
}: {
  busy: boolean
  setBusy: (v: boolean) => void
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const [nameFa, setNameFa] = useState('')
  const [nameEn, setNameEn] = useState('')
  const [kind, setKind] = useState<'university' | 'scientific' | 'organization'>('university')
  const [logo, setLogo] = useState('')
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        setBusy(true)
        void upsertPartner({
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
    </form>
  )
}

function FaqForm({
  busy,
  setBusy,
  onSaved,
}: {
  busy: boolean
  setBusy: (v: boolean) => void
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const [qFa, setQFa] = useState('')
  const [qEn, setQEn] = useState('')
  const [aFa, setAFa] = useState('')
  const [aEn, setAEn] = useState('')
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        setBusy(true)
        void upsertFaq({
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
    </form>
  )
}
