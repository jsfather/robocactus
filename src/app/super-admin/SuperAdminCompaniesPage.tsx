import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PanelPage } from '@/components/layout/PanelShell'
import { HudFrame, SectionLabel, StatCard } from '@/components/panel/HudKit'
import { Button, FieldError, Input } from '@/components/ui/FormControls'
import { CompanyForm } from '@/features/companies/CompanyForm'
import { useToast } from '@/components/ui/Toast'
import { supabase } from '@/lib/supabase'
import { formatAppDate } from '@/lib/dates'
import type { Company } from '@/types/database'

export function SuperAdminCompaniesPage() {
  const { t, i18n } = useTranslation()
  const toast = useToast()
  const [rows, setRows] = useState<Company[]>([])
  const [q, setQ] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Company | null>(null)
  const [creating, setCreating] = useState(false)

  const reload = async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('companies')
      .select('*')
      .order('created_at', { ascending: false })
    if (err) setError(err.message)
    else setRows((data ?? []) as Company[])
    setLoading(false)
  }

  useEffect(() => {
    void reload()
  }, [])

  const filtered = rows.filter((c) => {
    const s = q.trim().toLowerCase()
    if (!s) return true
    return (
      c.name.toLowerCase().includes(s) ||
      c.slug.toLowerCase().includes(s) ||
      (c.tagline ?? '').toLowerCase().includes(s)
    )
  })

  const onSaved = (company: Company) => {
    setRows((prev) => {
      const exists = prev.some((c) => c.id === company.id)
      if (exists) return prev.map((c) => (c.id === company.id ? company : c))
      return [company, ...prev]
    })
    setEditing(null)
    setCreating(false)
    toast.success(t('common.saved'))
  }

  return (
    <PanelPage
      index="REG.02"
      title={t('admin.companies.title')}
      description={t('admin.companies.subtitle')}
      actions={
        <Button
          type="button"
          variant={creating || editing ? 'secondary' : 'primary'}
          onClick={() => {
            setCreating((v) => !v)
            setEditing(null)
          }}
        >
          {creating ? t('common.cancel') : t('admin.companies.create')}
        </Button>
      }
    >
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard index="C01" label={t('admin.companies.total')} value={rows.length} />
        <StatCard
          index="C02"
          label={t('admin.companies.shown')}
          value={filtered.length}
          accent="orange"
        />
      </div>

      <FieldError message={error ?? undefined} />

      {creating ? (
        <div className="mb-6">
          <CompanyForm onSaved={onSaved} />
        </div>
      ) : null}

      {editing ? (
        <div className="mb-6 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="font-mono text-[10px] tracking-[0.2em] text-rc-blue uppercase">
              {t('admin.companies.editing')}
            </p>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setEditing(null)}
            >
              {t('common.cancel')}
            </Button>
          </div>
          <CompanyForm company={editing} onSaved={onSaved} />
        </div>
      ) : null}

      <HudFrame className="mb-4 p-4">
        <Input
          label={t('admin.companies.search')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('admin.companies.searchHint')}
        />
      </HudFrame>

      <SectionLabel index="LST.01" title={t('admin.companies.list')} />
      <HudFrame className="p-2">
        {loading ? (
          <p className="p-4 text-sm text-rc-muted">{t('app.loading')}</p>
        ) : filtered.length === 0 ? (
          <p className="p-4 text-sm text-rc-muted">{t('admin.companies.empty')}</p>
        ) : (
          <ul className="divide-y divide-rc-line">
            {filtered.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  {c.logo_url ? (
                    <img src={c.logo_url} alt="" className="size-10 object-cover border border-rc-line" />
                  ) : (
                    <span className="flex size-10 items-center justify-center border border-rc-blue/30 bg-rc-blue/10 font-mono text-xs text-rc-blue">
                      {c.name.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-medium">{c.name}</p>
                    <p className="font-mono text-[10px] text-rc-muted">
                      {c.slug} · {formatAppDate(c.created_at, i18n.language)}
                    </p>
                    {c.tagline ? (
                      <p className="mt-0.5 truncate text-xs text-rc-muted">{c.tagline}</p>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setCreating(false)
                      setEditing(c)
                      window.scrollTo({ top: 0, behavior: 'smooth' })
                    }}
                  >
                    {t('common.edit')}
                  </Button>
                  <Link
                    to={`/companies/${c.slug}`}
                    className="border border-rc-line px-3 py-1.5 text-xs text-rc-blue hover:bg-rc-hover"
                  >
                    {t('admin.pages.preview')}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </HudFrame>
    </PanelPage>
  )
}
