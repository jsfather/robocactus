import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { LiveLeagueBoard } from '@/features/live-results/api'
import { HomeSection } from '@/components/home/HomeSection'

function CompetitionBoard({ board }: { board: LiveLeagueBoard }) {
  const { t } = useTranslation()
  const leaders = board.rows.slice(0, 3)
  const isLive = board.mode === 'live'
  return <article className="group border-t border-slate-300 py-5 first:border-t-0 lg:grid lg:grid-cols-[minmax(13rem,.8fr)_1.35fr_auto] lg:items-center lg:gap-8">
    <div className="min-w-0"><div className="flex items-center gap-2"><span className={`size-2 shrink-0 ${isLive ? 'animate-pulse bg-red-600' : 'bg-amber-500'}`} aria-hidden="true" /><span className={`text-[11px] font-black tracking-[.14em] ${isLive ? 'text-red-700' : 'text-amber-700'}`}>{isLive ? 'LIVE' : t('liveResults.finalBadge')}</span></div><Link to={`/leagues/${board.league.slug}`} className="mt-2 block text-lg font-black leading-7 text-slate-900 transition-colors hover:text-rc-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rc-blue">{board.league.name}</Link></div>
    <div className="mt-4 lg:mt-0">{leaders.length ? <ol className="grid gap-1.5">{leaders.map((row, index) => <li key={row.id} className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-2 text-sm"><span className="font-mono text-xs font-bold text-slate-500">{row.rank ?? index + 1}</span><span className="truncate font-semibold text-slate-800">{row.team_name}</span><span className="font-mono text-xs font-bold tabular-nums text-slate-700" dir="ltr">{row.score ?? '—'}</span></li>)}</ol> : <p className="text-sm text-slate-500">{t('liveResults.emptyBoard')}</p>}</div>
    <Link to={`/live/${board.league.slug}`} className="mt-5 inline-flex min-h-11 items-center gap-2 border-b-2 border-rc-blue px-1 text-sm font-black text-rc-blue transition-colors hover:border-slate-900 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rc-blue lg:mt-0">{t('liveResults.openPage')}<span aria-hidden="true">←</span></Link>
  </article>
}

export function LiveResultsTeaser({ boards }: { boards: LiveLeagueBoard[] }) {
  const { t } = useTranslation()
  const offset = boards.length ? Math.floor(Date.now() / 86_400_000) % boards.length : 0
  const featured = boards.length ? [...boards.slice(offset), ...boards.slice(0, offset)].slice(0, 3) : []
  return <HomeSection title={t('liveResults.homeTitle')} subtitle={t('liveResults.homeSubtitle')} className="!py-14 sm:!py-16" action={<Link to="/live" className="inline-flex min-h-11 items-center gap-2 text-sm font-black text-rc-blue underline decoration-slate-300 underline-offset-8 transition hover:decoration-rc-blue">{t('liveResults.openPage')}<span aria-hidden="true">←</span></Link>}>
    {featured.length ? <div className="border-y-2 border-slate-900">{featured.map((board) => <CompetitionBoard key={board.league.id} board={board} />)}</div> : <div className="border-y border-dashed border-slate-300 py-10 text-center"><p className="text-sm text-slate-600">{t('liveResults.empty')}</p><Link to="/rankings" className="mt-4 inline-block min-h-11 text-sm font-bold text-rc-blue underline underline-offset-4">{t('liveResults.viewArchive')}</Link></div>}
  </HomeSection>
}
