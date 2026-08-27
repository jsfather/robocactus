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
  const primary = rotated[0]
  const extras = rotated.slice(1, 4)

  return (
    <HomeSection
      index="LR"
      title={t('liveResults.homeTitle')}
      subtitle={t('liveResults.homeSubtitle')}
      action={
        <Link
          to="/live"
          className="inline-flex items-center gap-2 rounded-2xl bg-rc-blue px-5 py-3 text-sm font-bold text-white shadow-lg transition hover:-translate-y-1"
        >
          {t('liveResults.openPage')}
          {primary?.mode === 'live' ? (
            <span className="inline-flex items-center gap-1 font-mono text-[9px] text-red-400">
              <span className="size-1.5 animate-pulse rounded-full bg-red-400" />
              LIVE
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <PodiumCup rank={1} size={16} />
            </span>
          )}
        </Link>
      }
    >
      {primary ? (
        <div className="grid gap-6 rounded-[2rem] bg-gradient-to-br from-sky-50 to-emerald-50 p-5 sm:p-8 lg:grid-cols-[1.4fr_1fr]">
          <LiveStandingsTable board={primary} compact />
          <div className="space-y-3">
            {extras.length ? (
              extras.map((b) => (
                <Link
                  key={b.league.id}
                  to={`/live/${b.league.slug}`}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-white bg-white px-5 py-4 shadow-sm transition hover:-translate-y-1 hover:shadow-md"
                >
                  <div>
                    <p className="font-medium">{b.league.name}</p>
                    <p className="mt-0.5 font-mono text-[10px] text-rc-muted uppercase">
                      {b.mode === 'live' ? t('liveResults.liveBadge') : t('liveResults.finalBadge')}
                      {' · '}
                      {t('liveResults.entries', { count: b.rows.length })}
                    </p>
                  </div>
                  {b.mode === 'final' && b.rows[0] ? (
                    <PodiumCup rank={b.rows[0].rank} size={24} />
                  ) : (
                    <span className="size-2 animate-pulse rounded-full bg-red-400" />
                  )}
                </Link>
              ))
            ) : (
              <p className="rounded-xl border border-rc-line/60 px-4 py-6 text-sm text-rc-muted">
                {t('liveResults.homeHint')}
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-rc-line/80 bg-rc-navy/25 px-6 py-12 text-center">
          <div className="mb-3 flex justify-center gap-2">
            <PodiumCup rank={1} size={28} />
            <PodiumCup rank={2} size={28} />
            <PodiumCup rank={3} size={28} />
          </div>
          <p className="text-sm text-rc-muted">{t('liveResults.empty')}</p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/live"
              className="border border-rc-blue/40 bg-rc-blue/10 px-4 py-2 text-sm text-rc-blue hover:bg-rc-blue/20"
            >
              {t('liveResults.openPage')}
            </Link>
            <Link to="/rankings" className="text-sm text-rc-muted hover:text-rc-blue">
              {t('liveResults.viewArchive')}
            </Link>
          </div>
        </div>
      )}
    </HomeSection>
  )
}
