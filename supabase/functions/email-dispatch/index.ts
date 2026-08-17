// Deno Edge Function: dispatch pending email notifications (Resend)
// Secrets: SUPABASE_*, RESEND_API_KEY, EMAIL_FROM, EMAIL_MOCK

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type NotificationRow = {
  id: string
  template_key: string
  status: string
  idempotency_key: string
  email: string | null
  phone: string | null
  meta: Record<string, unknown> | null
}

const SUBJECTS: Record<string, { en: string; fa: string }> = {
  account_approved: {
    fa: 'حساب شما فعال شد — RoboCup Tabarestan',
    en: 'Your account is active — RoboCup Tabarestan',
  },
  league_joined: {
    fa: 'ثبت‌نام در لیگ تأیید شد',
    en: 'League registration confirmed',
  },
  results_published: {
    fa: 'نتایج مسابقه منتشر شد',
    en: 'Competition results published',
  },
  incomplete_profile: {
    fa: 'پروفایل ناقص است',
    en: 'Complete your profile',
  },
  account_issue: {
    fa: 'مشکل حساب کاربری',
    en: 'Account issue notice',
  },
}

function renderBody(templateKey: string, meta: Record<string, unknown> | null): string {
  const name = String(meta?.full_name ?? meta?.name ?? '')
  const lines: string[] = []
  switch (templateKey) {
    case 'account_approved':
      lines.push(
        name ? `Hello ${name},` : 'Hello,',
        '',
        'Your RoboCup Tabarestan account has been approved and is now active.',
        'You can sign in and continue registration from the dashboard.',
        '',
        'حساب شما در روبوکاپ تبرستان فعال شد. می‌توانید وارد پنل شوید.',
      )
      break
    default:
      lines.push(
        `RoboCup Tabarestan notification: ${templateKey}`,
        '',
        meta
          ? Object.entries(meta)
              .map(([k, v]) => `${k}: ${String(v)}`)
              .join('\n')
          : '',
      )
  }
  return lines.filter(Boolean).join('\n')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
    const limit = Number(body.limit ?? 50)
    const mockEnv = (Deno.env.get('EMAIL_MOCK') ?? 'true').toLowerCase() === 'true'
    const apiKey = Deno.env.get('RESEND_API_KEY') ?? ''
    const from = Deno.env.get('EMAIL_FROM') ?? 'RoboCup Tabarestan <onboarding@resend.dev>'
    const mock = mockEnv || !apiKey

    const { data, error } = await supabase.rpc('list_pending_notifications', {
      p_limit: limit,
      p_channel: 'email',
    })
    if (error) throw error

    const pending = (data ?? []) as NotificationRow[]
    const results: Array<Record<string, unknown>> = []

    for (const row of pending) {
      const { data: claimed, error: claimError } = await supabase.rpc('claim_notification_for_send', {
        p_idempotency_key: row.idempotency_key,
      })
      if (claimError) {
        results.push({ idempotency_key: row.idempotency_key, error: claimError.message })
        continue
      }

      const claimedRow = claimed as NotificationRow | null
      if (!claimedRow || claimedRow.status !== 'sending') {
        results.push({
          idempotency_key: row.idempotency_key,
          skipped: true,
          reason: claimedRow?.status ?? 'missing',
        })
        continue
      }

      const email =
        claimedRow.email ??
        (claimedRow.meta && typeof claimedRow.meta.email === 'string' ? claimedRow.meta.email : null)

      if (!email || !email.includes('@')) {
        await supabase.rpc('finalize_notification', {
          p_idempotency_key: claimedRow.idempotency_key,
          p_success: false,
          p_error_message: 'missing_email',
        })
        results.push({ idempotency_key: claimedRow.idempotency_key, success: false, error: 'missing_email' })
        continue
      }

      const subject =
        SUBJECTS[claimedRow.template_key]?.en ?? `RoboCup Tabarestan · ${claimedRow.template_key}`
      const text = renderBody(claimedRow.template_key, claimedRow.meta)

      let success = true
      let providerMessageId: string | undefined
      let errMsg: string | undefined

      if (mock) {
        providerMessageId = `MOCK-email-${claimedRow.template_key}-${Date.now()}`
      } else {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from,
            to: [email],
            subject,
            text,
          }),
        })
        const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string }
        if (!res.ok) {
          success = false
          errMsg = json.message ?? `HTTP ${res.status}`
        } else {
          providerMessageId = json.id
        }
      }

      await supabase.rpc('finalize_notification', {
        p_idempotency_key: claimedRow.idempotency_key,
        p_success: success,
        p_provider_message_id: providerMessageId ?? null,
        p_error_message: errMsg ?? null,
      })

      results.push({
        idempotency_key: claimedRow.idempotency_key,
        success,
        mock,
        providerMessageId,
        error: errMsg,
      })
    }

    return new Response(JSON.stringify({ processed: results.length, mock, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
