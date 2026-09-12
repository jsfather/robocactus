import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { applySiteBrandColors, fetchSiteSettings, normalizeSiteBrand } from '@/features/settings/api'
import type { SiteSettings } from '@/types/database'
import { backend } from '@/lib/backend'

type Ctx = {
  settings: SiteSettings | null
  loading: boolean
  refresh: () => Promise<void>
}

const SiteSettingsContext = createContext<Ctx | null>(null)

export function SiteSettingsProvider({ children }: { children: ReactNode }) {
  // CMS values are the source of truth. Do not hydrate the UI from a previous
  // localStorage snapshot: that made changed banners/copy flash briefly before
  // the fresh response arrived. Render only the latest response from the CMS.
  const [settings, setSettings] = useState<SiteSettings | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    setSettings(null)
    try {
      const s = normalizeSiteBrand(await fetchSiteSettings())
      setSettings(s)
      applySiteBrandColors(s)
    } catch {
      /* table may not exist yet before migrate */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const channel = backend.channel('site-settings-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'site_settings' }, () => { void refresh() })
      .subscribe()
    return () => { void backend.removeChannel(channel) }
  }, [refresh])

  const value = useMemo(() => ({ settings, loading, refresh }), [settings, loading, refresh])
  return <SiteSettingsContext.Provider value={value}>{children}</SiteSettingsContext.Provider>
}

export function useSiteSettings() {
  const ctx = useContext(SiteSettingsContext)
  if (!ctx) {
    return {
      settings: null,
      loading: false,
      refresh: async () => undefined,
    }
  }
  return ctx
}
