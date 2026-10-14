import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/hooks/useAuth'
import { useSiteSettings } from '@/hooks/useSiteSettings'
import { backend } from '@/lib/backend'
import { Button } from '@/components/ui/FormControls'

export function ParticipantGuidance() {
  const { user, profile } = useAuth()
  const { settings } = useSiteSettings()
  const { i18n } = useTranslation()
  const navigate = useNavigate()
  const [notice, setNotice] = useState<'profile' | 'organization' | null>(null)
  const inFlight = useRef(false)
  const activeUserId = useRef(user?.id)
  activeUserId.current = user?.id
  const dialog = useRef<HTMLDialogElement>(null)
  const isEn = i18n.language.startsWith('en')
  const copy = notice ? settings?.onboarding_guidance?.[notice] : null
  const eligible = Boolean(user && profile?.id === user.id && profile.identity_completed_at && ['team_captain', 'company_admin'].includes(profile.role))

  useEffect(() => {
    if (!eligible || !settings?.onboarding_guidance || inFlight.current || notice) return
    inFlight.current = true
    const actorId = user!.id
    void backend.auth.claimOnboardingNotice().then(({ data, error }) => {
      if (!error && data.notice && actorId === activeUserId.current) setNotice(data.notice)
    }).catch(() => undefined).finally(() => { inFlight.current = false })
  }, [eligible, profile, settings?.onboarding_guidance, user?.id, notice])

  useEffect(() => {
    const element = dialog.current
    if (!notice || !copy?.enabled || !eligible || !element) return
    element.showModal()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { element.close(); document.body.style.overflow = previousOverflow }
  }, [notice, copy?.enabled, eligible])

  if (!eligible || !copy?.enabled) return null
  const go = (path: string) => { setNotice(null); navigate(path) }
  return createPortal(<dialog ref={dialog} onCancel={() => setNotice(null)} aria-labelledby="onboarding-title" aria-describedby="onboarding-body" className="m-auto max-h-[85svh] w-[calc(100vw_-_2rem)] max-w-lg overflow-y-auto rounded-3xl border-0 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/65 backdrop:backdrop-blur-sm" dir={isEn ? 'ltr' : 'rtl'}>
    <div className="relative bg-gradient-to-br from-emerald-50 via-white to-sky-50 px-5 pb-6 pt-8 text-center sm:px-8 sm:pb-8">
      <button type="button" autoFocus onClick={() => setNotice(null)} aria-label={isEn ? 'Close' : 'بستن'} className="absolute end-2 top-2 grid size-11 place-items-center rounded-full text-slate-500 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-sky-600"><svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" /></svg></button>
      <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/20"><svg viewBox="0 0 24 24" className="size-9" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg></span>
      <h2 id="onboarding-title" className="mt-5 text-2xl font-black text-slate-900">{isEn ? copy.title_en : copy.title_fa}</h2>
      <p id="onboarding-body" className="mt-4 whitespace-pre-wrap text-sm leading-8 text-slate-700">{isEn ? copy.body_en : copy.body_fa}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {notice === 'organization' ? <Button type="button" onClick={() => go('/company/competitions')}>{isEn ? 'Explore leagues' : 'مشاهده لیگ‌ها'}</Button> : null}
        <Button type="button" variant={notice === 'organization' ? 'secondary' : 'primary'} onClick={() => go(notice === 'profile' ? '/company?setup=organization' : '/company')}>{isEn ? 'Dashboard' : 'داشبورد'}</Button>
      </div>
    </div>
  </dialog>, document.body)
}
