import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { backend } from '@/lib/backend'
import {
  fetchLiveResultsBoards,
  type LiveLeagueBoard,
} from '@/features/live-results/api'
import { LiveStandingsTable } from '@/components/live-results/LiveStandingsTable'

export function LiveResultsPage() {
  const { t } = useTranslation()
  const [boards, setBoards] = useState<LiveLeagueBoard[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [liveHint, setLiveHint] = useState(false)
  const { leagueSlug } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedSlug = leagueSlug ?? searchParams.get('league') ?? ''

  const reload = async () => {
    try {
      setBoards(await fetchLiveResultsBoards())
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
  }, [])

  useEffect(() => {
    const channel = backend
      .channel('live-results-public')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'results' },
        () => {
          setLiveHint(true)
          void reload()
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'leagues' },
        () => {
          void reload()
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setLiveHint(true)
      })

    const poll = window.setInterval(() => void reload(), 20000)
    return () => {
      window.clearInterval(poll)
      void backend.removeChannel(channel)
    }
  }, [])

  const liveCount = boards.filter((b) => b.mode === 'live').length
  const finalCount = boards.filter((b) => b.mode === 'final').length
  const visibleBoards = selectedSlug ? boards.filter((board) => board.league.slug === selectedSlug) : boards

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] tracking-[0.28em] text-rc-blue uppercase">
            LIVE · STANDINGS
          </p>
          <h1 className="mt-1 text-3xl font-semibold md:text-4xl">{t('liveResults.title')}</h1>
          <p className="mt-2 max-w-2xl text-sm text-rc-muted">{t('liveResults.subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-rc-muted">
          <span className="rounded-lg border border-rc-line px-2.5 py-1.5">
            {t('liveResults.liveCount', { count: liveCount })}
          </span>
          <span className="rounded-lg border border-rc-line px-2.5 py-1.5">
            {t('liveResults.finalCount', { count: finalCount })}
          </span>
          {liveHint ? (
            <span className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-emerald-400">
              {t('liveResults.realtimeOn')}
            </span>
          ) : null}
        </div>
      </div>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      <label className="block max-w-md space-y-2"><span className="text-sm font-bold text-slate-600">فیلتر لیگ</span><select className="min-h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm" value={selectedSlug} onChange={(e) => { const next = new URLSearchParams(searchParams); if (e.target.value) next.set('league', e.target.value); else next.delete('league'); setSearchParams(next) }}><option value="">همه لیگ‌ها</option>{boards.map((board) => <option key={board.league.id} value={board.league.slug}>{board.league.name}</option>)}</select><p className="text-xs text-slate-400">انتخاب شما در نشانی صفحه ذخیره می‌شود و قابل اشتراک‌گذاری است.</p></label>
      {loading ? <p className="text-rc-muted">{t('app.loading')}</p> : null}

      {!loading && boards.length === 0 ? (
        <div className="rounded-xl border border-dashed border-rc-line px-6 py-16 text-center">
          <p className="text-rc-muted">{t('liveResults.empty')}</p>
          <Link to="/rankings" className="mt-4 inline-block text-sm text-rc-blue hover:underline">
            {t('liveResults.viewArchive')}
          </Link>
        </div>
      ) : null}

      <div className="space-y-6">
        {visibleBoards.map((board) => (
          <LiveStandingsTable key={board.league.id} board={board} />
        ))}
      </div>

      <p className="text-center text-sm text-rc-muted">
        <Link to="/rankings" className="text-rc-blue hover:underline">
          {t('liveResults.viewArchive')}
        </Link>
      </p>
    </div>
  )
}
