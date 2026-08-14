import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getPublicEnv } from '@/lib/env'

const supabaseUrl = getPublicEnv('VITE_SUPABASE_URL')?.trim()
const supabaseAnonKey = getPublicEnv('VITE_SUPABASE_ANON_KEY')?.trim()

/** Accept classic JWT anon keys and newer sb_publishable_ keys. */
function isPublicAnonKey(key: string | undefined): boolean {
  if (!key) return false
  if (key === 'your-anon-key') return false
  // Never allow service_role / secret keys in the browser bundle
  if (key.includes('service_role') || key.startsWith('sb_secret_')) return false
  try {
    if (key.startsWith('eyJ')) {
      const payload = JSON.parse(atob(key.split('.')[1] ?? '')) as { role?: string }
      if (payload.role === 'service_role') return false
      return payload.role === 'anon' || !payload.role
    }
  } catch {
    return false
  }
  return key.startsWith('sb_publishable_')
}

const configured = Boolean(
  supabaseUrl && isPublicAnonKey(supabaseAnonKey) && !supabaseUrl.includes('your-project'),
)

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[RoboCactus] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Use Dashboard → Settings → API → anon / publishable key.',
  )
} else if (!isPublicAnonKey(supabaseAnonKey)) {
  console.error(
    '[RoboCactus] Refusing unsafe/invalid browser key. Use the anon or sb_publishable_ key — never service_role / sb_secret_.',
  )
}

/**
 * Safe client: never crash the whole app if env is missing/wrong.
 * Untyped — domain types applied at the feature/API layer.
 */
export const supabase: SupabaseClient = configured
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
    })
  : createClient(
      'https://placeholder.supabase.co',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.placeholder',
    )

export function isSupabaseConfigured(): boolean {
  return configured
}
