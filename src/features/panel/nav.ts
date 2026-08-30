import type { UserRole } from '@/types/database'

export type PanelNavItem = {
  to: string
  labelKey: string
  /** i18n key for short help shown under the panel header */
  helpKey?: string
  end?: boolean
  badge?: 'tickets'
  permissionKey?: string
}

export type PanelNavGroup = {
  id: string
  titleKey: string
  matchPrefix: string
  items: PanelNavItem[]
}

/** Super-admin: grouped mission sections. */
export const SUPER_ADMIN_NAV_GROUPS: PanelNavGroup[] = [
  {
    id: 'ops',
    titleKey: 'panel.nav.ops',
    matchPrefix: '/super-admin',
    items: [
      { to: '/super-admin', labelKey: 'panel.nav.overview', end: true, helpKey: 'panel.help.sa.overview' },
      { to: '/super-admin/review', labelKey: 'judging.tabReview', helpKey: 'panel.help.sa.review' },
      { to: '/super-admin/tickets', labelKey: 'staff.tabTickets', badge: 'tickets', helpKey: 'panel.help.sa.tickets' },
      { to: '/super-admin/chat', labelKey: 'chat.inboxTitle', helpKey: 'panel.help.sa.chat' },
      { to: '/super-admin/triage', labelKey: 'staff.tabTriage', helpKey: 'panel.help.sa.triage' },
    ],
  },
  {
    id: 'registry',
    titleKey: 'panel.nav.registry',
    matchPrefix: '/super-admin',
    items: [
      { to: '/super-admin/leagues', labelKey: 'competitions.nav', helpKey: 'panel.help.sa.leagues' },
      { to: '/super-admin/participants', labelKey: 'participants.title', helpKey: 'participants.help' },
      { to: '/super-admin/incomplete-registrations', labelKey: 'registrationLifecycle.title', helpKey: 'registrationLifecycle.help' },
      { to: '/super-admin/companies', labelKey: 'admin.companies.title', helpKey: 'panel.help.sa.companies' },
      { to: '/super-admin/users', labelKey: 'admin.users.title', helpKey: 'panel.help.sa.users' },
      { to: '/super-admin/collaborators', labelKey: 'admin.collaborators.title', helpKey: 'admin.collaborators.help' },
    ],
  },
  {
    id: 'content',
    titleKey: 'panel.nav.content',
    matchPrefix: '/super-admin',
    items: [
      { to: '/super-admin/content', labelKey: 'content.cmsTitle', helpKey: 'panel.help.sa.content' },
      { to: '/super-admin/home', labelKey: 'home.adminTitle', helpKey: 'panel.help.sa.home' },
      { to: '/super-admin/contact-inbox', labelKey: 'home.inboxTab', helpKey: 'panel.help.sa.contactInbox' },
      { to: '/super-admin/pages', labelKey: 'admin.pages.title', helpKey: 'panel.help.sa.pages' },
    ],
  },
  {
    id: 'system',
    titleKey: 'panel.nav.system',
    matchPrefix: '/super-admin',
    items: [
      { to: '/super-admin/kavenegar', labelKey: 'kavenegar.title', helpKey: 'kavenegar.help' },
      { to: '/super-admin/registration', labelKey: 'registrationSettings.title', helpKey: 'panel.help.sa.registration' },
      { to: '/super-admin/finance', labelKey: 'finance.title', helpKey: 'panel.help.sa.finance' },
      { to: '/super-admin/analytics', labelKey: 'analytics.title', helpKey: 'panel.help.sa.analytics' },
      { to: '/super-admin/settings', labelKey: 'settings.title', helpKey: 'panel.help.sa.settings' },
      { to: '/super-admin/access', labelKey: 'accessSettings.title', helpKey: 'accessSettings.help' },
    ],
  },
]

export const LEAGUE_ADMIN_NAV: PanelNavGroup = {
  id: 'league_admin',
  titleKey: 'panel.nav.leagueAdmin',
  matchPrefix: '/league-admin',
  items: [
    { to: '/league-admin', labelKey: 'panel.nav.overview', end: true, helpKey: 'panel.help.la.overview' },
    { to: '/league-admin/review', labelKey: 'judging.tabReview', helpKey: 'panel.help.sa.review', permissionKey: 'team_review' },
    { to: '/league-admin/tickets', labelKey: 'judging.tabTickets', badge: 'tickets', helpKey: 'panel.help.sa.tickets', permissionKey: 'tickets' },
  ],
}

