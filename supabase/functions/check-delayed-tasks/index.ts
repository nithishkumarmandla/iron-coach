// supabase/functions/check-delayed-tasks/index.ts
// Cron: "*/30 * * * *" (every 30 minutes)
// Finds tasks overdue by 30+ minutes for users in waking hours.
// Sends WhatsApp nudge + in-app notification via Supabase Realtime.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.27.0'

const supabase  = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)
const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! })

const TWILIO_SID   = Deno.env.get('TWILIO_ACCOUNT_SID')!
const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')!
const TWILIO_FROM  = Deno.env.get('TWILIO_WHATSAPP_FROM') ?? 'whatsapp:+14155238886'

Deno.serve(async () => {
  try {
    const today   = new Date().toISOString().split('T')[0]
    const utcNow  = new Date()
    const utcHour = utcNow.getUTCHours()
    const utcMin  = utcNow.getUTCMinutes()

    // Get all users with waking-hours check
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, utc_offset_mins, phone_number, whatsapp_enabled, quiet_hours_start, quiet_hours_end, coach_mode')

    if (!profiles || profiles.length === 0) return ok({ nudged: 0 })

    let nudgedCount = 0

    for (const profile of profiles) {
      // Check if user is in waking hours (6am–11pm local)
      const localMins = (utcHour * 60 + utcMin + (profile.utc_offset_mins ?? 330)) % 1440
      const localHour = Math.floor(localMins / 60)
      if (localHour < 6 || localHour >= 23) continue

      // Check quiet hours
      const qStart = timeToMins(profile.quiet_hours_start ?? '23:00')
      const qEnd   = timeToMins(profile.quiet_hours_end   ?? '06:00')
      const inQuiet = qStart > qEnd
        ? localMins >= qStart || localMins < qEnd
        : localMins >= qStart && localMins < qEnd
      if (inQuiet) continue

      // Get overdue pending tasks (scheduled_time was 30+ min ago)
      const { data: instances } = await supabase
        .from('daily_task_instances')
        .select('id, task:tasks(title, scheduled_time)')
        .eq('user_id', profile.id)
        .eq('date', today)
        .eq('status', 'pending')

      const overdue = (instances ?? []).filter(inst => {
        const t = inst.task?.scheduled_time
        if (!t) return false
        const [h, m] = t.split(':').map(Number)
        const scheduledMins = h * 60 + m
        return localMins > scheduledMins + 30  // 30+ min overdue
      })

      if (overdue.length === 0) continue

      // Check: already nudged this task in last 90 min?
      const ninetyMinsAgo = new Date(Date.now() - 90 * 60 * 1000).toISOString()
      for (const inst of overdue) {
        const { data: recentNudge } = await supabase
          .from('notification_log')
          .select('id')
          .eq('user_id', profile.id)
          .eq('message_type', 'missed_task')
          .eq('reference_id', inst.id)
          .gte('sent_at', ninetyMinsAgo)
          .limit(1)

        if (recentNudge && recentNudge.length > 0) continue  // skip — already nudged

        const taskTitle = inst.task?.title ?? 'Task'

        // Generate AI nudge message
        let nudgeMsg = `⏰ ${taskTitle} is overdue. Open Iron Coach and start NOW.`
        try {
          const aiRes = await anthropic.messages.create({
            model: 'claude-haiku-4-5', max_tokens: 80,
            system: `You are IRON COACH. Write a 1-sentence WhatsApp nudge for a user who has not started their overdue task. Coach mode: ${profile.coach_mode ?? 'balanced'}. Be direct and urgent. No filler.`,
            messages: [{ role: 'user', content: `Task: ${taskTitle}. User: ${profile.username}. Generate the nudge.` }]
          })
          if (aiRes.content[0].type === 'text') nudgeMsg = aiRes.content[0].text
        } catch { /* use default */ }

        // Send WhatsApp if enabled
        if (profile.whatsapp_enabled && profile.phone_number) {
          await sendWhatsApp(profile.phone_number, nudgeMsg)
        }

        // Log notification
        await supabase.from('notification_log').insert({
          user_id:      profile.id,
          channel:      profile.whatsapp_enabled ? 'whatsapp' : 'in_app',
          message_type: 'missed_task',
          reference_id: inst.id,
          content:      nudgeMsg,
          delivered:    true
        })

        // Log behavior event
        await supabase.from('behavior_logs').insert({
          user_id:    profile.id,
          event_type: 'task_nudge_sent',
          metadata:   { instanceId: inst.id, taskTitle, localHour }
        })

        nudgedCount++
      }
    }

    return ok({ nudged: nudgedCount })

  } catch (err) {
    console.error('check-delayed-tasks error:', err)
    return new Response(JSON.stringify({ ok: false, error: err.message }), { status: 500 })
  }
})

async function sendWhatsApp(phone: string, message: string) {
  const formData = new URLSearchParams({
    From: TWILIO_FROM,
    To:   `whatsapp:${phone}`,
    Body: message
  })
  await fetch(
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
}

function timeToMins(t: string): number {
  const [h, m] = (t ?? '00:00').split(':').map(Number)
  return h * 60 + m
}

function ok(data: unknown) {
  return new Response(JSON.stringify({ ok: true, ...data }), {
    headers: { 'Content-Type': 'application/json' }
  })
}
