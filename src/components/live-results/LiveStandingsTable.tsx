import { Link } from 'react-router-dom'
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
  const limit = compact ? 8 : board.rows.length
  const rows = board.rows.slice(0, limit)
  const showCups = board.mode === 'final'

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
      </div>

      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-rc-muted">{t('liveResults.emptyBoard')}</p>
      ) : (
        <table className="w-full text-sm">
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
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-rc-line/40 last:border-0">
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
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
