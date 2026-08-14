import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { leagueAccent } from '@/features/home/api'
import { formatAmountToman } from '@/features/payments/api'
import { computeLeaguePeriod, periodBadgeClass } from '@/features/leagues/period'
import { leagueCoverUrl } from '@/lib/dates'
import type { League } from '@/types/database'

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
  const { t } = useTranslation()

  if (!leagues.length) return null

  return (
    <section className="mx-auto max-w-6xl px-4 py-16">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold md:text-3xl">{t('home.leaguesTitle')}</h2>
          <p className="mt-1 text-rc-muted">{t('home.leaguesSubtitle')}</p>
        </div>
        <Link to="/leagues" className="text-sm text-rc-blue hover:underline">
          {t('home.viewAll')}
        </Link>
      </div>

      <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {leagues.map((league, i) => {
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
                  'relative block overflow-hidden rounded-2xl border bg-rc-surface transition hover:brightness-105',
                  accent.border,
                ].join(' ')}
              >
                <div className="relative aspect-[16/10] overflow-hidden bg-rc-navy">
                  {cover ? (
                    <img src={cover} alt="" className="h-full w-full object-cover" />
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
                <div className="p-5">
                  <p className="font-mono text-xs tracking-wide text-rc-muted uppercase">
                    {league.slug}
                  </p>
                  <h3 className="mt-1 text-xl font-semibold">{league.name}</h3>
                  {league.short_description || league.description ? (
                    <p className="mt-2 line-clamp-2 text-sm text-rc-muted">
                      {league.short_description || league.description}
                    </p>
                  ) : null}
                  <p className="mt-4 font-mono text-sm text-rc-accent">
                    {formatAmountToman(Number(league.registration_fee))} {t('payment.currency')}
                  </p>
                </div>
              </Link>
            </motion.li>
          )
        })}
      </ul>
    </section>
  )
}
