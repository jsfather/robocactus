import { backend } from '@/lib/backend'
import type { NotificationLog } from '@/types/database'

export async function fetchNotificationLogs(limit = 100): Promise<NotificationLog[]> {
  const { data, error } = await backend
    .from('notification_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return (data ?? []) as NotificationLog[]
}

/** Fire-and-forget: process pending SMS via Edge Function (mock-safe). */
export async function dispatchPendingSms(limit = 50): Promise<{ processed?: number; error?: string }> {
  try {
    const res = await fetch('/api/notifications/sms/dispatch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ limit }),
    })
    const json = (await res.json().catch(() => ({}))) as {
      processed?: number
      error?: string
    }
    if (!res.ok) return { error: json.error ?? `HTTP ${res.status}` }
    return { processed: json.processed ?? 0 }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'dispatch_failed' }
  }
}

/** Process pending email notifications via Edge Function (Resend / mock). */
export async function dispatchPendingEmail(
  limit = 50,
): Promise<{ processed?: number; error?: string }> {
  try {
    const res = await fetch('/api/notifications/email/dispatch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ limit }),
    })
    const json = (await res.json().catch(() => ({}))) as {
      processed?: number
      error?: string
    }
    if (!res.ok) return { error: json.error ?? `HTTP ${res.status}` }
    return { processed: json.processed ?? 0 }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'dispatch_failed' }
  }
}

export type SmsSettings = {
  id: number
  mock_mode: boolean
  originator: string | null
  api_key_hint: string | null
  pattern_codes: Record<string, string>
  enable_account_approved: boolean
  enable_league_joined: boolean
  enable_results: boolean
  enable_incomplete_profile: boolean
  enable_account_issue: boolean
  provider?: 'ippanel' | 'kavenegar'
  kavenegar_sender?: string | null
  kavenegar_api_key_hint?: string | null
  updated_at: string
}

export type SystemNotification = {
  id: string
  title: string
  body: string
  audience: 'all' | 'role' | 'user'
  target_role: string | null
  target_user_id: string | null
  created_by: string | null
  created_at: string
}

export type RegistrationDocType = {
  id: string
  code: string
  label_fa: string
  label_en: string
  account_type: 'individual' | 'legal' | 'both'
  is_required: boolean
  is_active: boolean
  sort_order: number
}

export async function fetchSmsSettings(): Promise<SmsSettings | null> {
  const { data, error } = await backend.from('sms_settings').select('*').eq('id', 1).maybeSingle()
  if (error) throw new Error(error.message)
  return data as SmsSettings | null
}

export async function updateSmsSettings(
  patch: Partial<Omit<SmsSettings, 'id' | 'updated_at'>>,
): Promise<SmsSettings> {
  const { data, error } = await backend
    .from('sms_settings')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', 1)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data as SmsSettings
}

export async function enqueueBroadcastSms(input: {
  templateKey: string
  audience: 'all' | 'role' | 'user'
  targetRole?: string | null
  targetUserId?: string | null
  bodyHint?: string | null
}): Promise<number> {
  const { data, error } = await backend.rpc('enqueue_broadcast_sms', {
    p_template_key: input.templateKey,
    p_audience: input.audience,
    p_target_role: input.targetRole ?? null,
    p_target_user_id: input.targetUserId ?? null,
    p_body_hint: input.bodyHint ?? null,
  })
  if (error) throw new Error(error.message)
  return Number(data ?? 0)
}

