import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { LiveLeagueBoard } from '@/features/live-results/api'

function BoardRow({ board }: { board: LiveLeagueBoard }) {
  const { t } = useTranslation()
  const live = board.mode === 'live'
  const leaders = board.rows.slice(0, 3)
  return <article className="grid border-t border-white/15 first:border-t-0 lg:grid-cols-[minmax(15rem,.8fr)_1.25fr_auto] lg:items-center">
    <div className="p-5 sm:p-6"><div className="flex items-center gap-2"><span className={`size-2 ${live ? 'animate-pulse bg-red-500' : 'bg-amber-400'}`} aria-hidden="true" /><span className={`text-[10px] font-black tracking-[.16em] ${live ? 'text-red-300' : 'text-amber-300'}`}>{live ? 'LIVE' : t('liveResults.finalBadge')}</span></div><Link to={`/leagues/${board.league.slug}`} className="mt-2 block text-xl font-black leading-8 text-white transition-colors hover:text-sky-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300">{board.league.name}</Link><p className="mt-1 text-xs text-slate-400">{live ? t('liveResults.liveBadge') : t('liveResults.finalBadge')}</p></div>
    <div className="border-t border-white/10 px-5 py-4 lg:border-s lg:border-t-0 lg:px-6">{leaders.length ? <ol>{leaders.map((row, index) => <li key={row.id} className="grid min-h-10 grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-white/10 text-sm last:border-b-0"><span className={`font-mono font-black ${index === 0 ? 'text-sky-300' : 'text-slate-500'}`}>{row.rank ?? index + 1}</span><span className="truncate font-bold text-slate-200">{row.team_name}</span><span className="font-mono font-black tabular-nums text-white" dir="ltr">{row.score ?? '—'}</span></li>)}</ol> : <p className="py-4 text-sm text-slate-400">{t('liveResults.emptyBoard')}</p>}</div>
    <div className="p-5 lg:p-6"><Link to={`/live/${board.league.slug}`} className="inline-flex min-h-11 items-center border-b border-sky-300 text-sm font-black text-sky-300 transition-colors hover:border-white hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300">{t('liveResults.openPage')}<span className="ms-2" aria-hidden="true">←</span></Link></div>
  </article>
}

export function LiveResultsTeaser({ boards }: { boards: LiveLeagueBoard[] }) {
  const { t } = useTranslation()
  const offset = boards.length ? Math.floor(Date.now() / 86_400_000) % boards.length : 0
  const featured = boards.length ? [...boards.slice(offset), ...boards.slice(0, offset)].slice(0, 3) : []
  return <section className="bg-white py-16 sm:py-20" aria-labelledby="live-heading"><div className="mx-auto max-w-7xl px-4 sm:px-8">
    <header className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div><div className="flex items-center gap-2"><span className="size-2 animate-pulse bg-red-600" aria-hidden="true" /><p className="text-xs font-black tracking-[.14em] text-red-700">LIVE CENTER</p></div><h2 id="live-heading" className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">{t('liveResults.homeTitle')}</h2><p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">{t('liveResults.homeSubtitle')}</p></div><Link to="/live" className="inline-flex min-h-11 items-center self-start border-b-2 border-rc-blue text-sm font-black text-rc-blue hover:border-slate-950 hover:text-slate-950">{t('liveResults.openPage')}<span className="ms-2" aria-hidden="true">←</span></Link></header>
    {featured.length ? <div className="bg-slate-950 text-white"><div className="flex items-center justify-between border-b border-white/15 px-5 py-3"><span className="text-[10px] font-black tracking-[.16em] text-slate-400">TABARESTAN COMPETITION FEED</span><span className="font-mono text-[10px] text-emerald-300">● ONLINE</span></div>{featured.map((board) => <BoardRow key={board.league.id} board={board} />)}</div> : <div className="border-y border-slate-200 py-12 text-center"><p className="text-sm text-slate-500">{t('liveResults.empty')}</p><Link to="/rankings" className="mt-4 inline-flex min-h-11 items-center text-sm font-black text-rc-blue underline underline-offset-4">{t('liveResults.viewArchive')}</Link></div>}
  </div></section>
}
