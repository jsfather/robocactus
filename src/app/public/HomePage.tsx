import { useEffect, useState } from 'react'
import { backend } from '@/lib/backend'
import { HeroBanner } from '@/components/home/HeroBanner'
import { SponsorsSlider } from '@/components/home/SponsorsSlider'
import { CompetitionStats } from '@/components/home/CompetitionStats'
import { WhyRoboCactus } from '@/components/home/WhyRoboCactus'
import { EventCalendar } from '@/components/home/EventCalendar'
import { ScientificPartners } from '@/components/home/ScientificPartners'
import { HomeFaqSection } from '@/components/home/HomeFaqSection'
import { LeagueCards } from '@/components/home/LeagueCards'
import { TopCompanies } from '@/components/home/TopCompanies'
import { LatestNews } from '@/components/home/LatestNews'
import { AnnouncementsSlider } from '@/components/home/AnnouncementsSlider'
import { LiveResultsTeaser } from '@/components/home/LiveResultsTeaser'
import { fetchActiveLeagues } from '@/features/companies/api'
import {
  fetchActiveBanners,
  fetchLatestNews,
  fetchTopCompanies,
  type TopCompany,
} from '@/features/home/api'
import {
  fetchActiveEvents,
  fetchActiveFaqs,
  fetchActivePartners,
  fetchActiveSponsors,
  fetchActiveStatCards,
  fetchActiveWhyCards,
  type HomeEvent,
  type HomeFaq,
  type HomePartner,
  type HomeSponsor,
  type HomeStatCard,
  type HomeWhyCard,
} from '@/features/home/homeSectionsApi'
import {
  fetchLiveResultsBoards,
  type LiveLeagueBoard,
} from '@/features/live-results/api'
import type { BlogPost, HomeBanner, League } from '@/types/database'
import type { HomepageContent } from '@/types/database'
import type { Announcement } from '@/types/database'
import { fetchPublishedAnnouncements } from '@/features/content/api'
import { Link } from 'react-router-dom'
import { useSiteSettings } from '@/hooks/useSiteSettings'
import { useTranslation } from 'react-i18next'
import { HomeSectionIcon } from '@/components/home/HomeSection'