export const STAFF_NAV: PanelNavGroup = {
  id: 'staff',
  titleKey: 'panel.nav.staff',
  matchPrefix: '/staff',
  items: [
    { to: '/staff', labelKey: 'panel.nav.overview', end: true, helpKey: 'panel.help.staff.overview' },
    { to: '/staff/tickets', labelKey: 'staff.tabTickets', badge: 'tickets', helpKey: 'panel.help.sa.tickets', permissionKey: 'tickets' },
    { to: '/staff/chat', labelKey: 'chat.inboxTitle', helpKey: 'panel.help.sa.chat', permissionKey: 'chat' },
    { to: '/staff/triage', labelKey: 'staff.tabTriage', helpKey: 'panel.help.sa.triage', permissionKey: 'triage|account_activation' },
    { to: '/staff/finance', labelKey: 'finance.title', helpKey: 'panel.help.sa.finance', permissionKey: 'finance' },
  ],
}

export const COMPANY_NAV: PanelNavGroup = {
  id: 'company',
  titleKey: 'panel.nav.company',
  matchPrefix: '/company',
  items: [
    { to: '/company', labelKey: 'panel.nav.overview', end: true, helpKey: 'panel.help.company.overview' },
    { to: '/company/competitions', labelKey: 'competitions.nav', helpKey: 'panel.help.company.competitions' },
    { to: '/company/teams', labelKey: 'team.listTitle', helpKey: 'panel.help.company.teams' },
    { to: '/account/tickets', labelKey: 'staff.tabTickets', helpKey: 'panel.help.sa.tickets', badge: 'tickets' },
  ],
}

export const TEAM_NAV: PanelNavGroup = {
  id: 'team',
  titleKey: 'panel.nav.team',
  matchPrefix: '/team',
  items: [{ to: '/team', labelKey: 'panel.nav.overview', end: true, helpKey: 'panel.help.team.overview' }],
}

export const ACCOUNT_NAV: PanelNavGroup = {
  id: 'account', titleKey: 'panel.nav.account', matchPrefix: '/account',
  items: [
    { to: '/account/profile', labelKey: 'accountProfile.title', helpKey: 'accountProfile.help' },
    { to: '/account/invoices', labelKey: 'accountInvoices.title', helpKey: 'accountInvoices.help' },
  ],
}

const roleHome: Record<UserRole, string> = {
  super_admin: '/super-admin',
  league_admin: '/league-admin',
  staff: '/staff',
  company_admin: '/company',
  team_captain: '/company',
}

export function roleHomePath(role: UserRole): string {
  return roleHome[role]
}

export function canonicalizePanelPath(pathname: string, role: UserRole): string | null {
  if (role !== 'super_admin') return null
  if (pathname === '/staff' || pathname === '/staff/') return '/super-admin'
  if (pathname === '/staff/tickets') return '/super-admin/tickets'
  if (pathname === '/staff/chat') return '/super-admin/chat'
  if (pathname === '/staff/triage') return '/super-admin/triage'
  if (pathname === '/league-admin' || pathname === '/league-admin/') return '/super-admin'
  if (pathname === '/league-admin/review') return '/super-admin/review'
  if (pathname === '/league-admin/tickets') return '/super-admin/tickets'
  return null
}

export function panelsForRole(role: UserRole): PanelNavGroup[] {
  switch (role) {
    case 'super_admin':
      return [...SUPER_ADMIN_NAV_GROUPS, ACCOUNT_NAV]
    case 'league_admin':
      return [LEAGUE_ADMIN_NAV, ACCOUNT_NAV]
    case 'staff':
      return [STAFF_NAV, ACCOUNT_NAV]
    case 'company_admin':
      return [COMPANY_NAV, ACCOUNT_NAV]
    case 'team_captain':
      return [COMPANY_NAV, ACCOUNT_NAV]
    default:
      return []
  }
}

function itemMatches(pathname: string, item: PanelNavItem): boolean {
  if (item.end) return pathname === item.to || pathname === `${item.to}/`
  return pathname === item.to || pathname.startsWith(`${item.to}/`)
}

export function activePanelGroup(pathname: string, role: UserRole): PanelNavGroup | null {
  const groups = panelsForRole(role)
  const hit = groups.find((g) => g.items.some((item) => itemMatches(pathname, item)))
  return hit ?? groups[0] ?? null
}

export function activePanelItem(pathname: string, role: UserRole): PanelNavItem | null {
  const groups = panelsForRole(role)
  for (const g of groups) {
    const matches = g.items.filter((item) => itemMatches(pathname, item))
    if (matches.length) {
      return matches.sort((a, b) => b.to.length - a.to.length)[0] ?? null
    }
  }
  return null
}
