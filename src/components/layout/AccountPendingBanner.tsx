import { useTranslation } from 'react-i18next'
import { useAuth } from '@/hooks/useAuth'
import { useSiteSettings } from '@/hooks/useSiteSettings'
import { HudFrame } from '@/components/panel/HudKit'

/** Banner when account is waiting for admin SMS activation. */
export function AccountPendingBanner() {
  const { t, i18n } = useTranslation()
  const { profile } = useAuth()
  const { settings } = useSiteSettings()

  if (!profile || profile.account_status !== 'pending') return null

  const isEn = i18n.language.startsWith('en')
  const message =
    (isEn ? settings?.inactive_message_en : settings?.inactive_message_fa) ||
    t('auth.accountPendingDefault')
  const phone = settings?.support_phone || '—'

  return (
    <HudFrame className="mb-6 border-rc-accent/40 bg-rc-accent/5 p-4" glow>
      <p className="font-mono text-[10px] tracking-[0.22em] text-rc-accent uppercase">
        {t('auth.accountPending')}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-rc-text">{message}</p>
      <p className="mt-3 font-mono text-xs text-rc-muted" dir="ltr">
        {t('auth.supportPhone')}: {phone}
      </p>
    </HudFrame>
  )
}
