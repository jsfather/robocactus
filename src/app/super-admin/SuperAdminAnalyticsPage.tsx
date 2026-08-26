import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Button, PanelCard } from '@/components/ui/FormControls'
import { formatAmountToman } from '@/features/payments/api'
import {
  downloadCsv,
  fetchAnalyticsExportRows,
  fetchAnalyticsSnapshot,
  openAnalyticsPdf,
  type AnalyticsSnapshot,
} from '@/features/analytics/api'
import { backend } from '@/lib/backend'

const emptySnapshot: AnalyticsSnapshot = {
  generated_at: '',
  totals: { teams: 0, companies: 0, paid_invoices: 0, paid_amount: 0 },
  by_status: [],
  by_league: [],
  by_province: [],
  by_company: [],
  finance_by_status: [],
}

function ChartBlock({
  title,
  data,
  fill,
}: {
  title: string
  data: Array<{ key: string; count: number }>
  fill: string
}) {
  return (
    <PanelCard title={title}>
      {!data.length ? (
        <p className="text-sm text-rc-muted">—</p>
      ) : (
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 48 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis
                dataKey="key"
                tick={{ fill: '#94a3b8', fontSize: 11 }}
                interval={0}
                angle={-25}
                textAnchor="end"
                height={60}
              />
              <YAxis allowDecimals={false} tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  background: '#ffffff',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8,
                }}
                labelStyle={{ color: '#e8eef9' }}
              />
              <Bar dataKey="count" fill={fill} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </PanelCard>
  )
}

export function SuperAdminAnalyticsPage() {
  const { t } = useTranslation()
  const [snap, setSnap] = useState<AnalyticsSnapshot>(emptySnapshot)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [live, setLive] = useState(false)
  const [exportBusy, setExportBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await fetchAnalyticsSnapshot()
      setSnap(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void load()
  }, [load])

  // Realtime + short polling fallback
  useEffect(() => {
    const channel = backend
      .channel('analytics-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, () => {
        void load()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, () => {
        void load()
      })
      .subscribe((status) => {
        setLive(status === 'SUBSCRIBED')
      })

    const poll = window.setInterval(() => {
      void load()
    }, 20_000)

    return () => {
      window.clearInterval(poll)
      void backend.removeChannel(channel)
    }
  }, [load])

  const onExportCsv = async () => {
    setExportBusy(true)
    setError(null)
    try {
      const rows = await fetchAnalyticsExportRows()
      downloadCsv(`tabarestan-cup-teams-${Date.now()}.csv`, rows)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setExportBusy(false)
    }
  }

  const onExportPdf = async () => {
    setExportBusy(true)
    setError(null)
    try {
      const rows = await fetchAnalyticsExportRows()
      openAnalyticsPdf(rows, t('analytics.exportTitle'))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setExportBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">{t('analytics.title')}</h1>
          <p className="mt-1 text-rc-muted">{t('analytics.subtitle')}</p>
          <p className="mt-2 font-mono text-xs text-rc-blue">
            {live ? t('analytics.liveOn') : t('analytics.livePolling')}
            {snap.generated_at
              ? ` · ${new Date(snap.generated_at).toLocaleTimeString()}`
              : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => void load()} disabled={loading}>
            {t('analytics.refresh')}
          </Button>
          <Button type="button" variant="secondary" disabled={exportBusy} onClick={() => void onExportCsv()}>
            {t('analytics.exportExcel')}
          </Button>
          <Button type="button" disabled={exportBusy} onClick={() => void onExportPdf()}>
            {t('analytics.exportPdf')}
          </Button>
        </div>
      </div>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {loading ? <p className="text-rc-muted">{t('app.loading')}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: t('analytics.totalTeams'), value: String(snap.totals?.teams ?? 0) },
          { label: t('analytics.totalCompanies'), value: String(snap.totals?.companies ?? 0) },
          { label: t('analytics.paidInvoices'), value: String(snap.totals?.paid_invoices ?? 0) },
          {
            label: t('analytics.paidAmount'),
            value: formatAmountToman(Number(snap.totals?.paid_amount ?? 0)),
          },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-rc-line bg-rc-surface px-4 py-3"
          >
            <p className="text-xs text-rc-muted">{card.label}</p>
            <p className="mt-1 font-mono text-lg text-rc-blue">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartBlock title={t('analytics.byStatus')} data={snap.by_status ?? []} fill="#3b82f6" />
        <ChartBlock title={t('analytics.byLeague')} data={snap.by_league ?? []} fill="#fb923c" />
        <ChartBlock title={t('analytics.byProvince')} data={snap.by_province ?? []} fill="#34d399" />
        <ChartBlock title={t('analytics.byCompany')} data={snap.by_company ?? []} fill="#60a5fa" />
      </div>

      <PanelCard title={t('analytics.financeByStatus')}>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(snap.finance_by_status ?? []).map((row) => (
            <li
              key={row.key}
              className="rounded-lg border border-rc-line bg-rc-navy/40 px-3 py-3"
            >
              <p className="font-mono text-xs text-rc-muted">{row.key}</p>
              <p className="mt-1 text-lg font-semibold">{row.count}</p>
              <p className="font-mono text-sm text-rc-accent">
                {formatAmountToman(Number(row.amount ?? 0))}
              </p>
            </li>
          ))}
        </ul>
      </PanelCard>
    </div>
  )
}
