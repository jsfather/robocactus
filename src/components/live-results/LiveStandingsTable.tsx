import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import type { LiveLeagueBoard } from '@/features/live-results/api'
import { PodiumCup } from '@/components/live-results/PodiumCup'

export function LiveStandingsTable({
  board,
  compact = false,
}: {
  board: LiveLeagueBoard
  compact?: boolean
}) {
  const { t } = useTranslation()
  const limit = compact ? 4 : board.rows.length
  const rows = board.rows.slice(0, limit)
  const showCups = board.mode === 'final'
  const revealKey = `tabarestan-final-revealed:${board.league.id}:${board.rows.map((row) => `${row.id}:${row.rank}`).join('|')}`
  const [countdown, setCountdown] = useState(() => board.mode === 'final' && board.rows.length && !sessionStorage.getItem(revealKey) ? 10 : 0)
  useEffect(() => {
    if (countdown <= 0) { if (board.mode === 'final' && board.rows.length) sessionStorage.setItem(revealKey, '1'); return }
    const timer = window.setTimeout(() => setCountdown((value) => value - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [countdown, board.mode, board.rows.length, revealKey])

  return (
    <div className="overflow-x-auto rounded-xl border border-rc-line/80 bg-rc-navy/40">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rc-line/70 px-4 py-3">
        <div>
          <Link
            to={`/leagues/${board.league.slug}`}
            className="text-lg font-semibold text-rc-text hover:text-rc-blue"
          >
            {board.league.name}
          </Link>
          <p className="mt-0.5 font-mono text-[10px] tracking-[0.2em] text-rc-muted uppercase">
            {board.mode === 'live' ? t('liveResults.liveBadge') : t('liveResults.finalBadge')}
          </p>
        </div>
        {board.mode === 'live' ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/40 bg-red-500/10 px-2.5 py-1 font-mono text-[10px] tracking-wider text-red-400">
            <span className="size-1.5 animate-pulse rounded-full bg-red-400" />
            LIVE
          </span>
        ) : (
          <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 font-mono text-[10px] tracking-wider text-amber-400">
            FINAL
          </span>
        )}
        <Link to={`/live/${board.league.slug}`} className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-black text-sky-800">نتایج این لیگ</Link>
      </div>

      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-rc-muted">{t('liveResults.emptyBoard')}</p>
      ) : (
        <div className="relative"><table className={`w-full text-sm transition duration-700 ${countdown > 0 ? 'select-none blur-lg' : ''}`}>
          <thead>
            <tr className="border-b border-rc-line/60 text-rc-muted">
              <th className="px-4 py-2 text-start font-mono text-[10px] tracking-wider uppercase">
                {t('liveResults.rank')}
              </th>
              <th className="px-4 py-2 text-start font-mono text-[10px] tracking-wider uppercase">
                {t('liveResults.team')}
              </th>
              {!compact ? (
                <th className="px-4 py-2 text-start font-mono text-[10px] tracking-wider uppercase">
                  {t('rankings.company')}
                </th>
              ) : null}
              <th className="px-4 py-2 text-end font-mono text-[10px] tracking-wider uppercase">
                {t('judging.score')}
              </th>
            </tr>
          </thead>
          <motion.tbody layout>
            <AnimatePresence initial={false}>{rows.map((row) => (
              <motion.tr layout key={row.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -14 }} transition={{ type: 'spring', stiffness: 260, damping: 26 }} className="border-b border-rc-line/40 last:border-0">
                <td className="px-4 py-2.5">
                  <span className="inline-flex items-center gap-2 font-mono">
                    {showCups ? <PodiumCup rank={row.rank} size={compact ? 22 : 26} /> : null}
                    <span className={row.rank && row.rank <= 3 && showCups ? 'text-rc-text' : 'text-rc-muted'}>
                      {row.rank ?? '—'}
                    </span>
                  </span>
                </td>
                <td className="px-4 py-2.5 font-medium">{row.team_name}</td>
                {!compact ? (
                  <td className="px-4 py-2.5 text-rc-muted">
                    {row.company_slug ? (
                      <Link to={`/companies/${row.company_slug}`} className="hover:text-rc-blue">
                        {row.company_name}
                      </Link>
                    ) : (
                      row.company_name
                    )}
                  </td>
                ) : null}
                <td className="px-4 py-2.5 text-end font-mono tabular-nums" dir="ltr">
                  {row.score ?? '—'}
                </td>
              </motion.tr>
            ))}</AnimatePresence>
          </motion.tbody>
        </table>{countdown > 0 ? <div className="absolute inset-0 grid place-items-center bg-slate-950/65 text-center text-white backdrop-blur-sm"><motion.div key={countdown} initial={{ scale: .65, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="rounded-[2rem] border border-white/20 bg-white/10 px-10 py-7"><p className="text-xs font-black tracking-[.2em] text-cyan-200">اعلام نتیجه نهایی</p><p className="mt-2 text-6xl font-black tabular-nums">{countdown}</p><div className="mt-4 flex justify-center gap-2"><PodiumCup rank={2} size={28} /><PodiumCup rank={1} size={36} /><PodiumCup rank={3} size={28} /></div></motion.div></div> : null}</div>
      )}
    </div>
  )
}
