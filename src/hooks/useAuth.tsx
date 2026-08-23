import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { BackendSession as Session, BackendUser as User } from '@/lib/backend'
import { isBackendConfigured, backend } from '@/lib/backend'
import {
  completeSmsOtpSession,
  requestSmsOtp,
  verifySmsOtp,
} from '@/features/auth/smsOtp'
import type { Profile } from '@/types/database'

interface SignUpInput {
  email: string
  password: string
  fullName: string
  phone?: string
  authChannel?: 'phone' | 'email'
}

interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: Profile | null
  loading: boolean
  profileLoading: boolean
  profileError: string | null
  configured: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (input: SignUpInput) => Promise<{ error: string | null; needsEmailConfirm?: boolean }>
  requestPhoneOtp: (phone: string) => Promise<{
    error: string | null
    devCode?: string
    retryAfterSec?: number
  }>
  verifyPhoneOtp: (input: {
    phone: string
    code: string
    fullName?: string
  }) => Promise<{ error: string | null }>
  requestEmailMagicLink: (email: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const SIGNUP_DRAFT_KEY = 'rc_signup_draft'

export function saveSignupDraft(draft: Record<string, unknown>) {
  try {
    sessionStorage.setItem(SIGNUP_DRAFT_KEY, JSON.stringify(draft))
  } catch {
    /* ignore */
  }
}

export function loadSignupDraft<T extends Record<string, unknown>>(): T | null {
  try {
    const raw = sessionStorage.getItem(SIGNUP_DRAFT_KEY)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function clearSignupDraft() {
  try {
    sessionStorage.removeItem(SIGNUP_DRAFT_KEY)
  } catch {
    /* ignore */
  }
}

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await backend
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    console.error('[auth] profile fetch failed', error.message)
    throw new Error(error.message)
  }

  return data
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isBackendConfigured()
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)

  const loadProfile = useCallback(async (userId: string, opts?: { replaceOnFail?: boolean }) => {
    setProfileLoading(true)
    setProfileError(null)
    try {
      const next = await fetchProfile(userId)
      setProfile(next)
      if (!next) setProfileError('profile_missing')
      return next
    } catch (err) {
      const message = err instanceof Error ? err.message : 'profile_failed'
      setProfileError(message)
      // Keep the last good profile so a transient Failed to fetch does not kick the user out.
      if (opts?.replaceOnFail) setProfile(null)
      return null
    } finally {
      setProfileLoading(false)
    }
  }, [])

  const refreshProfile = useCallback(async () => {
    const userId = (await backend.auth.getUser()).data.user?.id
    if (!userId) {
      setProfile(null)
      setProfileError(null)
      return
    }
    await loadProfile(userId)
  }, [loadProfile])

  useEffect(() => {
    if (!configured) {
      setLoading(false)
      return
    }

    let mounted = true

    void backend.auth
      .getSession()
      .then(async ({ data }) => {
        if (!mounted) return
        setSession(data.session)
        if (data.session?.user) {
          await loadProfile(data.session.user.id)
        }
      })
      .catch((err: unknown) => {
        console.error('[auth] getSession failed', err)
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })

    const {
      data: { subscription },
    } = backend.auth.onAuthStateChange((event, nextSession) => {
      // Defer follow-up requests until the authentication state update has settled.
      window.setTimeout(() => {
        if (!mounted) return
        setSession(nextSession)

        if (event === 'SIGNED_OUT') {
          setProfile(null)
          setProfileError(null)
          return
        }

        if (nextSession?.user) {
          void loadProfile(nextSession.user.id)
        }
      }, 0)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [configured, loadProfile])

  const signIn = useCallback(async (email: string, password: string) => {
    if (!configured) {
      return { error: 'backend_missing' }
    }

    const { error } = await backend.auth.signInWithPassword({ email, password })
    if (error) return { error: error.message }
    await refreshProfile()
    return { error: null }
  }, [configured, refreshProfile])


  const signUp = useCallback(
    async ({ email, password, fullName, phone, authChannel = 'email' }: SignUpInput) => {
      if (!configured) {
        return { error: 'backend_missing' }
      }

      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent('/signup?resume=docs')}`

      const { data, error } = await backend.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectTo,
          data: {
            full_name: fullName,
            phone: phone ?? '',
            auth_channel: authChannel,
          },
        },
      })

      if (error) return { error: error.message }

      const needsEmailConfirm = !data.session
      if (data.session?.user) {
        await backend
          .from('profiles')
          .update({
            email: email.trim().toLowerCase(),
            auth_channel: authChannel,
            full_name: fullName.trim(),
            email_verified_at: new Date().toISOString(),
          })
          .eq('id', data.session.user.id)
        await refreshProfile()
      }

      return { error: null, needsEmailConfirm }
    },
    [configured, refreshProfile],
  )

  const requestPhoneOtp = useCallback(async (phone: string) => {
    if (!configured) return { error: 'backend_missing' }
    const result = await requestSmsOtp(phone)
    if (!result.ok) {
      return {
        error: result.error,
        retryAfterSec: result.retry_after_sec,
      }
    }
    return { error: null, devCode: result.dev_code }
  }, [configured])

  const verifyPhoneOtp = useCallback(
    async (input: { phone: string; code: string; fullName?: string }) => {
      if (!configured) return { error: 'backend_missing' }
      const verified = await verifySmsOtp(input)
      if (!verified.ok) return { error: verified.error }
      const sessionResult = await completeSmsOtpSession(verified.token_hash)
      if (sessionResult.error) return { error: sessionResult.error }
      await refreshProfile()
      return { error: null }
    },
    [configured, refreshProfile],
  )

  const requestEmailMagicLink = useCallback(
    async (email: string) => {
      if (!configured) return { error: 'backend_missing' }
      const { error } = await backend.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent('/dashboard')}`,
          shouldCreateUser: false,
        },
      })
      if (error) return { error: error.message }
      return { error: null }
    },
    [configured],
  )

  const signOut = useCallback(async () => {
    await backend.auth.signOut()
    setProfile(null)
    setProfileError(null)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      loading,
      profileLoading,
      profileError,
      configured,
      signIn,
      signUp,
      requestPhoneOtp,
      verifyPhoneOtp,
      requestEmailMagicLink,
      signOut,
      refreshProfile,
    }),
    [
      session,
      profile,
      loading,
      profileLoading,
      profileError,
      configured,
      signIn,
      signUp,
      requestPhoneOtp,
      verifyPhoneOtp,
      requestEmailMagicLink,
      signOut,
      refreshProfile,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return ctx
}
