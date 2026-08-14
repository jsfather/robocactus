import { supabase } from '@/lib/supabase'
import type { SiteNavItem, SiteSettings } from '@/types/database'

export async function fetchSiteSettings(): Promise<SiteSettings | null> {
  const { data, error } = await supabase.from('site_settings').select('*').eq('id', 1).maybeSingle()
  if (error) throw new Error(error.message)
  return data as SiteSettings | null
}

export async function updateSiteSettings(
  patch: Partial<Omit<SiteSettings, 'id' | 'updated_at'>>,
): Promise<SiteSettings> {
  const { data, error } = await supabase
    .from('site_settings')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', 1)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data as SiteSettings
}

export function applySiteBrandColors(settings: SiteSettings | null | undefined) {
  if (!settings) return
  const root = document.documentElement
  if (settings.color_primary) root.style.setProperty('--rc-blue', settings.color_primary)
  if (settings.color_accent) {
    root.style.setProperty('--rc-accent', settings.color_accent)
    root.style.setProperty('--rc-orange', settings.color_accent)
  }
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
