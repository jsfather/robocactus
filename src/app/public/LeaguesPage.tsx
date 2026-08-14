import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { fetchActiveLeagues } from '@/features/companies/api'
import { formatAmountToman } from '@/features/payments/api'
import { computeLeaguePeriod, periodBadgeClass } from '@/features/leagues/period'
import { leagueCoverUrl } from '@/lib/dates'
import type { League, LeaguePeriod } from '@/types/database'

export function LeaguesPage() {
  const { t } = useTranslation()
  const [leagues, setLeagues] = useState<League[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('')
  const [period, setPeriod] = useState<'' | LeaguePeriod>('')

  useEffect(() => {
    void fetchActiveLeagues()
      .then(setLeagues)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const l of leagues) if (l.category) set.add(l.category)
    return [...set].sort()
  }, [leagues])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    return leagues.filter((l) => {
      if (category && l.category !== category) return false
      const p = computeLeaguePeriod(l)
      if (period && p !== period) return false
      if (!term) return true
      return (
        l.name.toLowerCase().includes(term) ||
        l.slug.toLowerCase().includes(term) ||
        (l.short_description ?? '').toLowerCase().includes(term) ||
        (l.description ?? '').toLowerCase().includes(term)
      )
    })
  }, [leagues, q, category, period])

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <p className="font-mono text-[10px] tracking-[0.28em] text-rc-blue uppercase">MISSION LIST</p>
      <h1 className="mt-1 mb-2 text-3xl font-semibold">{t('nav.leagues')}</h1>
      <p className="mb-6 text-rc-muted">{t('admin.leagues.subtitle')}</p>

      <div className="mb-8 grid gap-3 border border-rc-line bg-rc-surface/50 p-4 md:grid-cols-3">
        <label className="block space-y-1.5 md:col-span-1">
          <span className="text-xs text-rc-muted">{t('search.title')}</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('search.leaguesPlaceholder')}
            className="w-full border border-rc-line bg-rc-bg px-3 py-2 text-sm outline-none focus:border-rc-blue/50"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs text-rc-muted">{t('admin.leagues.category')}</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full border border-rc-line bg-rc-bg px-3 py-2 text-sm outline-none"
          >
            <option value="">{t('search.allCategories')}</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs text-rc-muted">{t('admin.leagueDetail.period')}</span>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as '' | LeaguePeriod)}
            className="w-full border border-rc-line bg-rc-bg px-3 py-2 text-sm outline-none"
          >
            <option value="">{t('search.allPeriods')}</option>
            {(['upcoming', 'open', 'ongoing', 'ended', 'full'] as LeaguePeriod[]).map((p) => (
              <option key={p} value={p}>
                {t(`leaguePage.period.${p}`)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading ? <p className="text-rc-muted">{t('app.loading')}</p> : null}
      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      {!loading && filtered.length === 0 ? (
        <p className="text-rc-muted">{t('search.empty')}</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((league) => {
            const per = computeLeaguePeriod(league)
            const cover = leagueCoverUrl(league)
            return (
              <li key={league.id}>
                <Link
                  to={`/leagues/${league.slug}`}
                  className="group relative block h-full overflow-hidden border border-rc-line bg-rc-surface transition hover:border-rc-blue/50"
                >
                  <div className="relative aspect-[16/10] bg-rc-navy">
                    {cover ? (
                      <img
                        src={cover}
                        alt=""
                        className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center font-mono text-rc-blue/40">
                        RC
                      </div>
                    )}
                    <span
                      className={`absolute start-3 top-3 inline-flex border px-2 py-0.5 text-xs backdrop-blur ${periodBadgeClass(per)}`}
                    >
                      {t(`leaguePage.period.${per}`)}
                    </span>
                  </div>
                  <div className="p-5">
                    <p className="font-mono text-xs text-rc-blue">{league.slug}</p>
                    <h2 className="mt-1 text-xl font-semibold">{league.name}</h2>
                    {league.short_description || league.description ? (
                      <p className="mt-2 line-clamp-3 text-sm text-rc-muted">
                        {league.short_description || league.description}
                      </p>
                    ) : null}
                    <p className="mt-4 font-mono text-rc-accent">
                      {formatAmountToman(Number(league.registration_fee))} {t('payment.currency')}
                    </p>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
