import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { backend } from '@/lib/backend'
import { clearSignupDraft, loadSignupDraft, useAuth } from '@/hooks/useAuth'
import type { AccountType } from '@/types/database'
import { checkProfileDuplicates, duplicateFieldMessage, mapSignupError } from '@/features/auth/signupProgress'

type Draft = {
  accountType?: AccountType
  fullName?: string
  username?: string
  firstNameFa?: string
  lastNameFa?: string
  firstNameEn?: string
  lastNameEn?: string
  birthDate?: string
  postalCode?: string
  representativeNationalId?: string
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
          patch.username = draft.username?.trim().toLowerCase() || null
          patch.first_name_fa = draft.firstNameFa?.trim() || null
          patch.last_name_fa = draft.lastNameFa?.trim() || null
          patch.first_name_en = draft.firstNameEn?.trim() || null
          patch.last_name_en = draft.lastNameEn?.trim() || null
          patch.birth_date = draft.birthDate || null
          patch.postal_code = draft.postalCode?.trim() || null
          patch.legal_representative_national_id = draft.accountType === 'legal' ? draft.representativeNationalId?.trim() || null : null
          patch.identity_completed_at = null
          patch.signup_step = 'docs'
          if (draft.fullName?.trim()) patch.full_name = draft.fullName.trim()

          const duplicate = await checkProfileDuplicates(user.id, {
            email,
            nationalId: draft.accountType === 'individual' ? draft.nationalId : undefined,
            username: draft.username,
            accountType: draft.accountType,
          })
          if (duplicate) throw new Error(duplicateFieldMessage(duplicate, t))
        } else if (email) {
          patch.auth_channel = 'email'
        }

        const { error: profileUpdateError } = await backend.from('profiles').update(patch).eq('id', user.id)
        if (profileUpdateError) throw new Error(mapSignupError(profileUpdateError.message, t) ?? profileUpdateError.message)
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
          const message = err instanceof Error ? mapSignupError(err.message, t) ?? err.message : t('auth.emailVerifyFailed')
          setMessage(message)
          window.setTimeout(() => void navigate('/signup', { replace: true }), 2800)
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
