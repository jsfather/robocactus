import { useEffect, useState } from 'react'
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

function loadSection<T>(fetcher: () => Promise<T>, onOk: (value: T) => void, fallback: T) {
  void fetcher()
    .then(onOk)
    .catch(() => onOk(fallback))
}

export function HomePage() {
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
  const [liveBoards, setLiveBoards] = useState<LiveLeagueBoard[]>([])

  useEffect(() => {
    // Load each section independently so a slow/failing request
    // (e.g. live boards) does not block banners, stats, leagues, etc.
    loadSection(fetchActiveBanners, setBanners, [])
    loadSection(fetchActiveSponsors, setSponsors, [])
    loadSection(fetchActiveStatCards, setStats, [])
    loadSection(fetchActiveWhyCards, setWhy, [])
    loadSection(fetchActiveEvents, setEvents, [])
    loadSection(fetchActivePartners, setPartners, [])
    loadSection(fetchActiveFaqs, setFaqs, [])
    loadSection(fetchActiveLeagues, setLeagues, [])
    loadSection(fetchTopCompanies, setCompanies, [])
    loadSection(fetchLatestNews, setPosts, [])
    loadSection(fetchLiveResultsBoards, setLiveBoards, [])
  }, [])

  return (
    <div>
      <HeroBanner banners={banners} />
      <SponsorsSlider sponsors={sponsors} />
      <CompetitionStats cards={stats} />
      <LiveResultsTeaser boards={liveBoards} />
      <WhyRoboCactus cards={why} />
      <LeagueCards leagues={leagues} />
      <EventCalendar events={events} />
      <ScientificPartners partners={partners} />
      <TopCompanies companies={companies} />
      <HomeFaqSection faqs={faqs} />
      <LatestNews posts={posts} />
    </div>
  )
}
