-- Deno Edge Function: verify ZarinPal then apply_payment_result via service role.
-- Deploy: supabase functions deploy payment-verify
-- Secrets: ZARINPAL_MERCHANT_ID, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL

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
    const { invoice_id, authority, amount } = await req.json()
    if (!invoice_id || !authority || amount == null) {
      return new Response(JSON.stringify({ error: 'missing fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const merchantId = Deno.env.get('ZARINPAL_MERCHANT_ID') ?? ''
    const sandbox = Deno.env.get('ZARINPAL_SANDBOX') === 'true'
    const base = sandbox
      ? 'https://sandbox.zarinpal.com/pg/v4/payment'
      : 'https://api.zarinpal.com/pg/v4/payment'

    const verifyRes = await fetch(`${base}/verify.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        merchant_id: merchantId,
        amount: Math.round(Number(amount)),
        authority,
      }),
    })
    const verifyJson = await verifyRes.json()
    const code = verifyJson?.data?.code
    const success = code === 100 || code === 101
    const refId = verifyJson?.data?.ref_id

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const { data, error } = await supabase.rpc('apply_payment_result', {
      p_invoice_id: invoice_id,
      p_authority: authority,
      p_success: success,
      p_gateway_ref: refId != null ? String(refId) : authority,
    })

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ success, invoice: data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
