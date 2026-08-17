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

type Ctx = {
  settings: SiteSettings | null
  loading: boolean
  refresh: () => Promise<void>
}

const SiteSettingsContext = createContext<Ctx | null>(null)

export function SiteSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<SiteSettings | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
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
