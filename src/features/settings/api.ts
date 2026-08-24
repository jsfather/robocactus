import { backend } from '@/lib/backend'
import type { SiteNavItem, SiteSettings } from '@/types/database'

const LEGACY_BRAND_PATTERN = /روبو\s*کاپ\s*کاکتوس|روبو\s*کاکتوس|Robo\s*(?:Cup\s*)?Cactus/gi

function replaceLegacyBrand(value: string | null | undefined, replacement: string) {
  return value ? value.replace(LEGACY_BRAND_PATTERN, replacement) : null
}

/** Prevent stale CMS values from restoring the retired brand after hydration. */
export function normalizeSiteBrand(settings: SiteSettings | null): SiteSettings | null {
  if (!settings) return null
  return {
    ...settings,
    site_name_fa: 'روبوکاپ تبرستان',
    site_name_en: 'RoboCup Tabarestan',
    tagline_fa: replaceLegacyBrand(settings.tagline_fa, 'روبوکاپ تبرستان') || 'برگزارکننده مسابقات ملی و بین‌المللی رباتیک',
    tagline_en: replaceLegacyBrand(settings.tagline_en, 'RoboCup Tabarestan') || 'Organizer of national and international robotics competitions',
    footer_fa: replaceLegacyBrand(settings.footer_fa, 'روبوکاپ تبرستان'),
    footer_en: replaceLegacyBrand(settings.footer_en, 'RoboCup Tabarestan'),
    copyright_fa: replaceLegacyBrand(settings.copyright_fa, 'روبوکاپ تبرستان'),
    copyright_en: replaceLegacyBrand(settings.copyright_en, 'RoboCup Tabarestan'),
    color_primary: '#087eb8',
    color_accent: '#13a94d',
  }
}

export async function fetchSiteSettings(): Promise<SiteSettings | null> {
  const { data, error } = await backend.from('site_settings').select('*').eq('id', 1).maybeSingle()
  if (error) throw new Error(error.message)
  return data as SiteSettings | null
}

export async function updateSiteSettings(
  patch: Partial<Omit<SiteSettings, 'id' | 'updated_at'>>,
): Promise<SiteSettings> {
  const { data, error } = await backend
    .from('site_settings')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', 1)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data as SiteSettings
}

export function applySiteBrandColors(settings: SiteSettings | null | undefined) {
  const root = document.documentElement
  root.style.setProperty('--rc-blue', '#087eb8')
  root.style.setProperty('--rc-accent', '#13a94d')
  root.style.setProperty('--rc-orange', '#13a94d')
  if (!settings) return
  if (settings.favicon_url) {
    let link = document.querySelector<HTMLLinkElement>("link[rel='icon']")
    if (!link) {
      link = document.createElement('link')
      link.rel = 'icon'
      document.head.appendChild(link)
    }
    link.href = settings.favicon_url
  }
}

export function sortedNavItems(items: SiteNavItem[] | null | undefined): SiteNavItem[] {
  return [...(items ?? [])]
    .filter((x) => x.enabled !== false)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
}

/** Keep /live in public nav even if CMS list is outdated. */
export function ensureLiveResultsNavItem(
  items: SiteNavItem[],
  labels: { fa: string; en: string },
): SiteNavItem[] {
  const hasLive = items.some((x) => x.href === '/live' || x.href === '/live/')
  if (hasLive) return items

  const homeOrder = items.find((x) => x.href === '/' || x.href === '')?.order ?? 0
  const liveItem: SiteNavItem = {
    id: 'live-results',
    href: '/live',
    label_fa: labels.fa,
    label_en: labels.en,
    order: homeOrder + 0.5,
    enabled: true,
  }

  return sortedNavItems([...items, liveItem])
}
