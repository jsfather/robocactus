import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, PanelCard } from '@/components/ui/FormControls'
import { fetchInvoice, verifyGatewayThenApply } from '@/features/payments/api'
import { dispatchPendingSms } from '@/features/notifications/api'
import type { Invoice } from '@/types/database'

export function PaymentCallbackPage() {
  const { t } = useTranslation()
  const [params] = useSearchParams()
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const ran = useRef(false)

  const authority = params.get('Authority') ?? params.get('authority') ?? ''
  const status = (params.get('Status') ?? params.get('status') ?? '').toUpperCase()
  const invoiceId = params.get('invoice') ?? ''

  useEffect(() => {
    if (ran.current) return
    ran.current = true

    const run = async () => {
      try {
        if (!invoiceId || !authority) {
          setError(t('payment.callbackMissing'))
          setDone(true)
          return
        }

        const current = await fetchInvoice(invoiceId)
        if (!current) {
          setError(t('payment.invoiceNotFound'))
          setDone(true)
          return
        }

        if (current.status === 'paid') {
          setInvoice(current)
          setDone(true)
          return
        }

        const updated = await verifyGatewayThenApply({
          invoice: current,
          authority,
          gatewayStatusOk: status === 'OK',
        })
        setInvoice(updated)
        if (updated.status === 'paid') {
          void dispatchPendingSms()
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : t('common.error'))
      } finally {
        setDone(true)
      }
    }

    void run()
  }, [authority, invoiceId, status, t])

  const success = invoice?.status === 'paid'

  return (
    <div className="mx-auto max-w-lg space-y-6 px-4 py-16">
      <PanelCard
        title={
          !done
            ? t('payment.verifying')
            : success
              ? t('payment.successTitle')
              : t('payment.failTitle')
        }
        description={
          success ? t('payment.successHint') : done ? t('payment.failHint') : t('app.loading')
        }
      >
        {invoice ? (
          <div className="space-y-2 text-sm">
            <p className="font-mono text-rc-blue">{invoice.invoice_number}</p>
            <p>
              {t('payment.invoiceStatus')}: <span className="font-mono">{invoice.status}</span>
            </p>
          </div>
        ) : null}
        {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}

        {done ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {invoice ? (
              <Link to={`/payments/teams/${invoice.team_id}`}>
                <Button type="button" variant="secondary">
                  {t('payment.backToPayment')}
                </Button>
              </Link>
            ) : null}
            <Link to="/company">
              <Button type="button" variant="ghost">
                {t('company.panelTitle')}
              </Button>
            </Link>
          </div>
        ) : null}
      </PanelCard>
    </div>
  )
}
