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
      <section className="relative min-h-[52vh] overflow-hidden">
        {cover ? (
          <img src={cover} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-rc-navy via-rc-bg to-rc-blue/20" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#052f46] via-[#052f46]/75 to-[#052f46]/25" />
        <div className="relative mx-auto flex max-w-5xl flex-col justify-end gap-4 px-4 pb-10 pt-24">
          <div className="flex flex-wrap items-end gap-4">
            {company.logo_url ? (
              <img
                src={company.logo_url}
                alt=""
                className="size-28 rounded-3xl border-4 border-white/80 bg-white object-contain p-2 shadow-2xl"
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
              <h1 className="mt-1 text-4xl font-black tracking-tight text-white sm:text-6xl">{company.name}</h1>
              {company.tagline ? (
                <p className="mt-3 max-w-2xl text-white/75">{company.tagline}</p>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-3 text-sm text-white/70">
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

      <div className="mx-auto -mt-7 max-w-5xl space-y-8 px-4 pt-0 relative z-10"><section className="grid gap-3 rounded-[1.75rem] border border-sky-100 bg-white p-5 shadow-[0_20px_60px_rgb(7_59_85/0.12)] sm:grid-cols-3"><div className="rounded-2xl bg-sky-50 p-4"><strong className="text-3xl text-sky-800">{activeTeams.length.toLocaleString('fa-IR')}</strong><p className="mt-1 text-xs font-bold text-sky-600">{t('companies.activeTeams')}</p></div><div className="rounded-2xl bg-emerald-50 p-4"><strong className="text-3xl text-emerald-800">{podium.length.toLocaleString('fa-IR')}</strong><p className="mt-1 text-xs font-bold text-emerald-600">{t('companies.championships')}</p></div><div className="rounded-2xl bg-amber-50 p-4"><strong className="text-3xl text-amber-800">{new Set(results.map((row) => row.league_id)).size.toLocaleString('fa-IR')}</strong><p className="mt-1 text-xs font-bold text-amber-600">لیگ شرکت‌کرده</p></div></section>
        {company.bio ? (
          <section className="rounded-[1.75rem] border border-slate-100 bg-white p-6 shadow-sm">
            <p className="font-mono text-[10px] tracking-[0.22em] text-rc-blue uppercase">
              {t('companies.about')}
            </p>
            <p className="mt-3 max-w-3xl whitespace-pre-wrap leading-relaxed text-rc-muted">{company.bio}</p>
          </section>
        ) : null}

        {(podium.length > 0 || achievements.length > 0) ? <section className="rounded-[1.75rem] border border-slate-100 bg-white p-6 shadow-sm">
          <p className="font-mono text-[10px] tracking-[0.22em] text-rc-blue uppercase">
            {t('companies.championships')}
          </p>
          <h2 className="mt-1 text-2xl font-semibold">{t('companies.championshipHistory')}</h2>
          {
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
          }
        </section> : null}

        {activeTeams.length ? <section className="rounded-[1.75rem] border border-slate-100 bg-white p-6 shadow-sm">
          <p className="font-mono text-[10px] tracking-[0.22em] text-rc-blue uppercase">
            {t('companies.activeTeams')}
          </p>
          <ul className="mt-4 divide-y divide-rc-line border border-rc-line">
            {activeTeams.map((team) => (
                <li key={team.id} className="px-5 py-5">
                  <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-lg font-black">{team.name}{team.name_en ? <span className="ms-2 text-sm font-medium text-slate-400" dir="ltr">{team.name_en}</span> : null}</p><p className="mt-1 text-xs font-bold text-sky-700">{team.league_name}</p>{team.motto_fa || team.motto_en ? <p className="mt-2 text-sm italic text-slate-500">{team.motto_fa || team.motto_en}</p> : null}</div><StatusBadge status={team.status} label={t(`team.statuses.${team.status}`, { defaultValue: team.status })} /></div>
                  <div className="mt-4 flex flex-wrap gap-3">{team.public_members.map((person) => <div key={person.id} className="flex items-center gap-2 rounded-2xl bg-slate-50 px-3 py-2"><span className="grid size-10 overflow-hidden place-items-center rounded-xl bg-slate-200 text-sm font-black text-slate-500">{person.photo_url ? <img src={person.photo_url} alt="" className="size-full object-cover" /> : person.full_name.slice(0, 1)}</span><span><b className="block text-sm">{person.full_name}</b><small className="text-slate-500">{person.role === 'captain' ? 'سرپرست' : person.role === 'coach' ? 'مربی' : 'عضو'}</small></span></div>)}</div>
                </li>
              ))}
          </ul>
        </section> : null}

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
