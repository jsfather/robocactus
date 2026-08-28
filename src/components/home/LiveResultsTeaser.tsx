import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { LiveLeagueBoard } from '@/features/live-results/api'

function ArrowIcon() { return <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12h14M13 6l6 6-6 6" /></svg> }
function TrophyIcon() { return <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M8 4h8v4a4 4 0 0 1-8 0V4Z" /><path d="M8 6H4v1a4 4 0 0 0 4 4M16 6h4v1a4 4 0 0 1-4 4M12 12v4M8 20h8" /></svg> }

function BoardCard({ board }: { board: LiveLeagueBoard }) {
  const { t, i18n } = useTranslation()
  const live = board.mode === 'live'
  const isEn = i18n.language.startsWith('en')
  const leaders = board.rows.slice(0, 3)
  return <article className="group overflow-hidden rounded-[1.35rem] border border-slate-200 bg-white shadow-[0_12px_35px_rgb(15_65_80/0.08)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_42px_rgb(15_65_80/0.13)]">
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-5"><div className="flex min-w-0 gap-3.5"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-sky-50 to-emerald-50 text-rc-blue ring-1 ring-sky-100"><TrophyIcon /></span><div className="min-w-0"><Link to={`/leagues/${board.league.slug}`} className="block truncate text-base font-black text-slate-900 transition hover:text-rc-blue sm:text-lg">{board.league.name}</Link><p className="mt-1 text-xs font-bold text-slate-400">{live ? t('liveResults.liveBadge') : t('liveResults.finalBadge')}</p></div></div><span className={`inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-[10px] font-black tracking-[.12em] ${live ? 'bg-rose-50 text-rose-700 ring-1 ring-rose-100' : 'bg-amber-50 text-amber-700 ring-1 ring-amber-100'}`}><i className={`size-1.5 rounded-full ${live ? 'animate-pulse bg-rose-500' : 'bg-amber-500'}`} />{live ? 'LIVE' : 'FINAL'}</span></div>
    <div className="px-5 py-3">{leaders.length ? <ol className="divide-y divide-slate-100">{leaders.map((row, index) => <li key={row.id} className="grid min-h-12 grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 text-sm"><span className={`grid size-7 place-items-center rounded-lg font-mono text-xs font-black ${index === 0 ? 'bg-gradient-to-br from-rc-blue to-rc-accent text-white' : 'bg-slate-100 text-slate-500'}`}>{row.rank ?? index + 1}</span><span className="truncate font-bold text-slate-700">{row.team_name}</span><span className="font-mono font-black tabular-nums text-slate-950" dir="ltr">{row.score ?? '—'}</span></li>)}</ol> : <div className="grid min-h-36 place-items-center text-center"><div><span className="mx-auto grid size-10 place-items-center rounded-full bg-slate-50 text-slate-400"><TrophyIcon /></span><p className="mt-3 text-sm text-slate-500">{t('liveResults.emptyBoard')}</p></div></div>}</div>
    <div className="border-t border-slate-100 bg-slate-50/70 px-5 py-3.5"><Link to={`/live/${board.league.slug}`} className="inline-flex min-h-9 items-center gap-2 text-sm font-black text-rc-blue transition hover:gap-3 hover:text-emerald-700">{isEn ? 'View league standings' : 'مشاهده جدول این لیگ'}<span className={isEn ? '' : 'rotate-180'}><ArrowIcon /></span></Link></div>
  </article>
}

export function LiveResultsTeaser({ boards }: { boards: LiveLeagueBoard[] }) {
  const { t, i18n } = useTranslation()
  const isEn = i18n.language.startsWith('en')
  const offset = boards.length ? Math.floor(Date.now() / 86_400_000) % boards.length : 0
  const featured = boards.length ? [...boards.slice(offset), ...boards.slice(0, offset)].slice(0, 3) : []
  const liveCount = featured.filter((board) => board.mode === 'live').length
  return <section className="relative overflow-hidden bg-slate-50 py-16 sm:py-20" aria-labelledby="live-heading"><div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-200 to-transparent" aria-hidden /><div className="mx-auto max-w-7xl px-4 sm:px-8">
    <div className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#087eb8] via-[#087f9c] to-[#0b9b65] p-1 shadow-[0_24px_60px_rgb(8_126_145/0.16)] sm:p-1.5">
      <header className="flex flex-col gap-5 px-5 py-7 text-white sm:flex-row sm:items-center sm:justify-between sm:px-8"><div className="flex items-start gap-4"><span className="grid size-12 shrink-0 place-items-center rounded-2xl border border-white/20 bg-white/15 text-white backdrop-blur"><TrophyIcon /></span><div><div className="flex items-center gap-2 text-[10px] font-black tracking-[.16em] text-white/75"><span className="size-2 animate-pulse rounded-full bg-rose-400" />LIVE CENTER</div><h2 id="live-heading" className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">{t('liveResults.homeTitle')}</h2><p className="mt-2 max-w-2xl text-sm leading-7 text-white/75">{t('liveResults.homeSubtitle')}</p></div></div><div className="flex shrink-0 items-center gap-3"><span className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-xs font-bold text-white/90">{isEn ? `${liveCount} live` : `${liveCount} نتیجه زنده`}</span><Link to="/live" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-4 text-sm font-black text-rc-blue shadow-sm transition hover:-translate-y-0.5">{t('liveResults.openPage')}<span className={isEn ? '' : 'rotate-180'}><ArrowIcon /></span></Link></div></header>
      <div className="rounded-[1.65rem] bg-white/97 p-4 sm:p-6">{featured.length ? <div className="grid gap-4 lg:grid-cols-3">{featured.map((board) => <BoardCard key={board.league.id} board={board} />)}</div> : <div className="grid min-h-52 place-items-center rounded-[1.25rem] border border-dashed border-slate-200 bg-slate-50 text-center"><div><span className="mx-auto grid size-12 place-items-center rounded-2xl bg-white text-rc-blue shadow-sm"><TrophyIcon /></span><p className="mt-4 text-sm font-bold text-slate-500">{t('liveResults.empty')}</p><Link to="/rankings" className="mt-3 inline-flex min-h-10 items-center text-sm font-black text-rc-blue hover:underline">{t('liveResults.viewArchive')}</Link></div></div>}</div>
    </div>
  </div></section>
}
