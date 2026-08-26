import { backend } from '@/lib/backend'
import type { BackendAuthOptions } from '@/lib/backend'

export type AccessSettings = BackendAuthOptions & {
  id: number
  email_provider: string
  email_from: string | null
  email_api_key: string | null
  sms_provider: 'ippanel' | 'kavenegar'
  ippanel_api_key: string | null
  ippanel_originator: string | null
  kavenegar_api_key: string | null
  sms_patterns: Record<string, string>
  zarinpal_merchant_id: string | null
  zarinpal_sandbox: boolean
  updated_at: string
}

export async function fetchAccessSettings(): Promise<AccessSettings> {
  const { data, error } = await backend.from('auth_settings').select('*').eq('id', 1).single()
  if (error) throw new Error(error.message)
  return data as AccessSettings
}

export async function updateAccessSettings(
  patch: Partial<Omit<AccessSettings, 'id' | 'updated_at'>>,
): Promise<AccessSettings> {
  const { data, error } = await backend
    .from('auth_settings')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', 1)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data as AccessSettings
}