export async function createSystemNotification(input: {
  title: string
  body: string
  audience: 'all' | 'role' | 'user'
  targetRole?: string | null
  targetUserId?: string | null
}): Promise<SystemNotification> {
  const { data: user } = await backend.auth.getUser()
  const { data, error } = await backend
    .from('system_notifications')
    .insert({
      title: input.title.trim(),
      body: input.body.trim(),
      audience: input.audience,
      target_role: input.targetRole ?? null,
      target_user_id: input.targetUserId ?? null,
      created_by: user.user?.id ?? null,
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data as SystemNotification
}

export async function fetchMySystemNotifications(): Promise<SystemNotification[]> {
  const { data, error } = await backend
    .from('system_notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw new Error(error.message)
  return (data ?? []) as SystemNotification[]
}

export async function activateUserAccount(userId: string): Promise<void> {
  const { error } = await backend.rpc('activate_user_account', { p_user_id: userId })
  if (error) throw new Error(error.message)
  void dispatchPendingSms()
}

export async function enqueueIncompleteProfileSms(userId: string): Promise<void> {
  const { error } = await backend.rpc('enqueue_incomplete_profile_sms', { p_user_id: userId })
  if (error) throw new Error(error.message)
  void dispatchPendingSms()
}

export async function markSystemNotificationRead(notificationId: string): Promise<void> {
  const { data: user } = await backend.auth.getUser()
  if (!user.user) return
  const { error } = await backend.from('system_notification_reads').upsert({
    notification_id: notificationId,
    user_id: user.user.id,
    read_at: new Date().toISOString(),
  })
  if (error) throw new Error(error.message)
}

export async function fetchUnreadSystemNotificationCount(): Promise<number> {
  const { data: user } = await backend.auth.getUser()
  if (!user.user) return 0
  const notes = await fetchMySystemNotifications()
  if (!notes.length) return 0
  const { data: reads } = await backend
    .from('system_notification_reads')
    .select('notification_id')
    .eq('user_id', user.user.id)
  const readSet = new Set((reads ?? []).map((r: { notification_id: string }) => r.notification_id))
  return notes.filter((n) => !readSet.has(n.id)).length
}

export async function fetchRegistrationDocTypes(
  accountType?: 'individual' | 'legal',
): Promise<RegistrationDocType[]> {
  let query = backend
    .from('registration_doc_types')
    .select('*')
    .eq('is_active', true)
    .order('sort_order')
  const { data, error } = await query
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as RegistrationDocType[]
  if (!accountType) return rows
  return rows.filter((r) => r.account_type === 'both' || r.account_type === accountType)
}

export async function fetchAllRegistrationDocTypes(): Promise<RegistrationDocType[]> {
  const { data, error } = await backend
    .from('registration_doc_types')
    .select('*')
    .order('sort_order')
  if (error) throw new Error(error.message)
  return (data ?? []) as RegistrationDocType[]
}

export async function upsertRegistrationDocType(
  input: Partial<RegistrationDocType> & { label_fa: string; label_en: string; code: string },
): Promise<RegistrationDocType> {
  if (input.id) {
    const { data, error } = await backend
      .from('registration_doc_types')
      .update({
        code: input.code,
        label_fa: input.label_fa,
        label_en: input.label_en,
        account_type: input.account_type ?? 'both',
        is_required: input.is_required ?? true,
        is_active: input.is_active ?? true,
        sort_order: input.sort_order ?? 0,
      })
      .eq('id', input.id)
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    return data as RegistrationDocType
  }
  const { data, error } = await backend
    .from('registration_doc_types')
    .insert({
      code: input.code,
      label_fa: input.label_fa,
      label_en: input.label_en,
      account_type: input.account_type ?? 'both',
      is_required: input.is_required ?? true,
      is_active: input.is_active ?? true,
      sort_order: input.sort_order ?? 0,
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data as RegistrationDocType
}

export async function createAccountIssue(input: {
  userId: string
  title: string
  body?: string
}): Promise<void> {
  const { data: user } = await backend.auth.getUser()
  const { error } = await backend.from('account_issues').insert({
    user_id: input.userId,
    title: input.title.trim(),
    body: input.body ?? null,
    created_by: user.user?.id ?? null,
  })
  if (error) throw new Error(error.message)

  const { data: profile } = await backend
    .from('profiles')
    .select('phone')
    .eq('id', input.userId)
    .maybeSingle()
  if (profile?.phone) {
    const settings = await fetchSmsSettings().catch(() => null)
    if (settings?.enable_account_issue !== false) {
      await backend.from('notification_log').insert({
        channel: 'sms',
        template_key: 'account_issue',
        phone: profile.phone,
        status: 'pending',
        idempotency_key: `account_issue:${input.userId}:${Date.now()}`,
        meta: { title: input.title },
      })
      void dispatchPendingSms()
    }
  }
}
