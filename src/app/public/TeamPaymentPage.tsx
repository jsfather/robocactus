import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, FieldError, PanelCard, StatusBadge } from '@/components/ui/FormControls'
import { useAuth } from '@/hooks/useAuth'
import { fetchActiveLeagues } from '@/features/companies/api'
import { fetchTeamById } from '@/features/registration/api'
import {
  createInvoiceForTeam,
  fetchLatestInvoiceForTeam,
  formatAmountToman,
  startTeamPayment,
} from '@/features/payments/api'
import { downloadInvoicePdf } from '@/features/payments/invoicePdf'
import { supabase } from '@/lib/supabase'
import { getConfiguredGatewayKind } from '@/lib/payment-gateway'
import type { Company, Invoice, League, Team } from '@/types/database'

export function TeamPaymentPage() {
  const { teamId } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()

  const [team, setTeam] = useState<Team | null>(null)
  const [league, setLeague] = useState<League | null>(null)
  const [company, setCompany] = useState<Company | null>(null)
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [failUrl, setFailUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!teamId || authLoading || !user) return

    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        const row = await fetchTeamById(teamId)
        if (!row) {
          setError(t('payment.teamNotFound'))
          return
        }
        setTeam(row)

        const [leagues, companyRes, existing] = await Promise.all([
          fetchActiveLeagues(),
          supabase.from('companies').select('*').eq('id', row.company_id).maybeSingle(),
          fetchLatestInvoiceForTeam(row.id),
        ])

        setLeague(leagues.find((l) => l.id === row.league_id) ?? null)
        setCompany((companyRes.data as Company | null) ?? null)
        setInvoice(existing)

        if (row.status === 'draft' && (!existing || existing.status !== 'paid')) {
          const created = await createInvoiceForTeam(row.id)
          setInvoice(created)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : t('common.error'))
      } finally {
        setLoading(false)
      }
    }

    void run()
  }, [teamId, user, authLoading, t])

  const pay = async () => {
    if (!team || !league || !invoice) return
    setBusy(true)
    setError(null)
    try {
      const { redirectUrl, failUrl: mockFail } = await startTeamPayment({ team, league, invoice })
      setFailUrl(mockFail ?? null)
      window.location.href = redirectUrl
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
      setBusy(false)
    }
  }

  if (authLoading || loading) {
    return <div className="px-4 py-12 text-center text-rc-muted">{t('app.loading')}</div>
  }

  if (!team || !league) {
    return (
      <div className="mx-auto max-w-lg px-4 py-12">
        <p className="text-red-400">{error ?? t('payment.teamNotFound')}</p>
        <Link to="/company" className="mt-4 inline-block text-rc-blue hover:underline">
          {t('company.panelTitle')}
        </Link>
      </div>
    )
  }

  const isPaid = invoice?.status === 'paid' || team.status !== 'draft'
  const amount = Number(invoice?.amount ?? league.registration_fee ?? 0)

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-10">
      <div>
        <h1 className="text-3xl font-semibold">{t('payment.title')}</h1>
        <p className="mt-1 text-rc-muted">{t('payment.subtitle')}</p>
      </div>

      <PanelCard title={team.name} description={league.name}>
        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-rc-muted">{t('team.status')}:</span>
            <StatusBadge
              status={team.status}
              label={t(`team.statuses.${team.status}`, { defaultValue: team.status })}
            />
          </div>
          {invoice ? (
            <>
              <p>
                <span className="text-rc-muted">{t('payment.invoiceNumber')}: </span>
                <span className="font-mono text-rc-blue">{invoice.invoice_number}</span>
              </p>
              <p>
                <span className="text-rc-muted">{t('payment.invoiceStatus')}: </span>
                <span className="font-mono">{invoice.status}</span>
              </p>
            </>
          ) : null}
          <p className="text-2xl font-semibold text-rc-accent">
            {formatAmountToman(amount)}{' '}
            <span className="text-sm font-normal text-rc-muted">{t('payment.currency')}</span>
          </p>
          <p className="text-xs text-rc-muted">
            {t('payment.provider')}: {getConfiguredGatewayKind()}
          </p>
        </div>
      </PanelCard>

      <FieldError message={error ?? undefined} />

      <div className="flex flex-wrap gap-2">
        {!isPaid && invoice?.status !== 'paid' ? (
          <Button type="button" onClick={() => void pay()} disabled={busy || !invoice}>
            {busy ? t('app.loading') : t('payment.payCta')}
          </Button>
        ) : null}

        {invoice?.status === 'paid' && company ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              downloadInvoicePdf({ invoice, team, company, league })
            }
          >
            {t('payment.downloadInvoice')}
          </Button>
        ) : null}

        {failUrl && getConfiguredGatewayKind() === 'mock' && !isPaid ? (
          <Button
            type="button"
            variant="danger"
            onClick={() => {
              window.location.href = failUrl
            }}
          >
            {t('payment.simulateFail')}
          </Button>
        ) : null}

        <Button type="button" variant="ghost" onClick={() => void navigate(`/team/${team.id}`)}>
          {t('team.backToList')}
        </Button>
      </div>

      {invoice?.status === 'failed' ? (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          {t('payment.failedKeptDraft')}
        </p>
      ) : null}
    </div>
  )
}
