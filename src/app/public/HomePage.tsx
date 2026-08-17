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
import { Link } from 'react-router-dom'

function TabarestanStory() {
  return (
    <section className="relative -mt-10 z-10 mx-auto max-w-7xl px-4 sm:px-8">
      <div className="grid overflow-hidden rounded-[2rem] border border-sky-100 bg-white shadow-[0_28px_80px_rgb(15_92_120/0.12)] lg:grid-cols-[1.1fr_.9fr]">
        <div className="p-7 sm:p-10 lg:p-14">
          <span className="inline-flex rounded-full bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-700">ریشه در تبرستان، نگاه به جهان</span>
          <h2 className="mt-5 text-3xl font-black leading-tight text-slate-800 sm:text-4xl">میزبان رقابت‌های بزرگ رباتیک ایران و جهان</h2>
          <p className="mt-5 max-w-2xl text-base leading-8 text-slate-600">روبوکاپ تبرستان برگزارکننده مسابقات حرفه‌ای در سطح ملی و بین‌المللی است؛ رویدادی برای حضور تیم‌های برتر، داوری استاندارد، رقابت جدی و معرفی قهرمانان از آمل و مازندران به ایران و جهان.</p>
          <div className="mt-7 flex flex-wrap gap-3 text-sm font-semibold text-slate-700">
            <span className="rounded-full bg-sky-50 px-4 py-2">رقابت‌های کشوری</span><span className="rounded-full bg-emerald-50 px-4 py-2">مسابقات بین‌المللی</span><span className="rounded-full bg-teal-50 px-4 py-2">داوری حرفه‌ای</span>
          </div>
        </div>
        <div className="relative min-h-72 overflow-hidden bg-gradient-to-br from-sky-600 to-emerald-500 p-8 text-white sm:p-10">
          <div className="absolute -end-16 -top-16 size-60 rounded-full border-[36px] border-white/10" />
          <p className="relative text-sm font-bold text-emerald-100">هویت رویداد</p>
          <p className="relative mt-8 text-7xl font-black">۳۶۰°</p>
          <p className="relative mt-2 text-xl font-bold">از ثبت‌نام تیم‌ها تا سکوی قهرمانی</p>
          <p className="relative mt-5 max-w-md leading-7 text-white/80">مدیریت یکپارچه ثبت‌نام، رقابت، داوری رسمی، نتایج زنده و رتبه‌بندی مسابقات ملی و بین‌المللی.</p>
        </div>
      </div>
    </section>
  )
}

function HomeFinalCta() {
  return <section className="mx-auto max-w-7xl px-4 py-20 sm:px-8"><div className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-l from-[#087eb8] to-[#13a94d] px-6 py-14 text-center text-white shadow-[0_30px_80px_rgb(8_126_184/0.2)] sm:px-12"><div className="absolute -start-20 -top-24 size-72 rounded-full border-[44px] border-white/10" /><h2 className="relative text-3xl font-black sm:text-5xl">آماده‌ای رباتت را وارد میدان کنی؟</h2><p className="relative mx-auto mt-4 max-w-2xl leading-8 text-white/85">تیم خودت را بساز، لیگ مناسب را انتخاب کن و بخشی از آینده فناوری مازندران باش.</p><div className="relative mt-8 flex flex-wrap justify-center gap-3"><Link to="/signup" className="rounded-2xl bg-white px-6 py-3 font-bold text-emerald-700 shadow-lg">شروع ثبت‌نام</Link><Link to="/contact" className="rounded-2xl border border-white/40 bg-white/10 px-6 py-3 font-bold text-white">گفتگو با دبیرخانه</Link></div></div></section>
}

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
      <TabarestanStory />
      <CompetitionStats cards={stats} />
      <LeagueCards leagues={leagues} />
      <WhyRoboCactus cards={why} />
      <LiveResultsTeaser boards={liveBoards} />
      <EventCalendar events={events} />
      <TopCompanies companies={companies} />
      <ScientificPartners partners={partners} />
      <SponsorsSlider sponsors={sponsors} />
      <LatestNews posts={posts} />
      <HomeFaqSection faqs={faqs} />
      <HomeFinalCta />
    </div>
  )
}