function TabarestanStory({ content }: { content?: HomepageContent['story'] }) {
  const { i18n } = useTranslation()
  const isEn = i18n.language.startsWith('en')
  if (!content) return null
  const text = isEn ? {
    eyebrow: content.eyebrow_en || content.eyebrow_fa,
    title: content.title_en || content.title_fa,
    body: content.body_en || content.body_fa,
    badges: content.badges_en?.length ? content.badges_en : content.badges_fa,
    metricLabel: content.metric_label_en || content.metric_label_fa,
    metricTitle: content.metric_title_en || content.metric_title_fa,
    metricBody: content.metric_body_en || content.metric_body_fa,
  } : {
    eyebrow: content.eyebrow_fa || content.eyebrow_en,
    title: content.title_fa || content.title_en,
    body: content.body_fa || content.body_en,
    badges: content.badges_fa?.length ? content.badges_fa : content.badges_en,
    metricLabel: content.metric_label_fa || content.metric_label_en,
    metricTitle: content.metric_title_fa || content.metric_title_en,
    metricBody: content.metric_body_fa || content.metric_body_en,
  }
  return (
    <section className="relative -mt-10 z-10 mx-auto max-w-7xl px-4 sm:px-8">
      <div className="grid overflow-hidden rounded-[2rem] border border-sky-100 bg-white shadow-[0_28px_80px_rgb(15_92_120/0.12)] lg:grid-cols-[1.1fr_.9fr]">
        <div className="p-7 sm:p-10 lg:p-14">
          {text.eyebrow ? <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-700"><svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><HomeSectionIcon icon="why" /></svg>{text.eyebrow}</span> : null}
          {text.title ? <h2 className="mt-5 text-3xl font-black leading-tight text-slate-800 sm:text-4xl">{text.title}</h2> : null}
          {text.body ? <p className="mt-5 max-w-2xl text-base leading-8 text-slate-600">{text.body}</p> : null}
          <div className="mt-7 flex flex-wrap gap-3 text-sm font-semibold text-slate-700">
            {text.badges?.map((badge, index) => <span key={`${badge}-${index}`} className={`rounded-full px-4 py-2 ${index % 3 === 0 ? 'bg-sky-50' : index % 3 === 1 ? 'bg-emerald-50' : 'bg-teal-50'}`}>{badge}</span>)}
          </div>
        </div>
        <div className="relative min-h-72 overflow-hidden bg-gradient-to-br from-sky-600 to-emerald-500 p-8 text-white sm:p-10">
          <div className="absolute -end-16 -top-16 size-60 rounded-full border-[36px] border-white/10" />
          {text.metricLabel ? <p className="relative text-sm font-bold text-emerald-100">{text.metricLabel}</p> : null}
          {content.metric_value ? <p className="relative mt-8 text-7xl font-black">{content.metric_value}</p> : null}
          {text.metricTitle ? <p className="relative mt-2 text-xl font-bold">{text.metricTitle}</p> : null}
          {text.metricBody ? <p className="relative mt-5 max-w-md leading-7 text-white/80">{text.metricBody}</p> : null}
        </div>
      </div>
    </section>
  )
}

function HomeFinalCta({ content }: { content?: HomepageContent['cta'] }) {
  const { i18n } = useTranslation()
  if (!content) return null
  const isEn = i18n.language.startsWith('en')
  const title = isEn ? content.title_en || content.title_fa : content.title_fa || content.title_en
  const body = isEn ? content.body_en || content.body_fa : content.body_fa || content.body_en
  const primary = isEn ? content.primary_label_en || content.primary_label_fa : content.primary_label_fa || content.primary_label_en
  const secondary = isEn ? content.secondary_label_en || content.secondary_label_fa : content.secondary_label_fa || content.secondary_label_en
  return <section className="mx-auto max-w-7xl px-4 py-20 sm:px-8"><div className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-l from-[#087eb8] to-[#13a94d] px-6 py-14 text-center text-white shadow-[0_30px_80px_rgb(8_126_184/0.2)] sm:px-12"><div className="absolute -start-20 -top-24 size-72 rounded-full border-[44px] border-white/10" /><h2 className="relative text-3xl font-black sm:text-5xl">{title}</h2><p className="relative mx-auto mt-4 max-w-2xl leading-8 text-white/85">{body}</p><div className="relative mt-8 flex flex-wrap justify-center gap-3"><Link to="/signup" className="rounded-2xl bg-white px-6 py-3 font-bold text-emerald-700 shadow-lg">{primary}</Link><Link to="/contact" className="rounded-2xl border border-white/40 bg-white/10 px-6 py-3 font-bold text-white">{secondary}</Link></div></div></section>
}

function loadSection<T>(fetcher: () => Promise<T>, onOk: (value: T) => void, fallback: T) {
  return fetcher()
    .then(onOk)
    .catch(() => onOk(fallback))
}

export function HomePage() {
  const { settings, loading: settingsLoading } = useSiteSettings()
  const [banners, setBanners] = useState<HomeBanner[]>([])
  const [sponsors, setSponsors] = useState<HomeSponsor[]>([])
  const [stats, setStats] = useState<HomeStatCard[]>([])
  const [why, setWhy] = useState<HomeWhyCard[]>([])
  const [events, setEvents] = useState<HomeEvent[]>([])
  const [partners, setPartners] = useState<HomePartner[]>([])
  const [faqs, setFaqs] = useState<HomeFaq[]>([])
  const [leagues, setLeagues] = useState<League[]>([])
  const [companies, setCompanies] = useState<TopCompany[]>([])
  const [posts, setPosts] = useState<BlogPost[]>([])
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [liveBoards, setLiveBoards] = useState<LiveLeagueBoard[]>([])
  const [liveResultsEnabled, setLiveResultsEnabled] = useState(false)
  const [bannersLoading, setBannersLoading] = useState(true)

  useEffect(() => {
    // Load each section independently so a slow/failing request
    // (e.g. live boards) does not block banners, stats, leagues, etc.
    void loadSection(fetchActiveBanners, setBanners, []).finally(() => setBannersLoading(false))
    loadSection(fetchActiveSponsors, setSponsors, [])
    loadSection(fetchActiveStatCards, setStats, [])
    loadSection(fetchActiveWhyCards, setWhy, [])
    loadSection(fetchActiveEvents, setEvents, [])
    loadSection(fetchActivePartners, setPartners, [])
    loadSection(fetchActiveFaqs, setFaqs, [])
    loadSection(fetchActiveLeagues, setLeagues, [])
    loadSection(fetchTopCompanies, setCompanies, [])
    loadSection(fetchLatestNews, setPosts, [])
    loadSection(fetchPublishedAnnouncements, setAnnouncements, [])
    void backend.auth.getOptions().then(({ data }) => {
      const enabled = data?.live_results_enabled === true
      setLiveResultsEnabled(enabled)
      if (enabled) loadSection(fetchLiveResultsBoards, setLiveBoards, [])
    }).catch(() => setLiveResultsEnabled(false))
  }, [])

  useEffect(() => {
    const channel = backend.channel('homepage-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'home_banners' }, () => loadSection(fetchActiveBanners, setBanners, []))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'home_sponsors' }, () => loadSection(fetchActiveSponsors, setSponsors, []))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'home_stat_cards' }, () => loadSection(fetchActiveStatCards, setStats, []))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'home_why_cards' }, () => loadSection(fetchActiveWhyCards, setWhy, []))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'home_events' }, () => loadSection(fetchActiveEvents, setEvents, []))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'home_partners' }, () => loadSection(fetchActivePartners, setPartners, []))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'home_faqs' }, () => loadSection(fetchActiveFaqs, setFaqs, []))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leagues' }, () => { loadSection(fetchActiveLeagues, setLeagues, []); loadSection(fetchLiveResultsBoards, setLiveBoards, []) })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'results' }, () => loadSection(fetchLiveResultsBoards, setLiveBoards, []))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'companies' }, () => loadSection(fetchTopCompanies, setCompanies, []))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'blog_posts' }, () => loadSection(fetchLatestNews, setPosts, []))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, () => loadSection(fetchPublishedAnnouncements, setAnnouncements, []))
      .subscribe()
    return () => { void backend.removeChannel(channel) }
  }, [])

  return (
    <div>
      <HeroBanner banners={banners} loading={bannersLoading || settingsLoading} content={settings?.homepage_content?.hero} />
      <TabarestanStory content={settings?.homepage_content?.story} />
      <CompetitionStats cards={stats} />
      <LeagueCards leagues={leagues} />
      <WhyRoboCactus cards={why} />
      {liveResultsEnabled ? <LiveResultsTeaser boards={liveBoards} /> : null}
      <EventCalendar events={events} />
      <TopCompanies companies={companies} />
      <ScientificPartners partners={partners} />
      <SponsorsSlider sponsors={sponsors} />
      <AnnouncementsSlider announcements={announcements} />
      <LatestNews posts={posts} />
      <HomeFaqSection faqs={faqs} />
      <HomeFinalCta content={settings?.homepage_content?.cta} />
    </div>
  )
}
