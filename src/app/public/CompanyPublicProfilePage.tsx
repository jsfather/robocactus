import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { StatusBadge } from '@/components/ui/FormControls'
import { usePageSeo } from '@/components/seo/SeoManager'
import {
  championshipsFromResults,
  fetchCompanyProfile,
  type CompanyProfileBundle,
} from '@/features/rankings/api'

function medalLabel(rank: number | null, t: (k: string) => string) {
  if (rank === 1) return t('companies.gold')
  if (rank === 2) return t('companies.silver')
  if (rank === 3) return t('companies.bronze')
  return rank != null ? `#${rank}` : '—'
}

export function CompanyPublicProfilePage() {
  const { slug } = useParams()
  const { t } = useTranslation()
  const [bundle, setBundle] = useState<CompanyProfileBundle | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  usePageSeo({
    title: bundle?.company.name,
    description: bundle?.company.bio
      ? bundle.company.bio.slice(0, 160)
      : bundle?.company.name
        ? `${bundle.company.name} — ${t('seo.pages.company.description')}`
        : undefined,
    image: bundle?.company.cover_image_url || bundle?.company.logo_url || undefined,
  })

  useEffect(() => {
    if (!slug) return
    setLoading(true)
    void fetchCompanyProfile(slug)
      .then((data) => {
        setBundle(data)
        if (!data) setError(t('companies.notFound'))
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [slug, t])

  const podium = useMemo(
    () => (bundle ? championshipsFromResults(bundle.results) : []),
    [bundle],
  )

  if (loading) {
    return <div className="px-4 py-12 text-center text-rc-muted">{t('app.loading')}</div>
  }

  if (!bundle) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <p className="text-red-400">{error ?? t('companies.notFound')}</p>
        <Link to="/companies" className="mt-4 inline-block text-rc-blue hover:underline">
          {t('companies.back')}
        </Link>
      </div>
    )
  }

  const { company, achievements, results, activeTeams } = bundle
  const cover = company.cover_image_url || company.logo_url

  return (
    <div className="pb-16">
      <section className="relative min-h-[42vh] overflow-hidden border-b border-rc-line">
        {cover ? (
          <img src={cover} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-rc-navy via-rc-bg to-rc-blue/20" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-rc-bg via-rc-bg/70 to-rc-bg/20" />
        <div className="relative mx-auto flex max-w-5xl flex-col justify-end gap-4 px-4 pb-10 pt-24">
          <div className="flex flex-wrap items-end gap-4">
            {company.logo_url ? (
              <img
                src={company.logo_url}
                alt=""
                className="size-24 border border-rc-line bg-rc-navy object-cover shadow-lg"
              />
            ) : (
              <div className="flex size-24 items-center justify-center border border-rc-blue/40 bg-rc-blue/10 font-mono text-xl text-rc-blue">
                CO
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[10px] tracking-[0.28em] text-rc-blue uppercase">
                COMPANY DOSSIER · {company.slug}
              </p>
              <h1 className="mt-1 text-4xl font-semibold tracking-tight">{company.name}</h1>
              {company.tagline ? (
                <p className="mt-2 max-w-2xl text-rc-muted">{company.tagline}</p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-3 text-sm text-rc-muted">
                {company.founded_year ? (
                  <span>
                    {t('companies.founded')}: {company.founded_year}
                  </span>
                ) : null}
                {company.website ? (
                  <a href={company.website} className="text-rc-blue hover:underline" dir="ltr" target="_blank" rel="noreferrer">
                    {company.website}
                  </a>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-5xl space-y-10 px-4 pt-10">
        {company.bio ? (
          <section>
            <p className="font-mono text-[10px] tracking-[0.22em] text-rc-blue uppercase">
              {t('companies.about')}
            </p>
            <p className="mt-3 max-w-3xl whitespace-pre-wrap leading-relaxed text-rc-muted">{company.bio}</p>
          </section>
        ) : null}

        <section>
          <p className="font-mono text-[10px] tracking-[0.22em] text-rc-blue uppercase">
            {t('companies.championships')}
          </p>
          <h2 className="mt-1 text-2xl font-semibold">{t('companies.championshipHistory')}</h2>
          {podium.length === 0 && achievements.length === 0 ? (
            <p className="mt-4 text-sm text-rc-muted">{t('companies.noChampionships')}</p>
          ) : (
            <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {podium.map((item, i) => (
                <li
                  key={`p-${i}`}
                  className="relative border border-rc-line bg-rc-surface/80 p-4"
                >
                  <span className="font-mono text-[10px] text-rc-accent uppercase">
                    {medalLabel(item.rank, t)}
                  </span>
                  <p className="mt-2 font-semibold">{item.league_name}</p>
                  <p className="mt-1 font-mono text-xs text-rc-muted">
                    {item.season_year} · {item.team_name}
                  </p>
                </li>
              ))}
              {achievements.map((a) => (
                <li key={a.id} className="border border-rc-line bg-rc-surface/80 p-4">
                  <span className="font-mono text-[10px] text-rc-blue uppercase">
                    {a.year ?? '—'}
                  </span>
                  <p className="mt-2 font-semibold">{a.title}</p>
                  {a.description ? (
                    <p className="mt-1 text-sm text-rc-muted">{a.description}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <p className="font-mono text-[10px] tracking-[0.22em] text-rc-blue uppercase">
            {t('companies.activeTeams')}
          </p>
          <ul className="mt-4 divide-y divide-rc-line border border-rc-line">
            {activeTeams.length === 0 ? (
              <li className="px-4 py-3 text-sm text-rc-muted">{t('companies.noTeams')}</li>
            ) : (
              activeTeams.map((team) => (
                <li key={team.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <span className="font-medium">{team.name}</span>
                  <StatusBadge
                    status={team.status}
                    label={t(`team.statuses.${team.status}`, { defaultValue: team.status })}
                  />
                </li>
              ))
            )}
          </ul>
        </section>

        {results.length ? (
          <section>
            <p className="font-mono text-[10px] tracking-[0.22em] text-rc-blue uppercase">
              {t('companies.fullHistory')}
            </p>
            <div className="mt-4 overflow-x-auto border border-rc-line">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-rc-line text-rc-muted">
                    <th className="px-3 py-2 text-start">{t('rankings.year')}</th>
                    <th className="px-3 py-2 text-start">{t('team.league')}</th>
                    <th className="px-3 py-2 text-start">{t('team.name')}</th>
                    <th className="px-3 py-2 text-start">{t('rankings.rank')}</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, i) => (
                    <tr key={i} className="border-b border-rc-line-soft">
                      <td className="px-3 py-2 font-mono text-xs">{r.season_year}</td>
                      <td className="px-3 py-2">{r.league_name}</td>
                      <td className="px-3 py-2">{r.team_name}</td>
                      <td className="px-3 py-2 font-mono">{medalLabel(r.rank, t)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        <Link to="/companies" className="inline-block text-sm text-rc-blue hover:underline">
          ← {t('companies.back')}
        </Link>
      </div>
    </div>
  )
}
