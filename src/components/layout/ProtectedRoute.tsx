import type { ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/hooks/useAuth'
import type { UserRole } from '@/types/database'

interface ProtectedRouteProps {
  children?: ReactNode
  roles?: UserRole[]
}

function ProfileGate() {
  const { t } = useTranslation()
  const { profileError, profileLoading, refreshProfile } = useAuth()

  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="font-mono text-sm tracking-widest text-rc-muted uppercase">
        {profileLoading ? '…' : t('auth.profileLoadFailed')}
      </p>
      {profileError && !profileLoading ? (
        <p className="max-w-md break-words font-mono text-xs text-red-400">{profileError}</p>
      ) : null}
      {!profileLoading ? (
        <button
          type="button"
          className="rounded-lg border border-rc-line px-3 py-2 text-sm text-rc-blue hover:bg-rc-hover"
          onClick={() => void refreshProfile()}
        >
          {t('common.retry')}
        </button>
      ) : null}
    </div>
  )
}

export function ProtectedRoute({ children, roles }: ProtectedRouteProps) {
  const { user, profile, loading, profileLoading } = useAuth()
  const location = useLocation()

  if (loading || (user && !profile && profileLoading)) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center font-mono text-sm tracking-widest text-rc-muted uppercase">
        …
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  // Session exists but profile could not be loaded — do not bounce to login.
  if (roles && !profile) {
    return <ProfileGate />
  }

  if (roles && profile && !roles.includes(profile.role)) {
    return <Navigate to="/dashboard" replace />
  }

  return children ? <>{children}</> : <Outlet />
}
