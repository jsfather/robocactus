// Deno Edge Function: SMS OTP request + verify (IPPanel)
// Deploy: supabase functions deploy sms-otp
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, IPPANEL_*, IPPANEL_MOCK

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const OTP_TTL_MS = 5 * 60 * 1000
const RESEND_COOLDOWN_MS = 60 * 1000
const MAX_ATTEMPTS = 5

function normalizeIranPhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('09')) return digits
  if (digits.length === 12 && digits.startsWith('98')) return `0${digits.slice(2)}`
  if (digits.length === 10 && digits.startsWith('9')) return `0${digits}`
  return null
}

function phoneToEmail(phone: string): string {
  return `${phone.replace(/^0/, '98')}@phone.robocactus.local`
}

async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function randomOtp(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000
  return String(n).padStart(6, '0')
}

async function sendOtpSms(phone: string, code: string): Promise<{ ok: boolean; mock?: boolean; error?: string }> {
  const provider = (Deno.env.get('SMS_PROVIDER') ?? 'ippanel').toLowerCase()
  const mock =
    (Deno.env.get('SMS_MOCK') ?? Deno.env.get('IPPANEL_MOCK') ?? 'true').toLowerCase() === 'true'

  if (provider === 'kavenegar') {
    const apiKey = Deno.env.get('KAVENEGAR_API_KEY') ?? ''
    if (mock || !apiKey) {
      console.log(`[sms-otp] MOCK kavenegar code for ${phone}: ${code}`)
      return { ok: true, mock: true }
    }
    let patterns: Record<string, string> = {}
    try {
      patterns = JSON.parse(Deno.env.get('SMS_PATTERNS') ?? '{}') as Record<string, string>
    } catch {
      patterns = {}
    }
    const template = patterns.auth_otp ?? 'auth_otp'
    const qs = new URLSearchParams({ receptor: phone, template, token: code })
    const res = await fetch(`https://api.kavenegar.com/v1/${apiKey}/verify/lookup.json?${qs}`)
    const json = await res.json().catch(() => ({}))
    const status = json?.return?.status
    if (!res.ok || (status != null && status >= 400)) {
      return { ok: false, error: json?.return?.message ?? `HTTP ${res.status}` }
    }
    return { ok: true }
  }

  const apiKey = Deno.env.get('IPPANEL_API_KEY') ?? ''
  const originator = Deno.env.get('IPPANEL_ORIGINATOR') ?? ''
  if (mock || !apiKey) {
    console.log(`[sms-otp] MOCK ippanel code for ${phone}: ${code}`)
    return { ok: true, mock: true }
  }

  let patterns: Record<string, string> = {}
  try {
    patterns = JSON.parse(Deno.env.get('IPPANEL_PATTERNS') ?? Deno.env.get('SMS_PATTERNS') ?? '{}') as Record<
      string,
      string
    >
  } catch {
    patterns = {}
  }
  const patternCode = patterns.auth_otp ?? 'auth_otp'

  const res = await fetch('https://api2.ippanel.com/api/v1/sms/pattern/normal/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `AccessKey ${apiKey}`,
    },
    body: JSON.stringify({
      code: patternCode,
      sender: originator,
      recipient: phone,
      variable: { code },
    }),
  })
  const json = await res.json().catch(() => ({}))
  const ok = res.ok && json?.meta?.status !== false
  if (!ok) {
    return { ok: false, error: json?.meta?.message ?? json?.message ?? `HTTP ${res.status}` }
  }
  return { ok: true }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const body = await req.json().catch(() => ({}))
    const action = String(body.action ?? '')
    const phone = normalizeIranPhone(String(body.phone ?? ''))
    if (!phone) {
      return new Response(JSON.stringify({ error: 'invalid_phone' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'request') {
      const { data: recent } = await supabase
        .from('auth_otp_challenges')
        .select('created_at')
        .eq('phone', phone)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (recent?.created_at) {
        const age = Date.now() - new Date(recent.created_at).getTime()
        if (age < RESEND_COOLDOWN_MS) {
          return new Response(
            JSON.stringify({
              error: 'cooldown',
              retry_after_sec: Math.ceil((RESEND_COOLDOWN_MS - age) / 1000),
            }),
            { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          )
        }
      }

      const code = randomOtp()
      const codeHash = await sha256(`${phone}:${code}`)
      const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString()

      const { error: insertError } = await supabase.from('auth_otp_challenges').insert({
        phone,
        code_hash: codeHash,
        expires_at: expiresAt,
      })
      if (insertError) throw insertError

      const send = await sendOtpSms(phone, code)
      if (!send.ok) {
        return new Response(JSON.stringify({ error: send.error ?? 'sms_failed' }), {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const mock = (Deno.env.get('IPPANEL_MOCK') ?? 'true').toLowerCase() === 'true'
      return new Response(
        JSON.stringify({
          ok: true,
          expires_in_sec: OTP_TTL_MS / 1000,
          ...(mock || send.mock ? { dev_code: code } : {}),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (action === 'verify') {
      const code = String(body.code ?? '').replace(/\D/g, '')
      const fullName = String(body.full_name ?? '').trim()
      if (code.length !== 6) {
        return new Response(JSON.stringify({ error: 'invalid_code' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data: challenge } = await supabase
        .from('auth_otp_challenges')
        .select('*')
        .eq('phone', phone)
        .is('consumed_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!challenge) {
        return new Response(JSON.stringify({ error: 'no_challenge' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      if (new Date(challenge.expires_at).getTime() < Date.now()) {
        return new Response(JSON.stringify({ error: 'expired' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      if (challenge.attempts >= MAX_ATTEMPTS) {
        return new Response(JSON.stringify({ error: 'too_many_attempts' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const expected = await sha256(`${phone}:${code}`)
      if (expected !== challenge.code_hash) {
        await supabase
          .from('auth_otp_challenges')
          .update({ attempts: challenge.attempts + 1 })
          .eq('id', challenge.id)
        return new Response(JSON.stringify({ error: 'invalid_code' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      await supabase
        .from('auth_otp_challenges')
        .update({ consumed_at: new Date().toISOString() })
        .eq('id', challenge.id)

      const { data: profile } = await supabase
        .from('profiles')
        .select('id, full_name, phone')
        .eq('phone', phone)
        .maybeSingle()

      let email = phoneToEmail(phone)

      if (profile?.id) {
        const { data: userData } = await supabase.auth.admin.getUserById(profile.id)
        if (userData?.user?.email) email = userData.user.email
      } else {
        const { data: created, error: createError } = await supabase.auth.admin.createUser({
          email,
          email_confirm: true,
          user_metadata: {
            full_name: fullName || 'کاربر جدید',
            phone,
          },
        })
        if (createError) {
          // race: phone/email may exist
          const msg = createError.message ?? ''
          if (!/already|exists|registered/i.test(msg)) throw createError
        } else if (created.user && fullName) {
          await supabase
            .from('profiles')
            .update({ full_name: fullName, phone })
            .eq('id', created.user.id)
        }
      }

      // Ensure profile phone matches
      if (profile?.id && fullName && profile.full_name === 'کاربر جدید') {
        await supabase.from('profiles').update({ full_name: fullName }).eq('id', profile.id)
      }

      const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email,
      })
      if (linkError) throw linkError

      const tokenHash = linkData.properties?.hashed_token
      if (!tokenHash) {
        return new Response(JSON.stringify({ error: 'session_failed' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      return new Response(
        JSON.stringify({
          ok: true,
          token_hash: tokenHash,
          email,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    return new Response(JSON.stringify({ error: 'unknown_action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
