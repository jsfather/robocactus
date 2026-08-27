import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { LiveLeagueBoard } from '@/features/live-results/api'
import { HomeSection } from '@/components/home/HomeSection'
import { LiveStandingsTable } from '@/components/live-results/LiveStandingsTable'
import { PodiumCup } from '@/components/live-results/PodiumCup'

export function LiveResultsTeaser({ boards }: { boards: LiveLeagueBoard[] }) {
  const { t } = useTranslation()
  const offset = boards.length ? Math.floor(Date.now() / 86_400_000) % boards.length : 0
  const rotated = boards.length ? [...boards.slice(offset), ...boards.slice(0, offset)] : []
  const featured = rotated.slice(0, 3)
  return <HomeSection index="LR" title={t('liveResults.homeTitle')} subtitle={t('liveResults.homeSubtitle')} action={<Link to="/live" className="inline-flex items-center gap-2 rounded-2xl bg-rc-blue px-5 py-3 text-sm font-bold text-white shadow-lg transition hover:-translate-y-1">{t('liveResults.openPage')}{featured[0]?.mode === 'live' ? <span className="inline-flex items-center gap-1 font-mono text-[9px]"><span className="size-1.5 animate-pulse rounded-full bg-red-300" />LIVE</span> : <PodiumCup rank={1} size={16} />}</Link>}>
    {featured.length ? <div className="grid gap-5 rounded-[2rem] bg-gradient-to-br from-sky-50 to-emerald-50 p-5 sm:p-8 xl:grid-cols-3">{featured.map((board) => <LiveStandingsTable key={board.league.id} board={board} compact />)}</div> : <div className="rounded-xl border border-dashed border-rc-line/80 px-6 py-12 text-center"><div className="mb-3 flex justify-center gap-2"><PodiumCup rank={1} size={28} /><PodiumCup rank={2} size={28} /><PodiumCup rank={3} size={28} /></div><p className="text-sm text-rc-muted">{t('liveResults.empty')}</p><Link to="/rankings" className="mt-4 inline-block text-sm text-rc-blue">{t('liveResults.viewArchive')}</Link></div>}
  </HomeSection>
}
