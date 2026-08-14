import { Outlet, useLocation } from 'react-router-dom'
import { PublicHeader } from './PublicHeader'
import { PublicFooter } from './PublicFooter'
import { BackToTopButton } from './BackToTopButton'
import { SupabaseStatusBanner } from './SupabaseStatusBanner'
import { LiveChatWidget } from '@/components/live-chat/LiveChatWidget'

export function PublicLayout() {
  const { pathname } = useLocation()
  // Homepage hero is full-bleed under the floating header; other pages need top offset.
  const isHome = pathname === '/'

  return (
    <div className="min-h-dvh bg-rc-bg text-rc-text">
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background: `radial-gradient(ellipse at top, var(--rc-glow-blue), transparent 55%), radial-gradient(ellipse at bottom, var(--rc-glow-orange), transparent 50%)`,
        }}
      />
      <div className="relative">
        <PublicHeader />
        <div className="pointer-events-none fixed inset-x-0 top-[4.75rem] z-50 px-3 sm:top-[5.25rem] sm:px-5">
          <div className="pointer-events-auto mx-auto max-w-6xl overflow-hidden rounded-xl">
            <SupabaseStatusBanner />
          </div>
        </div>
        <main className={isHome ? undefined : 'pt-[4.75rem] sm:pt-[5.25rem]'}>
          <Outlet />
        </main>
        <PublicFooter />
        <LiveChatWidget />
        <BackToTopButton />
      </div>
    </div>
  )
}
