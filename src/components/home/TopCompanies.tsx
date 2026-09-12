import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import type { TopCompany } from '@/features/home/api'
import { HomeSectionHeading } from './HomeSection'

export function TopCompanies({ companies }: { companies: TopCompany[] }) {
  const { t } = useTranslation()

  if (!companies.length) return null

  return (
    <section className="bg-sky-50/70">
      <div className="mx-auto max-w-7xl px-4 py-24 sm:px-8">
        <HomeSectionHeading icon="users" title={t('home.topCompaniesTitle')} subtitle={t('home.topCompaniesSubtitle')} action={<Link to="/companies" className="rounded-2xl bg-white px-5 py-3 text-sm font-bold text-rc-blue shadow-sm">{t('home.viewAll')}</Link>} />

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
                className="flex items-center gap-5 rounded-[1.5rem] border border-sky-100 bg-white p-5 shadow-[0_14px_40px_rgb(18_76_98/0.06)] transition hover:-translate-y-1 hover:shadow-lg"
              >
                {company.logo_url ? (
                  <img
                    src={company.logo_url}
                    alt=""
                    className="h-14 w-16 shrink-0 object-contain drop-shadow-sm"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex size-14 items-center justify-center rounded-lg border border-rc-blue/30 bg-rc-blue/10 font-mono text-rc-blue">
                    RT
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
