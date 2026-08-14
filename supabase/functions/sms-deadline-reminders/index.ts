// Deno Edge Function: enqueue + dispatch registration deadline SMS reminders
// Schedule via Supabase cron / external scheduler (e.g. every hour)
// Deploy: supabase functions deploy sms-deadline-reminders

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
    const hours = Number(body.hours_before ?? 48)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const { data: enqueued, error: enqueueError } = await supabase.rpc(
      'enqueue_registration_deadline_reminders',
      { p_hours_before: hours },
    )
    if (enqueueError) throw enqueueError

    // Dispatch pending (including newly claimed) — idempotent
    const dispatchUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/sms-dispatch`
    const dispatchRes = await fetch(dispatchUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({ limit: 100 }),
    })
    const dispatchJson = await dispatchRes.json().catch(() => ({}))

    return new Response(
      JSON.stringify({
        enqueued,
        dispatch: dispatchJson,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
