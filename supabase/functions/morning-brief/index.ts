// supabase/functions/morning-brief/index.ts
// Cron: "0 1 * * *" (UTC 1:30am = ~7am IST)
// Creates the morning plan conversation for each user whose local time is ~7am.
// The message is stored so it appears when the user opens the Chat screen.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.27.0'

const supabase  = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)
const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! })

Deno.serve(async () => {
  try {
    const today   = new Date().toISOString().split('T')[0]
    const utcHour = new Date().getUTCHours()

    // Get users whose local time is between 6:45am and 7:15am
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, utc_offset_mins, coach_mode, total_streak, discipline_score, avg_sleep_hours, energy_level, timezone')
      .eq('whatsapp_enabled', false) // WhatsApp users get notified via that channel instead

    if (!profiles || profiles.length === 0) return ok({ processed: 0 })

    let processed = 0

    for (const profile of profiles) {
      const localHour = (utcHour + Math.floor((profile.utc_offset_mins ?? 330) / 60)) % 24
      if (localHour < 6 || localHour > 8) continue // only process users near 7am

      // Skip if already sent today
      const { data: existing } = await supabase
        .from('ai_conversations')
        .select('id')
        .eq('user_id', profile.id)
        .eq('date', today)
        .eq('session_type', 'morning_plan')
        .single()
      if (existing) continue

      // Get today's tasks
      const { data: instances } = await supabase
        .from('daily_task_instances')
        .select('status, task:tasks(title, scheduled_time, duration_mins)')
        .eq('user_id', profile.id)
        .eq('date', today)

      const taskList = (instances ?? []).map(i =>
        `  • ${i.task?.title ?? 'Task'} at ${i.task?.scheduled_time?.slice(0, 5) ?? '--:--'} (${i.task?.duration_mins ?? 60} min)`
      ).join('\n') || '  • No tasks scheduled'

      // Generate morning plan with Claude
      const systemPrompt = `You are IRON COACH. Generate a sharp, motivating morning plan under 100 words.
Coach mode: ${profile.coach_mode ?? 'balanced'}.
User: ${profile.username}. Streak: ${profile.total_streak ?? 0} days. Score: ${Math.round(profile.discipline_score ?? 0)}.
Sleep: ${profile.avg_sleep_hours ?? 7}h. Energy: ${profile.energy_level ?? 3}/5.
End with "Let's execute."`

      const response = await anthropic.messages.create({
        model:      'claude-haiku-4-5',
        max_tokens: 200,
        system:     systemPrompt,
        messages:   [{ role: 'user', content: `Today's tasks:\n${taskList}\n\nGenerate my morning plan.` }]
      })

      const reply = response.content[0].type === 'text'
        ? response.content[0].text : 'Start your day with focus. Let\'s execute.'

      // Save to ai_conversations
      await supabase.from('ai_conversations').insert({
        user_id:      profile.id,
        session_type: 'morning_plan',
        date:         today,
        messages:     [{ role: 'assistant', content: reply, ts: new Date().toISOString() }]
      })

      processed++
    }

    return ok({ processed })
  } catch (err) {
    console.error('morning-brief error:', err)
    return new Response(JSON.stringify({ ok: false, error: err.message }), { status: 500 })
  }
})

function ok(data: unknown) {
  return new Response(JSON.stringify({ ok: true, ...data }), {
    headers: { 'Content-Type': 'application/json' }
  })
}
