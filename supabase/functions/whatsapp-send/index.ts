// supabase/functions/whatsapp-send/index.ts
// Sends a WhatsApp message to the user via Twilio.
// Checks quiet hours and deduplication before sending.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const TWILIO_SID   = Deno.env.get('TWILIO_ACCOUNT_SID')!
const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')!
const TWILIO_FROM  = Deno.env.get('TWILIO_WHATSAPP_FROM') ?? 'whatsapp:+14155238886'

Deno.serve(async (req) => {
  if (req.method !== 'POST') return res('Method not allowed', 405)

  try {
    // Auth
    const token = req.headers.get('Authorization')?.replace('Bearer ', '')
    const { data: { user } } = await supabase.auth.getUser(token!)
    if (!user) return json({ error: 'Unauthorized' }, 401)

    const { message, type, refId } = await req.json()
    if (!message) return json({ error: 'message required' }, 400)

    // Get user profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('phone_number, whatsapp_enabled, quiet_hours_start, quiet_hours_end, utc_offset_mins')
      .eq('id', user.id)
      .single()

    if (!profile?.whatsapp_enabled || !profile?.phone_number) {
      return json({ ok: false, reason: 'WhatsApp not enabled or no phone number' })
    }

    // Check quiet hours
    const utcHour   = new Date().getUTCHours()
    const utcMin    = new Date().getUTCMinutes()
    const localMins = (utcHour * 60 + utcMin + (profile.utc_offset_mins ?? 330)) % 1440
    const qStart    = timeToMins(profile.quiet_hours_start ?? '23:00')
    const qEnd      = timeToMins(profile.quiet_hours_end   ?? '06:00')
    const inQuiet   = qStart > qEnd
      ? localMins >= qStart || localMins < qEnd
      : localMins >= qStart && localMins < qEnd

    if (inQuiet) return json({ ok: false, reason: 'quiet_hours' })

    // Deduplication: skip if same type + refId sent in last 2 hours
    if (refId) {
      const twoHoursAgo = new Date(Date.now() - 7200000).toISOString()
      const { data: recent } = await supabase
        .from('notification_log')
        .select('id')
        .eq('user_id', user.id)
        .eq('channel', 'whatsapp')
        .eq('message_type', type ?? 'manual')
        .eq('reference_id', refId)
        .gte('sent_at', twoHoursAgo)
        .limit(1)

      if (recent && recent.length > 0) {
        return json({ ok: false, reason: 'duplicate_suppressed' })
      }
    }

    // Send via Twilio
    const toPhone = `whatsapp:${profile.phone_number}`
    const formData = new URLSearchParams({
      From: TWILIO_FROM,
      To:   toPhone,
      Body: message
    })

    const twilioRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: formData
      }
    )

    const twilioData = await twilioRes.json()
    const delivered  = twilioRes.ok && !twilioData.error_code

    // Log it
    await supabase.from('notification_log').insert({
      user_id:      user.id,
      channel:      'whatsapp',
      message_type: type ?? 'manual',
      reference_id: refId ?? null,
      content:      message,
      delivered
    })

    if (!delivered) {
      console.error('Twilio error:', twilioData)
      return json({ ok: false, error: 'Twilio send failed', detail: twilioData.message }, 502)
    }

    return json({ ok: true })

  } catch (err) {
    console.error('whatsapp-send error:', err)
    return json({ ok: false, error: err.message }, 500)
  }
})

function timeToMins(t: string): number {
  const [h, m] = (t ?? '00:00').split(':').map(Number)
  return h * 60 + m
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json' }
  })
}

function res(text: string, status = 200) {
  return new Response(text, { status })
}
