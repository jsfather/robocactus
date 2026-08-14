import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, FieldError, PanelCard, Select, StatusBadge } from '@/components/ui/FormControls'
import { PanelPage } from '@/components/layout/PanelShell'
import { StatCard } from '@/components/panel/HudKit'
import { TicketInbox } from '@/features/chat/TicketInbox'
import { DepartmentSettings } from '@/features/tickets/DepartmentSettings'
import {
  fetchTicketDepartments,
  fetchTicketStatusCounts,
  type TicketStatusCounts,
} from '@/features/tickets/api'
import { fetchTeamsForReview, reviewTeam } from '@/features/judging/api'
import { useUnreadTicketCount } from '@/hooks/useUnreadTickets'
import { useAuth } from '@/hooks/useAuth'
import type { Team, TicketDepartment } from '@/types/database'

export function StaffPage({ section = 'tickets' }: { section?: 'tickets' | 'triage' }) {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const { count: unread } = useUnreadTicketCount()
  const [teams, setTeams] = useState<Team[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [counts, setCounts] = useState<TicketStatusCounts>({
    open: 0,
    answered: 0,
    closed: 0,
    total: 0,
  })
  const [departments, setDepartments] = useState<TicketDepartment[]>([])
  const [deptFilter, setDeptFilter] = useState('')
  const [showDeptSettings, setShowDeptSettings] = useState(false)
  const tab = section
  const isSa = profile?.role === 'super_admin'

  const loadTriage = async () => {
    setLoading(true)
    setError(null)
    try {
      setTeams(await fetchTeamsForReview({ statuses: ['submitted'] }))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (tab === 'triage') void loadTriage()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  useEffect(() => {
    if (tab !== 'tickets') return
    void fetchTicketStatusCounts()
      .then(setCounts)
      .catch(() => undefined)
    void fetchTicketDepartments(true)
      .then(setDepartments)
      .catch(() => undefined)
  }, [tab])

  const markReview = async (teamId: string) => {
    setBusy(true)
    setError(null)
    try {
      const updated = await reviewTeam({ teamId, status: 'under_review' })
      setTeams((prev) => prev.filter((x) => x.id !== updated.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <PanelPage
      index={tab === 'triage' ? 'OPS.04' : 'OPS.03'}
      title={tab === 'triage' ? t('staff.tabTriage') : t('staff.tabTickets')}
      description={t('staff.subtitle')}
      actions={
        tab === 'tickets' && isSa ? (
          <Button
            type="button"
            variant={showDeptSettings ? 'primary' : 'secondary'}
            onClick={() => setShowDeptSettings((v) => !v)}
          >
            {t('tickets.departments')}
          </Button>
        ) : undefined
      }
    >
      <FieldError message={error ?? undefined} />

      {tab === 'tickets' ? (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard index="TK.01" label={t('tickets.statusOpen')} value={counts.open} accent="orange" />
            <StatCard
              index="TK.02"
              label={t('tickets.statusAnswered')}
              value={counts.answered}
              accent="blue"
            />
            <StatCard
              index="TK.03"
              label={t('tickets.statusClosed')}
              value={counts.closed}
              accent="green"
            />
            <StatCard index="TK.04" label={t('panel.unreadTicketsShort')} value={unread} accent="red" />
          </div>

          {showDeptSettings && isSa ? (
            <div className="mb-8">
              <DepartmentSettings />
            </div>
          ) : null}

          {departments.length ? (
            <div className="mb-4 max-w-xs">
              <Select
                label={t('tickets.filterDepartment')}
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
              >
                <option value="">{t('tickets.allDepartments')}</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}

          <TicketInbox mode="staff" departmentId={deptFilter || undefined} />
        </>
      ) : (
        <PanelCard title={t('staff.triageTitle')} description={t('staff.triageHint')}>
          {loading ? (
            <p className="text-sm text-rc-muted">{t('app.loading')}</p>
          ) : teams.length === 0 ? (
            <p className="text-sm text-rc-muted">{t('staff.triageEmpty')}</p>
          ) : (
            <ul className="divide-y divide-rc-line">
              {teams.map((team) => (
                <li key={team.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-medium">{team.name}</p>
                    <StatusBadge
                      status={team.status}
                      label={t(`team.statuses.${team.status}`, { defaultValue: team.status })}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void markReview(team.id)}
                  >
                    {t('staff.markUnderReview')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </PanelCard>
      )}
    </PanelPage>
  )
}
