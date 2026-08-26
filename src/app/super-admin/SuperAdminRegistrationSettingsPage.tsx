import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, FieldError, Input, Select } from '@/components/ui/FormControls'
import { PanelPage } from '@/components/layout/PanelShell'
import { HudFrame, SectionLabel } from '@/components/panel/HudKit'
import { useToast } from '@/components/ui/Toast'
import {
  fetchAllRegistrationDocTypes,
  upsertRegistrationDocType,
  type RegistrationDocType,
} from '@/features/notifications/api'
import { updateSiteSettings, fetchSiteSettings } from '@/features/settings/api'
import { useSiteSettings } from '@/hooks/useSiteSettings'
import { slugify } from '@/lib/validation'

export function SuperAdminRegistrationSettingsPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const { refresh } = useSiteSettings()
  const [docs, setDocs] = useState<RegistrationDocType[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [labelFa, setLabelFa] = useState('')
  const [labelEn, setLabelEn] = useState('')
  const [code, setCode] = useState('')
  const [accountType, setAccountType] = useState<'individual' | 'legal' | 'both'>('both')
  const [msgFa, setMsgFa] = useState('')
  const [msgEn, setMsgEn] = useState('')
  const [supportPhone, setSupportPhone] = useState('')
  const [chatEnabled, setChatEnabled] = useState(true)
  const [agentsOnline, setAgentsOnline] = useState(true)
  const [welcomeFa, setWelcomeFa] = useState('')
  const [welcomeEn, setWelcomeEn] = useState('')
  const [awayFa, setAwayFa] = useState('')
  const [awayEn, setAwayEn] = useState('')
  const [offlineFa, setOfflineFa] = useState('')
  const [offlineEn, setOfflineEn] = useState('')
  const [waitFa, setWaitFa] = useState('')
  const [waitEn, setWaitEn] = useState('')
  const [waitSeconds, setWaitSeconds] = useState(180)

  const reload = async () => {
    try {
      const [d, s] = await Promise.all([fetchAllRegistrationDocTypes(), fetchSiteSettings()])
      setDocs(d)
      setMsgFa(s?.inactive_message_fa ?? '')
      setMsgEn(s?.inactive_message_en ?? '')
      setSupportPhone(s?.support_phone ?? '')
      setChatEnabled(s?.chat_enabled !== false)
      setAgentsOnline(s?.agents_online !== false)
      setWelcomeFa(s?.chat_welcome_fa ?? '')
      setWelcomeEn(s?.chat_welcome_en ?? '')
      setAwayFa(s?.chat_away_fa ?? '')
      setAwayEn(s?.chat_away_en ?? '')
      setOfflineFa(s?.chat_offline_fa ?? '')
      setOfflineEn(s?.chat_offline_en ?? '')
      setWaitFa(s?.chat_wait_message_fa ?? '')
      setWaitEn(s?.chat_wait_message_en ?? '')
      setWaitSeconds(Number(s?.chat_wait_timeout_seconds ?? 180))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    }
  }

  useEffect(() => {
    void reload()
  }, [])

  const onAddDoc = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      await upsertRegistrationDocType({
        code: slugify(code || labelEn || labelFa),
        label_fa: labelFa,
        label_en: labelEn,
        account_type: accountType,
      })
      setLabelFa('')
      setLabelEn('')
      setCode('')
      toast.success(t('common.saved'))
      await reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  const onSaveMessages = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      await updateSiteSettings({
        inactive_message_fa: msgFa,
        inactive_message_en: msgEn,
        support_phone: supportPhone,
      })
      await refresh()
      toast.success(t('common.saved'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  const onSaveChat = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      await updateSiteSettings({
        chat_enabled: chatEnabled,
        agents_online: agentsOnline,
        chat_welcome_fa: welcomeFa,
        chat_welcome_en: welcomeEn,
        chat_away_fa: awayFa,
        chat_away_en: awayEn,
        chat_offline_fa: offlineFa,
        chat_offline_en: offlineEn,
        chat_wait_message_fa: waitFa,
        chat_wait_message_en: waitEn,
        chat_wait_timeout_seconds: Math.max(30, waitSeconds),
      })
      await refresh()
      toast.success(t('common.saved'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <PanelPage
      index="SYS.08"
      title={t('registrationSettings.title')}
      description={t('registrationSettings.subtitle')}
    >
      <FieldError message={error ?? undefined} />

      <HudFrame className="mb-6 space-y-3 p-4">
        <SectionLabel index="MSG.01" title={t('registrationSettings.inactiveCopy')} />
        <form className="grid gap-3" onSubmit={(e) => void onSaveMessages(e)}>
          <Input
            label={t('registrationSettings.supportPhone')}
            value={supportPhone}
            onChange={(e) => setSupportPhone(e.target.value)}
            dir="ltr"
          />
          <label className="block space-y-1.5">
            <span className="text-sm text-rc-muted">{t('settings.inactiveFa')}</span>
            <textarea
              className="min-h-24 w-full border border-rc-line bg-rc-surface px-3 py-2 text-sm"
              value={msgFa}
              onChange={(e) => setMsgFa(e.target.value)}
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm text-rc-muted">{t('settings.inactiveEn')}</span>
            <textarea
              className="min-h-24 w-full border border-rc-line bg-rc-surface px-3 py-2 text-sm"
              value={msgEn}
              onChange={(e) => setMsgEn(e.target.value)}
            />
          </label>
          <Button type="submit" disabled={busy}>
            {t('common.save')}
          </Button>
        </form>
      </HudFrame>

      <HudFrame className="mb-6 space-y-3 p-4">
        <SectionLabel index="CHAT.01" title={t('chat.settingsTitle')} hint={t('chat.settingsHint')} />
        <form className="grid gap-3" onSubmit={(e) => void onSaveChat(e)}>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={chatEnabled} onChange={(e) => setChatEnabled(e.target.checked)} />
            {t('chat.enabled')}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={agentsOnline} onChange={(e) => setAgentsOnline(e.target.checked)} />
            {t('chat.agentsOnline')}
          </label>
          {(
            [
              [welcomeFa, setWelcomeFa, 'chat.welcomeFa'],
              [welcomeEn, setWelcomeEn, 'chat.welcomeEn'],
              [awayFa, setAwayFa, 'chat.awayFa'],
              [awayEn, setAwayEn, 'chat.awayEn'],
              [offlineFa, setOfflineFa, 'chat.offlineFa'],
              [offlineEn, setOfflineEn, 'chat.offlineEn'],
            ] as const
          ).map(([value, setter, labelKey]) => (
            <label key={labelKey} className="block space-y-1.5">
              <span className="text-sm text-rc-muted">{t(labelKey)}</span>
              <textarea
                className="min-h-16 w-full border border-rc-line bg-rc-surface px-3 py-2 text-sm"
                value={value}
                onChange={(e) => setter(e.target.value)}
              />
            </label>
          ))}
          <Input label="زمان نمایش پیام عدم پاسخ (ثانیه)" type="number" min={30} value={waitSeconds} onChange={(e) => setWaitSeconds(Number(e.target.value))} dir="ltr" />
          <label className="block space-y-1.5"><span className="text-sm text-rc-muted">پیام انتظار فارسی</span><textarea className="min-h-20 w-full border border-rc-line bg-rc-surface px-3 py-2 text-sm" value={waitFa} onChange={(e) => setWaitFa(e.target.value)} /></label>
          <label className="block space-y-1.5"><span className="text-sm text-rc-muted">Waiting message in English</span><textarea className="min-h-20 w-full border border-rc-line bg-rc-surface px-3 py-2 text-sm" value={waitEn} onChange={(e) => setWaitEn(e.target.value)} dir="ltr" /></label>
          <Button type="submit" disabled={busy}>
            {t('common.save')}
          </Button>
        </form>
      </HudFrame>

      <HudFrame className="space-y-3 p-4">
        <SectionLabel index="DOC.02" title={t('registrationSettings.docTypes')} hint={t('registrationSettings.docHint')} />
        <form className="grid gap-3 md:grid-cols-2" onSubmit={(e) => void onAddDoc(e)}>
          <Input label={t('registrationSettings.labelFa')} required value={labelFa} onChange={(e) => setLabelFa(e.target.value)} />
          <Input label={t('registrationSettings.labelEn')} required value={labelEn} onChange={(e) => setLabelEn(e.target.value)} />
          <Input label={t('content.slug')} value={code} onChange={(e) => setCode(e.target.value)} dir="ltr" />
          <Select
            label={t('registrationSettings.accountType')}
            value={accountType}
            onChange={(e) => setAccountType(e.target.value as typeof accountType)}
          >
            <option value="both">{t('registrationSettings.both')}</option>
            <option value="individual">{t('registrationSettings.individual')}</option>
            <option value="legal">{t('registrationSettings.legal')}</option>
          </Select>
          <Button type="submit" disabled={busy}>
            {t('common.save')}
          </Button>
        </form>
        <ul className="mt-4 divide-y divide-rc-line">
          {docs.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
              <div>
                <p className="font-medium">
                  {d.label_fa} / {d.label_en}
                </p>
                <p className="font-mono text-[10px] text-rc-muted">
                  {d.code} · {d.account_type} · {d.is_required ? 'required' : 'optional'}
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  void upsertRegistrationDocType({ ...d, is_active: !d.is_active })
                    .then(reload)
                    .then(() => toast.success(t('common.saved')))
                }
              >
                {d.is_active ? t('common.delete') : t('content.statusPublished')}
              </Button>
            </li>
          ))}
        </ul>
      </HudFrame>
    </PanelPage>
  )
}
