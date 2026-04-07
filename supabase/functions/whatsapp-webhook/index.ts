// supabase/functions/whatsapp-webhook/index.ts
// Twilio webhook — called when user replies to a WhatsApp message.
// Set this URL in Twilio Console → WhatsApp Sandbox → "When a message comes in"
// URL: https://YOUR_PROJECT_REF.supabase.co/functions/v1/whatsapp-webhook

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

Deno.serve(async (req) => {
  if (req.method !== 'POST') return twiml('')

  try {
    const body    = await req.formData()
    const from    = body.get('From')?.toString() ?? ''     // "whatsapp:+91XXXXXXXXXX"
    const msgBody = body.get('Body')?.toString()?.trim() ?? ''

    if (!from || !msgBody) return twiml('')

    const phone = from.replace('whatsapp:', '')

    // Find user by phone number
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, username, coach_mode, total_streak, discipline_score')
      .eq('phone_number', phone)
      .single()

    if (!profile) return twiml('You are not registered. Open the app to sign up.')

    const userId  = profile.id
    const msgLow  = msgBody.toLowerCase()
    let reply     = ''

    // ── Command parsing ───────────────────────────────────────

    if (msgLow === 'status' || msgLow === 's') {
      // Today's task summary
      const today = new Date().toISOString().split('T')[0]
      const { data: instances } = await supabase
        .from('daily_task_instances')
        .select('status, task:tasks(title)')
        .eq('user_id', userId)
        .eq('date', today)

      const completed = (instances ?? []).filter(i => i.status === 'completed')
      const pending   = (instances ?? []).filter(i => i.status === 'pending')
      const failed    = (instances ?? []).filter(i => ['failed','penalty_pending'].includes(i.status))

      reply = `📊 Today (${today})\n`
      reply += `✅ Done (${completed.length}): ${completed.map(i => i.task?.title).join(', ') || 'none'}\n`
      reply += `⏳ Pending (${pending.length}): ${pending.map(i => i.task?.title).join(', ') || 'none'}\n`
      reply += `❌ Failed (${failed.length}): ${failed.map(i => i.task?.title).join(', ') || 'none'}\n`
      reply += `\nStreak: 🔥${profile.total_streak} · Score: ${Math.round(profile.discipline_score ?? 0)}/100`

    } else if (msgLow === 'help' || msgLow === 'h') {
      reply = `Iron Coach commands:\n• *status* — today's tasks\n• *done* — confirm task awareness\n• *skip* — request emergency (use app)\n• *help* — show this\n\nOr just type anything to chat with your coach.`

    } else if (msgLow === 'done' || msgLow === '✓' || msgLow === '✅') {
      reply = `Good. Open the app to start your timer and submit proof.\nRemember: no proof = not done. 💪`

    } else if (msgLow === 'skip' || msgLow === 'emergency') {
      reply = `Emergency requests must be made in the app — AI needs to assess your reason.\nOpen Iron Coach → tap the task → Emergency.`

    } else {
      // Free text → send to AI coach
      const today = new Date().toISOString().split('T')[0]
      const { data: instances } = await supabase
        .from('daily_task_instances')
        .select('status, task:tasks(title, scheduled_time)')
        .eq('user_id', userId).eq('date', today)

      const taskList = (instances ?? [])
        .map(i => `${i.task?.title} — ${i.status.toUpperCase()}`).join(', ') || 'No tasks'

      const response = await anthropic.messages.create({
        model:      'claude-haiku-4-5',
        max_tokens: 150,
        system: `You are IRON COACH replying via WhatsApp. Be direct, under 100 words.
Coach mode: ${profile.coach_mode ?? 'balanced'}.
User: ${profile.username}. Streak: ${profile.total_streak}. Score: ${Math.round(profile.discipline_score ?? 0)}.
Today's tasks: ${taskList}`,
        messages: [{ role: 'user', content: msgBody }]
      })

      reply = response.content[0].type === 'text'
        ? response.content[0].text : 'Open the app to continue.'
    }

    // Log the reply
    await supabase.from('notification_log').insert({
      user_id:      userId,
      channel:      'whatsapp',
      message_type: 'user_reply',
      content:      msgBody,
      user_replied: reply,
      delivered:    true
    })

    return twiml(reply)

  } catch (err) {
    console.error('whatsapp-webhook error:', err)
    return twiml('Something went wrong. Open the app.')
  }
})

function twiml(message: string) {
  const body = message
    ? `<?xml version="1.0"?><Response><Message>${escXml(message)}</Message></Response>`
    : `<?xml version="1.0"?><Response></Response>`
  return new Response(body, { headers: { 'Content-Type': 'text/xml' } })
}

function escXml(str: string) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
