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
const SETTINGS_CACHE_KEY = 'tabarestan-site-settings-v1'

function readCachedSettings(): SiteSettings | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(SETTINGS_CACHE_KEY)
    return raw ? normalizeSiteBrand(JSON.parse(raw) as SiteSettings) : null
  } catch {
    return null
  }
}

export function SiteSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<SiteSettings | null>(() => readCachedSettings())
  const [loading, setLoading] = useState(() => !readCachedSettings())

  const refresh = useCallback(async () => {
    try {
      const s = normalizeSiteBrand(await fetchSiteSettings())
      setSettings(s)
      applySiteBrandColors(s)
      try { window.localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(s)) } catch { /* storage may be unavailable */ }
    } catch {
      /* table may not exist yet before migrate */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (settings) applySiteBrandColors(settings)
    void refresh()
    // Cached settings render header/footer immediately; refresh runs in background.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
