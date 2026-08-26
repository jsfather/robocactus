import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { fetchActiveLeagues } from '@/features/companies/api'
import { formatAmountToman } from '@/features/payments/api'
import { computeLeaguePeriod, periodBadgeClass } from '@/features/leagues/period'
import { leagueCoverUrl } from '@/lib/dates'
import type { League, LeaguePeriod } from '@/types/database'
import { contentLocale, localizeLeague } from '@/features/leagues/localize'

export function LeaguesPage() {
  const { t, i18n } = useTranslation()
  const [leagues, setLeagues] = useState<League[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('')
  const [period, setPeriod] = useState<'' | LeaguePeriod>('')
  const localizedLeagues = useMemo(() => leagues.map((league) => localizeLeague(league, contentLocale(i18n.language))), [leagues, i18n.language])

  useEffect(() => {
    void fetchActiveLeagues()
      .then(setLeagues)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const l of localizedLeagues) if (l.category) set.add(l.category)
    return [...set].sort()
  }, [localizedLeagues])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    return localizedLeagues.filter((l) => {
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
  }, [localizedLeagues, q, category, period])

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50/70 via-white to-emerald-50/30"><section className="relative overflow-hidden bg-gradient-to-l from-[#087eb8] to-[#0ca36a] px-4 pb-20 pt-32 text-white"><div className="absolute -end-24 -top-24 size-80 rounded-full border-[55px] border-white/10" /><div className="relative mx-auto max-w-7xl sm:px-4"><p className="text-sm font-bold text-emerald-100">{i18n.language === 'en' ? 'Tabarestan Cup competitions' : 'مسابقات جام تبرستان'}</p><h1 className="mt-3 text-4xl font-black sm:text-6xl">{i18n.language === 'en' ? 'Choose your league' : 'لیگ خودت را انتخاب کن'}</h1><p className="mt-5 max-w-2xl text-base leading-8 text-white/75">{i18n.language === 'en' ? 'Explore active leagues, find the right competition for your team, and prepare for national and international challenges.' : 'از میان لیگ‌های فعال، رشته متناسب با توانایی تیم خود را پیدا کنید و برای حضور در رقابت‌های ملی و بین‌المللی آماده شوید.'}</p></div></section><div className="relative mx-auto -mt-10 max-w-7xl px-4 pb-24 sm:px-8">

      <div className="mb-10 grid gap-4 rounded-[2rem] border border-sky-100 bg-white p-5 shadow-[0_22px_65px_rgb(18_76_98/0.12)] md:grid-cols-3 sm:p-7">
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
        <ul className="grid gap-7 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((league) => {
            const per = computeLeaguePeriod(league)
            const cover = leagueCoverUrl(league)
            return (
              <li key={league.id}>
                <Link
                  to={`/leagues/${league.slug}`}
                  className="group relative block h-full overflow-hidden rounded-[2rem] border border-sky-100 bg-white shadow-[0_18px_55px_rgb(18_76_98/0.08)] transition duration-300 hover:-translate-y-2 hover:border-emerald-200 hover:shadow-[0_28px_75px_rgb(18_76_98/0.15)]"
                >
                  <div className="relative aspect-[16/10] overflow-hidden bg-gradient-to-br from-sky-100 to-emerald-100">
                    {cover ? (
                      <img
                        src={cover}
                        alt=""
                        className="h-full w-full object-cover transition duration-700 group-hover:scale-110"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-3xl font-black text-rc-blue/30">
                        RT
                      </div>
                    )}
                    <span
                      className={`absolute start-4 top-4 inline-flex rounded-full border px-3 py-1.5 text-xs font-bold shadow-sm backdrop-blur ${periodBadgeClass(per)}`}
                    >
                      {t(`leaguePage.period.${per}`)}
                    </span>
                  </div>
                  <div className="p-6">
                    <div className="flex items-center justify-between gap-3"><p className="text-xs font-bold text-rc-blue">{league.category || (i18n.language === 'en' ? 'Competition league' : 'لیگ مسابقاتی')}</p><span className="text-xs text-slate-400">{league.slug}</span></div>
                    <h2 className="mt-3 text-xl font-black text-slate-800">{league.name}</h2>
                    {league.short_description || league.description ? (
                      <p className="mt-2 line-clamp-3 text-sm text-rc-muted">
                        {league.short_description || league.description}
                      </p>
                    ) : null}
                    <div className="mt-5 flex items-center justify-between border-t border-sky-100 pt-4"><p className="font-black text-emerald-600">{formatAmountToman(Number(league.registration_fee))} <span className="text-xs">{t('payment.currency')}</span></p><span className="flex size-10 items-center justify-center rounded-xl bg-sky-50 text-rc-blue transition group-hover:bg-rc-blue group-hover:text-white">←</span></div>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div></div>
  )
}
