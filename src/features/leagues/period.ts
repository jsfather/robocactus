import type { League, LeaguePeriod } from '@/types/database'

export function computeLeaguePeriod(
  league: League,
  registeredCount = 0,
  now = new Date(),
): LeaguePeriod {
  if (league.registration_cycle_status === 'closed' || league.registration_cycle_status === 'archived') return 'ended'
  if (league.registration_cycle_status === 'draft') return 'upcoming'
  const override = league.period_override
  if (
    override === 'upcoming' ||
    override === 'open' ||
    override === 'ongoing' ||
    override === 'ended' ||
    override === 'full'
  ) {
    return override
  }

  const ends = league.event_ends_at ? new Date(league.event_ends_at) : null
  const starts = league.event_starts_at ? new Date(league.event_starts_at) : null
  const regOpen = league.registration_open_at ? new Date(league.registration_open_at) : null
  const regClose = league.registration_close_at ? new Date(league.registration_close_at) : null

  if (ends && ends.getTime() < now.getTime()) return 'ended'
  if (starts && starts.getTime() <= now.getTime()) return 'ongoing'

  if (league.capacity != null && registeredCount >= league.capacity) return 'full'

  const afterOpen = !regOpen || regOpen.getTime() <= now.getTime()
  const beforeClose = !regClose || regClose.getTime() >= now.getTime()
  if (league.is_active && afterOpen && beforeClose) return 'open'

  return 'upcoming'
}

export function periodBadgeClass(period: LeaguePeriod): string {
  switch (period) {
    case 'open':
      return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
    case 'ongoing':
      return 'border-rc-blue/40 bg-rc-blue/10 text-rc-blue'
    case 'full':
      return 'border-red-500/40 bg-red-500/10 text-red-400'
    case 'ended':
      return 'border-rc-line bg-rc-surface text-rc-muted'
    default:
      return 'border-amber-500/40 bg-amber-500/10 text-amber-500'
  }
}
