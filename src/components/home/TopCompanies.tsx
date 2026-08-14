import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import type { TopCompany } from '@/features/home/api'

export function TopCompanies({ companies }: { companies: TopCompany[] }) {
  const { t } = useTranslation()

  if (!companies.length) return null

  return (
    <section className="border-y border-white/10 bg-rc-navy/30">
      <div className="mx-auto max-w-6xl px-4 py-16">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold md:text-3xl">{t('home.topCompaniesTitle')}</h2>
            <p className="mt-1 text-rc-muted">{t('home.topCompaniesSubtitle')}</p>
          </div>
          <Link to="/companies" className="text-sm text-rc-blue hover:underline">
            {t('home.viewAll')}
          </Link>
        </div>

        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {companies.map((company, i) => (
            <motion.li
              key={company.id}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.35, delay: i * 0.05 }}
            >
              <Link
                to={`/companies/${company.slug}`}
                className="flex items-center gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-4 transition hover:border-rc-blue/40"
              >
                {company.logo_url ? (
                  <img
                    src={company.logo_url}
                    alt=""
                    className="size-14 rounded-lg object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex size-14 items-center justify-center rounded-lg border border-rc-blue/30 bg-rc-blue/10 font-mono text-rc-blue">
                    RC
                  </div>
                )}
                <div className="min-w-0">
                  <h3 className="truncate font-semibold">{company.name}</h3>
                  <p className="mt-1 font-mono text-xs text-rc-accent">
                    {t('home.podiumCount', { count: company.podium_count })}
                  </p>
                </div>
              </Link>
            </motion.li>
          ))}
        </ul>
      </div>
    </section>
  )
}
