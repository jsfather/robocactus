import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { backend } from '@/lib/backend'
import { clearSignupDraft, loadSignupDraft, useAuth } from '@/hooks/useAuth'
import type { AccountType } from '@/types/database'

type Draft = {
  accountType?: AccountType
  fullName?: string
  nationalId?: string
  companyName?: string
  companyNationalId?: string
  economicCode?: string
  address?: string
  email?: string
  phone?: string
  authChannel?: 'phone' | 'email'
}

export function AuthCallbackPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { refreshProfile } = useAuth()
  const [message, setMessage] = useState(t('auth.verifyingEmail'))

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const code = params.get('code')
        if (code) {
          const { error } = await backend.auth.exchangeCodeForSession(code)
          if (error) throw error
        } else {
          const { data } = await backend.auth.getSession()
          if (!data.session) {
            // Allow hash fragment session hydration
            await new Promise((r) => window.setTimeout(r, 400))
            const again = await backend.auth.getSession()
            if (!again.data.session) throw new Error('no_session')
          }
        }

        const { data: userData } = await backend.auth.getUser()
        const user = userData.user
        if (!user) throw new Error('no_session')

        const draft = loadSignupDraft<Draft>()
        const email = (draft?.email ?? user.email ?? '').trim().toLowerCase()

        const patch: Record<string, unknown> = {
          email: email || null,
          email_verified_at: new Date().toISOString(),
        }

        if (draft) {
          patch.auth_channel = draft.authChannel ?? 'email'
          patch.account_type = draft.accountType
          patch.account_status = 'pending'
          patch.national_id = draft.accountType === 'individual' ? draft.nationalId ?? null : null
          patch.company_name = draft.accountType === 'legal' ? draft.companyName ?? null : null
          patch.company_national_id =
            draft.accountType === 'legal' ? draft.companyNationalId ?? null : null
          patch.economic_code =
            draft.accountType === 'legal' ? draft.economicCode || null : null
          patch.address = draft.address?.trim() || null
          if (draft.fullName?.trim()) patch.full_name = draft.fullName.trim()
        } else if (email) {
          patch.auth_channel = 'email'
        }

        await backend.from('profiles').update(patch).eq('id', user.id)
        await refreshProfile()
        clearSignupDraft()

        const next = params.get('next') || '/dashboard'
        if (!cancelled) {
          setMessage(t('auth.emailVerified'))
          void navigate(next, { replace: true })
        }
      } catch (err) {
        console.error(err)
        if (!cancelled) {
          setMessage(t('auth.emailVerifyFailed'))
          window.setTimeout(() => void navigate('/login', { replace: true }), 1800)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [navigate, params, refreshProfile, t])

  return (
    <div className="mx-auto flex min-h-[50vh] max-w-md flex-col justify-center px-4 py-16 text-center">
      <p className="font-mono text-[10px] tracking-[0.28em] text-rc-blue uppercase">AUTH</p>
      <h1 className="mt-2 text-2xl font-semibold">{message}</h1>
    </div>
  )
}
