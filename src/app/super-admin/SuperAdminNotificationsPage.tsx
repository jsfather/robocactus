import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, FieldError, Input, PanelCard, Select, Textarea } from '@/components/ui/FormControls'
import { PanelPage } from '@/components/layout/PanelShell'
import { HudFrame, SectionLabel, StatCard } from '@/components/panel/HudKit'
import { useToast } from '@/components/ui/Toast'
import {
  createSystemNotification,
  dispatchPendingSms,
  dispatchPendingEmail,
  enqueueBroadcastSms,
  fetchNotificationLogs,
  fetchSmsSettings,
  updateSmsSettings,
  type SmsSettings,
} from '@/features/notifications/api'
import { supabase } from '@/lib/supabase'
import type { NotificationLog, Profile, UserRole } from '@/types/database'

type Tab = 'log' | 'broadcast' | 'sms' | 'inapp'

export function SuperAdminNotificationsPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const [tab, setTab] = useState<Tab>('log')
  const [rows, setRows] = useState<NotificationLog[]>([])
  const [sms, setSms] = useState<SmsSettings | null>(null)
  const [users, setUsers] = useState<Profile[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const [audience, setAudience] = useState<'all' | 'role' | 'user'>('all')
  const [targetRole, setTargetRole] = useState<UserRole>('team_captain')
  const [targetUserId, setTargetUserId] = useState('')
  const [templateKey, setTemplateKey] = useState('manual_broadcast')
  const [hint, setHint] = useState('')
  const [nTitle, setNTitle] = useState('')
  const [nBody, setNBody] = useState('')

  const reload = async () => {
    setLoading(true)
    setError(null)
    try {
      const [logs, settings, profiles] = await Promise.all([
        fetchNotificationLogs(),
        fetchSmsSettings().catch(() => null),
        supabase.from('profiles').select('*').order('full_name').then((r) => (r.data ?? []) as Profile[]),
      ])
      setRows(logs)
      setSms(settings)
      setUsers(profiles)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
  }, [])

  const onDispatch = async () => {
    setBusy(true)
    const [smsResult, emailResult] = await Promise.all([
      dispatchPendingSms(),
      dispatchPendingEmail(),
    ])
    setBusy(false)
    if (smsResult.error && emailResult.error) {
      const msg = smsResult.error || emailResult.error
      setError(msg ?? 'dispatch_failed')
      toast.error(msg ?? 'dispatch_failed')
      return
    }
    const count = (smsResult.processed ?? 0) + (emailResult.processed ?? 0)
    toast.success(t('notifications.dispatched', { count }))
    await reload()
  }

  const onBroadcastSms = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const n = await enqueueBroadcastSms({
        templateKey,
        audience,
        targetRole: audience === 'role' ? targetRole : null,
        targetUserId: audience === 'user' ? targetUserId : null,
        bodyHint: hint,
      })
      toast.success(t('notifications.queued', { count: n }))
      await dispatchPendingSms()
      await reload()
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('common.error')
      setError(msg)
      toast.error(msg)
    } finally {
      setBusy(false)
    }
  }

  const onInApp = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      await createSystemNotification({
        title: nTitle,
        body: nBody,
        audience,
        targetRole: audience === 'role' ? targetRole : null,
        targetUserId: audience === 'user' ? targetUserId : null,
      })
      toast.success(t('notifications.inAppSent'))
      setNTitle('')
      setNBody('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  const onSaveSms = async (e: FormEvent) => {
    e.preventDefault()
    if (!sms) return
    setBusy(true)
    try {
      const saved = await updateSmsSettings({
        mock_mode: sms.mock_mode,
        originator: sms.originator,
        api_key_hint: sms.api_key_hint,
        pattern_codes: sms.pattern_codes,
        enable_account_approved: sms.enable_account_approved,
        enable_league_joined: sms.enable_league_joined,
        enable_results: sms.enable_results,
        enable_incomplete_profile: sms.enable_incomplete_profile,
        enable_account_issue: sms.enable_account_issue,
      })
      setSms(saved)
      toast.success(t('common.saved'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  const pending = rows.filter((r) => r.status === 'pending').length
  const sent = rows.filter((r) => r.status === 'sent' || r.status === 'delivered').length

  return (
    <PanelPage
      index="SYS.07"
      title={t('notifications.title')}
      description={t('notifications.subtitle')}
      actions={
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={() => void reload()} disabled={loading}>
            {t('notifications.refresh')}
          </Button>
          <Button type="button" onClick={() => void onDispatch()} disabled={busy}>
            {busy ? t('app.loading') : t('notifications.dispatch')}
          </Button>
        </div>
      }
    >
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard index="N01" label={t('notifications.pending')} value={pending} accent="orange" />
        <StatCard index="N02" label={t('notifications.sent')} value={sent} accent="green" />
        <StatCard index="N03" label={t('notifications.total')} value={rows.length} />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {(['log', 'broadcast', 'inapp', 'sms'] as Tab[]).map((key) => (
          <Button
            key={key}
            type="button"
            variant={tab === key ? 'primary' : 'ghost'}
            onClick={() => setTab(key)}
          >
            {t(`notifications.tabs.${key}`)}
          </Button>
        ))}
      </div>

      <FieldError message={error ?? undefined} />

      {tab === 'log' ? (
        <HudFrame className="p-4">
          <SectionLabel index="LOG.01" title={t('notifications.logTitle')} hint={t('notifications.idempotencyHint')} />
          {loading ? (
            <p className="text-sm text-rc-muted">{t('app.loading')}</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-rc-muted">{t('notifications.empty')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] text-sm">
                <thead>
                  <tr className="border-b border-rc-line text-rc-muted">
                    <th className="px-2 py-2 text-start">{t('notifications.template')}</th>
                    <th className="px-2 py-2 text-start">{t('notifications.phone')}</th>
                    <th className="px-2 py-2 text-start">{t('notifications.status')}</th>
                    <th className="px-2 py-2 text-start">{t('notifications.time')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b border-rc-line-soft align-top">
                      <td className="px-2 py-2 font-mono text-xs text-rc-blue">{row.template_key}</td>
                      <td className="px-2 py-2 font-mono text-xs" dir="ltr">
                        {row.email || row.phone || '—'}
                      </td>
                      <td className="px-2 py-2 font-mono text-xs">
                        {row.status}
                        {row.error_message ? (
                          <span className="mt-1 block text-red-400">{row.error_message}</span>
                        ) : null}
                      </td>
                      <td className="px-2 py-2 text-xs text-rc-muted">
                        {row.sent_at
                          ? new Date(row.sent_at).toLocaleString()
                          : row.created_at
                            ? new Date(row.created_at).toLocaleString()
                            : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </HudFrame>
      ) : null}

      {tab === 'broadcast' ? (
        <HudFrame className="p-4">
          <SectionLabel index="BC.01" title={t('notifications.broadcastSms')} />
          <form className="grid max-w-xl gap-3" onSubmit={(e) => void onBroadcastSms(e)}>
            <Select label={t('notifications.audience')} value={audience} onChange={(e) => setAudience(e.target.value as typeof audience)}>
              <option value="all">{t('notifications.audienceAll')}</option>
              <option value="role">{t('notifications.audienceRole')}</option>
              <option value="user">{t('notifications.audienceUser')}</option>
            </Select>
            {audience === 'role' ? (
              <Select label={t('notifications.targetRole')} value={targetRole} onChange={(e) => setTargetRole(e.target.value as UserRole)}>
                {(['team_captain', 'company_admin', 'staff', 'league_admin', 'super_admin'] as UserRole[]).map((r) => (
                  <option key={r} value={r}>
                    {t(`dashboard.roles.${r}`)}
                  </option>
                ))}
              </Select>
            ) : null}
            {audience === 'user' ? (
              <Select label={t('notifications.targetUser')} value={targetUserId} onChange={(e) => setTargetUserId(e.target.value)}>
                <option value="">{t('admin.users.pickUserPlaceholder')}</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name} · {u.phone}
                  </option>
                ))}
              </Select>
            ) : null}
            <Input label={t('notifications.template')} value={templateKey} onChange={(e) => setTemplateKey(e.target.value)} dir="ltr" />
            <Textarea label={t('notifications.hint')} className="min-h-20" value={hint} onChange={(e) => setHint(e.target.value)} />
            <Button type="submit" disabled={busy}>
              {t('notifications.queueSms')}
            </Button>
          </form>
        </HudFrame>
      ) : null}

      {tab === 'inapp' ? (
        <HudFrame className="p-4">
          <SectionLabel index="IA.01" title={t('notifications.inAppTitle')} hint={t('notifications.inAppHint')} />
          <form className="grid max-w-xl gap-3" onSubmit={(e) => void onInApp(e)}>
            <Select label={t('notifications.audience')} value={audience} onChange={(e) => setAudience(e.target.value as typeof audience)}>
              <option value="all">{t('notifications.audienceAll')}</option>
              <option value="role">{t('notifications.audienceRole')}</option>
              <option value="user">{t('notifications.audienceUser')}</option>
            </Select>
            {audience === 'role' ? (
              <Select label={t('notifications.targetRole')} value={targetRole} onChange={(e) => setTargetRole(e.target.value as UserRole)}>
                {(['team_captain', 'company_admin', 'staff', 'league_admin'] as UserRole[]).map((r) => (
                  <option key={r} value={r}>
                    {t(`dashboard.roles.${r}`)}
                  </option>
                ))}
              </Select>
            ) : null}
            {audience === 'user' ? (
              <Select label={t('notifications.targetUser')} value={targetUserId} onChange={(e) => setTargetUserId(e.target.value)}>
                <option value="">{t('admin.users.pickUserPlaceholder')}</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name}
                  </option>
                ))}
              </Select>
            ) : null}
            <Input label={t('content.postTitle')} required value={nTitle} onChange={(e) => setNTitle(e.target.value)} />
            <Textarea label={t('content.body')} required className="min-h-28" value={nBody} onChange={(e) => setNBody(e.target.value)} />
            <Button type="submit" disabled={busy}>
              {t('notifications.sendInApp')}
            </Button>
          </form>
        </HudFrame>
      ) : null}

      {tab === 'sms' && sms ? (
        <HudFrame className="p-4">
          <SectionLabel index="SMS.01" title={t('notifications.smsSettings')} hint={t('notifications.smsSettingsHint')} />
          <form className="grid max-w-xl gap-3" onSubmit={(e) => void onSaveSms(e)}>
            <Select
              label={t('notifications.provider')}
              value={sms.provider ?? 'ippanel'}
              onChange={(e) =>
                setSms({ ...sms, provider: e.target.value as 'ippanel' | 'kavenegar' })
              }
            >
              <option value="ippanel">IPPanel</option>
              <option value="kavenegar">Kavenegar</option>
            </Select>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={sms.mock_mode}
                onChange={(e) => setSms({ ...sms, mock_mode: e.target.checked })}
              />
              {t('notifications.mockMode')}
            </label>
            {(sms.provider ?? 'ippanel') === 'ippanel' ? (
              <>
                <Input
                  label={t('notifications.originator')}
                  value={sms.originator ?? ''}
                  onChange={(e) => setSms({ ...sms, originator: e.target.value })}
                  dir="ltr"
                />
                <Input
                  label={t('notifications.apiKeyHint')}
                  value={sms.api_key_hint ?? ''}
                  onChange={(e) => setSms({ ...sms, api_key_hint: e.target.value })}
                  dir="ltr"
                />
              </>
            ) : (
              <>
                <Input
                  label={t('notifications.kavenegarSender')}
                  value={sms.kavenegar_sender ?? sms.originator ?? ''}
                  onChange={(e) => setSms({ ...sms, kavenegar_sender: e.target.value })}
                  dir="ltr"
                />
                <Input
                  label={t('notifications.kavenegarApiHint')}
                  value={sms.kavenegar_api_key_hint ?? ''}
                  onChange={(e) => setSms({ ...sms, kavenegar_api_key_hint: e.target.value })}
                  dir="ltr"
                />
              </>
            )}
            <p className="text-xs text-rc-muted">{t('notifications.providerSecretHint')}</p>
            {(
              [
                ['enable_account_approved', 'enableAccountApproved'],
                ['enable_league_joined', 'enableLeagueJoined'],
                ['enable_results', 'enableResults'],
                ['enable_incomplete_profile', 'enableIncomplete'],
                ['enable_account_issue', 'enableAccountIssue'],
              ] as const
            ).map(([field, labelKey]) => (
              <label key={field} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(sms[field])}
                  onChange={(e) => setSms({ ...sms, [field]: e.target.checked })}
                />
                {t(`notifications.${labelKey}`)}
              </label>
            ))}
            <Button type="submit" disabled={busy}>
              {t('common.save')}
            </Button>
          </form>
        </HudFrame>
      ) : null}

      {tab === 'sms' && !sms && !loading ? (
        <PanelCard title={t('notifications.smsSettings')}>
          <p className="text-sm text-rc-muted">{t('notifications.smsMigrateHint')}</p>
        </PanelCard>
      ) : null}
    </PanelPage>
  )
}
