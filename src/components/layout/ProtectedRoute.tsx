import type { ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/hooks/useAuth'
import type { UserRole } from '@/types/database'
import { useEffect, useState } from 'react'
import { backend } from '@/lib/backend'

interface ProtectedRouteProps {
  children?: ReactNode
  roles?: UserRole[]
  permission?: string
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

export function ProtectedRoute({ children, roles, permission }: ProtectedRouteProps) {
  const { user, profile, loading, profileLoading } = useAuth()
  const location = useLocation()
  const [permissionAllowed, setPermissionAllowed] = useState<boolean | null>(permission ? null : true)

  useEffect(() => {
    if (!permission) { setPermissionAllowed(true); return }
    if (!profile) { setPermissionAllowed(null); return }
    if (profile.role === 'super_admin') { setPermissionAllowed(true); return }
    const roleKey = profile.role === 'league_admin' ? 'judge' : profile.staff_department ?? 'operations'
    setPermissionAllowed(null)
    const keys = permission.split('|')
    void backend.from('role_section_permissions').select('section_key').eq('role_key', roleKey).in('section_key', keys).eq('is_enabled', true).limit(1).then(({ data, error }) => setPermissionAllowed(!error && Boolean(data?.length)))
  }, [permission, profile])

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

  if (permission && permissionAllowed === null) return <div className="flex min-h-[40vh] items-center justify-center text-sm text-rc-muted">در حال بررسی دسترسی…</div>
  if (permission && permissionAllowed === false) return <Navigate to="/dashboard" replace />

  return children ? <>{children}</> : <Outlet />
}
