import { useTranslation } from 'react-i18next'

export function RolePanelPlaceholder({ titleKey }: { titleKey: string }) {
  const { t } = useTranslation()

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-2 text-3xl font-semibold">{t(titleKey)}</h1>
      <p className="text-rc-muted">{t('dashboard.comingSoon')}</p>
    </div>
  )
}
