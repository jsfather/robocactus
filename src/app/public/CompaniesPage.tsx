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
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-12">
      <div>
        <h1 className="text-3xl font-semibold">{t('companies.title')}</h1>
        <p className="mt-1 text-rc-muted">{t('companies.subtitle')}</p>
      </div>

      <form className="flex flex-wrap gap-2" onSubmit={onSearch}>
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
                className="flex h-full flex-col rounded-xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-rc-blue/40"
              >
                <div className="mb-3 flex items-center gap-3">
                  {company.logo_url ? (
                    <img
                      src={company.logo_url}
                      alt=""
                      className="size-12 rounded-md border border-white/10 object-cover"
                    />
                  ) : (
                    <div className="flex size-12 items-center justify-center rounded-md border border-white/10 font-mono text-rc-blue">
                      CO
                    </div>
                  )}
                  <div>
                    <h2 className="font-semibold text-rc-text">{company.name}</h2>
                    <p className="font-mono text-xs text-rc-muted">{company.slug}</p>
                  </div>
                </div>
                {company.bio ? (
                  <p className="line-clamp-3 text-sm text-rc-muted">{company.bio}</p>
                ) : (
                  <p className="text-sm text-rc-muted">{t('companies.noBio')}</p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
