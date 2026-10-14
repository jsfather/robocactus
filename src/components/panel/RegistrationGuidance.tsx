import { useTranslation } from 'react-i18next'
import { useSiteSettings } from '@/hooks/useSiteSettings'

export function RegistrationGuidance({ kind }: { kind: 'company_form' | 'leagues' }) {
  const { settings } = useSiteSettings()
  const { i18n } = useTranslation()
  const copy = settings?.onboarding_guidance?.[kind]
  if (!copy?.enabled) return null
  const isEn = i18n.language.startsWith('en')
  return <aside className="mb-5 flex items-start gap-3 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-4 text-sky-950 sm:p-5">
    <svg viewBox="0 0 24 24" className="mt-0.5 size-6 shrink-0 text-sky-700" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v6m0-10v1" /></svg>
    <div className="min-w-0"><h2 className="font-black">{isEn ? copy.title_en : copy.title_fa}</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-7">{isEn ? copy.body_en : copy.body_fa}</p></div>
  </aside>
}
