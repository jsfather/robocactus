import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { leagueAccent } from '@/features/home/api'
import { formatAmountToman } from '@/features/payments/api'
import { computeLeaguePeriod, periodBadgeClass } from '@/features/leagues/period'
import { leagueCoverUrl } from '@/lib/dates'
import type { League } from '@/types/database'
import { contentLocale, localizeLeague } from '@/features/leagues/localize'

function LeagueIcon({ category }: { category: string | null }) {
  const key = (category ?? '').toLowerCase()
  if (key.includes('soccer') || key.includes('فوتبال')) {
    return (
      <svg viewBox="0 0 48 48" className="size-10" fill="none" aria-hidden>
        <circle cx="24" cy="24" r="16" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M24 8v32M8 24h32M14 14l20 20M34 14 14 34"
          stroke="currentColor"
          strokeWidth="1.2"
          opacity="0.7"
        />
      </svg>
    )
  }
  if (key.includes('human') || key.includes('انسان')) {
    return (
      <svg viewBox="0 0 48 48" className="size-10" fill="none" aria-hidden>
        <rect x="18" y="10" width="12" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M24 20v6M16 28h16M18 34l-4 8M30 34l4 8M14 26h-4M34 26h4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 48 48" className="size-10" fill="none" aria-hidden>
      <path d="M24 8 36 16v12L24 36 12 28V16L24 8Z" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="24" cy="22" r="4" stroke="currentColor" strokeWidth="1.5" />
      <path d="M24 26v6" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

export function LeagueCards({ leagues }: { leagues: League[] }) {
  const { t, i18n } = useTranslation()

  if (!leagues.length) return null

  return (
    <section className="bg-gradient-to-b from-emerald-50/60 via-white to-sky-50/50 py-24"><div className="mx-auto max-w-7xl px-4 sm:px-8">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="mb-3 inline-flex rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-bold text-emerald-700">{i18n.language === 'en' ? 'Your competition field' : 'میدان انتخاب شما'}</span><h2 className="text-3xl font-black text-slate-800 md:text-5xl">{t('home.leaguesTitle')}</h2>
          <p className="mt-1 text-rc-muted">{t('home.leaguesSubtitle')}</p>
        </div>
        <Link to="/leagues" className="rounded-2xl bg-white px-5 py-3 text-sm font-bold text-rc-blue shadow-md">
          {t('home.viewAll')}
        </Link>
      </div>

      <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {leagues.map((rawLeague, i) => {
          const league = localizeLeague(rawLeague, contentLocale(i18n.language))
          const accent = leagueAccent(league.category)
          const period = computeLeaguePeriod(league)
          const cover = leagueCoverUrl(league)
          return (
            <motion.li
              key={league.id}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.4, delay: i * 0.06 }}
            >
              <Link
                to={`/leagues/${league.slug}`}
                className={[
                  'group relative block overflow-hidden rounded-[2rem] border bg-white shadow-[0_20px_55px_rgb(18_76_98/0.09)] transition hover:-translate-y-1 hover:shadow-[0_28px_70px_rgb(18_76_98/0.15)]',
                  accent.border,
                ].join(' ')}
              >
                <div className="relative aspect-[16/10] overflow-hidden bg-rc-navy">
                  {cover ? (
                    <img src={cover} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                  ) : (
                    <div
                      className={[
                        'flex h-full items-center justify-center bg-gradient-to-br',
                        accent.glow,
                      ].join(' ')}
                    >
                      <div className={accent.text}>
                        <LeagueIcon category={league.category} />
                      </div>
                    </div>
                  )}
                  <span
                    className={`absolute start-3 top-3 inline-flex rounded-md border px-2 py-0.5 text-xs backdrop-blur ${periodBadgeClass(period)}`}
                  >
                    {t(`leaguePage.period.${period}`)}
                  </span>
                </div>
                <div className="p-6">
                  <div className="flex items-center justify-between gap-3"><p className="text-xs font-bold text-rc-blue">{league.category || (i18n.language === 'en' ? 'Competition league' : 'لیگ مسابقاتی')}</p><span className="text-xs text-slate-400">{league.slug}</span></div>
                  <h3 className="mt-3 text-xl font-black text-slate-800">{league.name}</h3>
                  {league.short_description || league.description ? (
                    <p className="mt-2 line-clamp-2 text-sm text-rc-muted">
                      {league.short_description || league.description}
                    </p>
                  ) : null}
                  <div className="mt-5 flex items-center justify-between border-t border-sky-100 pt-4"><p className="font-black text-emerald-600">{formatAmountToman(Number(league.registration_fee))} <span className="text-xs">{t('payment.currency')}</span></p><span className="flex size-10 items-center justify-center rounded-xl bg-sky-50 text-rc-blue transition group-hover:bg-rc-blue group-hover:text-white">←</span></div>
                </div>
              </Link>
            </motion.li>
          )
        })}
      </ul>
    </div></section>
  )
}
