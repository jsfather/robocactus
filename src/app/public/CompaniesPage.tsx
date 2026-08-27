import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, Input } from '@/components/ui/FormControls'
import { fetchPublicCompanies } from '@/features/rankings/api'
import type { Company } from '@/types/database'

export function CompaniesPage() {
  const { t } = useTranslation()
  const [companies, setCompanies] = useState<Company[]>([])
  const [q, setQ] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = async (query?: string) => {
    setLoading(true)
    setError(null)
    try {
      setCompanies(await fetchPublicCompanies(query))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const onSearch = (event: FormEvent) => {
    event.preventDefault()
    void load(q)
  }

  return (
    <div className="pb-20"><section className="bg-gradient-to-br from-[#063d59] via-[#087eb8] to-[#087a58] px-4 pb-20 pt-32 text-white"><div className="mx-auto max-w-6xl"><p className="text-xs font-black tracking-[.22em] text-cyan-200">PARTICIPANT DIRECTORY</p><div className="mt-3 flex flex-wrap items-end justify-between gap-5"><div><h1 className="text-4xl font-black sm:text-6xl">{t('companies.title')}</h1><p className="mt-4 max-w-2xl text-sm leading-7 text-white/75">{t('companies.subtitle')}</p></div><div className="rounded-2xl bg-white/10 px-5 py-3 text-center backdrop-blur"><strong className="block text-3xl">{companies.length.toLocaleString('fa-IR')}</strong><span className="text-xs text-white/70">پروفایل فعال</span></div></div></div></section><main className="mx-auto -mt-9 max-w-6xl space-y-6 px-4">

      <form className="flex flex-wrap gap-2 rounded-[1.75rem] border border-sky-100 bg-white p-5 shadow-[0_20px_60px_rgb(7_59_85/0.12)]" onSubmit={onSearch}>
        <div className="min-w-64 flex-1">
          <Input
            label={t('rankings.search')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('companies.searchPlaceholder')}
          />
        </div>
        <Button type="submit" className="self-end" disabled={loading}>
          {t('rankings.apply')}
        </Button>
      </form>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {loading ? <p className="text-rc-muted">{t('app.loading')}</p> : null}

      {!loading && companies.length === 0 ? (
        <p className="text-rc-muted">{t('companies.empty')}</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {companies.map((company) => (
            <li key={company.id}>
              <Link
                to={`/companies/${company.slug}`}
                className="group flex h-full flex-col overflow-hidden rounded-[1.5rem] border border-slate-100 bg-white p-5 shadow-[0_12px_36px_rgb(7_59_85/0.07)] transition duration-300 hover:-translate-y-1 hover:border-sky-200 hover:shadow-[0_20px_48px_rgb(8_126_184/0.14)]"
              >
                <div className="mb-3 flex items-center gap-3">
                  {company.logo_url ? (
                    <img
                      src={company.logo_url}
                      alt=""
                      className="size-16 rounded-2xl border border-slate-100 bg-white object-contain p-2 shadow-sm"
                    />
                  ) : (
                    <div className="flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-50 to-emerald-50 font-mono font-black text-rc-blue">
                      CO
                    </div>
                  )}
                  <div>
                    <h2 className="font-black text-slate-900 transition group-hover:text-sky-700">{company.name}</h2>
                    <p className="font-mono text-xs text-rc-muted">{company.slug}</p>
                  </div>
                </div>
                {company.bio ? (
                  <p className="line-clamp-3 text-sm leading-7 text-slate-500">{company.bio}</p>
                ) : (
                  <p className="text-sm text-rc-muted">{t('companies.noBio')}</p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main></div>
  )
}
