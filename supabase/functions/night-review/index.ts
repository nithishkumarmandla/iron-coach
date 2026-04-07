// supabase/functions/night-review/index.ts
// Cron: "30 16 * * *" (UTC 4:30pm = ~10pm IST)
// 1. Generates AI night review for each user at ~10pm local time
// 2. Auto-creates penalties for failed tasks
// 3. Updates discipline_score
// 4. Calls Gemini Flash to compress today's sessions into summaries (free)

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

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, utc_offset_mins, coach_mode, total_streak, discipline_score')

    if (!profiles || profiles.length === 0) return ok({ processed: 0 })

    let processed = 0

    for (const profile of profiles) {
      const localHour = (utcHour + Math.floor((profile.utc_offset_mins ?? 330) / 60)) % 24
      if (localHour < 21 || localHour > 23) continue

      // Skip if already done today
      const { data: existing } = await supabase
        .from('ai_conversations')
        .select('id')
        .eq('user_id', profile.id)
        .eq('date', today)
        .eq('session_type', 'night_review')
        .single()
      if (existing) continue

      // Get today's instances
      const { data: instances } = await supabase
        .from('daily_task_instances')
        .select('id, status, task:tasks(title, duration_mins)')
        .eq('user_id', profile.id)
        .eq('date', today)

      const all       = instances ?? []
      const completed = all.filter(i => i.status === 'completed')
      const failed    = all.filter(i => i.status === 'failed' || i.status === 'pending')
      const rate      = all.length ? Math.round((completed.length / all.length) * 100) : 0

      // ── Create penalties for failed tasks ─────────────────────
      for (const inst of failed) {
        const taskTitle = inst.task?.title ?? 'Task'
        const durMins   = inst.task?.duration_mins ?? 60

        await supabase.from('penalties').insert({
          instance_id:      inst.id,
          user_id:          profile.id,
          description:      generatePenalty(taskTitle, durMins),
          duration_mins:    Math.round(durMins * 0.5),
          due_date:         addDays(today, 1),
          status:           'pending',
          escalation_level: 1,
          proof_required:   true
        })

        // Mark instance as penalty_pending
        await supabase
          .from('daily_task_instances')
          .update({ status: 'penalty_pending' })
          .eq('id', inst.id)
      }

      // ── Update discipline score ────────────────────────────────
      const currentScore = profile.discipline_score ?? 0
      const delta        = rate >= 80 ? 3 : rate >= 50 ? 0 : -5
      const newScore     = Math.max(0, Math.min(100, currentScore + delta))
      const streakDelta  = rate === 100 ? 1 : rate < 50 ? -1 : 0
      const newStreak    = Math.max(0, (profile.total_streak ?? 0) + streakDelta)

      await supabase.from('profiles').update({
        discipline_score: newScore,
        total_streak: newStreak,
        best_streak: Math.max(profile.total_streak ?? 0, newStreak)
      }).eq('id', profile.id)

      // ── Generate AI night review ───────────────────────────────
      const taskSummary = [
        ...completed.map(i => `  ✓ ${i.task?.title ?? 'Task'}`),
        ...failed.map(i => `  ✗ ${i.task?.title ?? 'Task'}`)
      ].join('\n') || '  • No tasks recorded'

      const system = `You are IRON COACH doing a night review. Be specific and honest.
Coach mode: ${profile.coach_mode ?? 'balanced'}.
Score the day 1-10. List completions and failures briefly.
Assign one key lesson. Max 120 words. End with "Today: X/10."`

      const response = await anthropic.messages.create({
        model:      'claude-haiku-4-5',
        max_tokens: 250,
        system,
        messages:   [{
          role: 'user',
          content: `Completed: ${completed.length}/${all.length} tasks (${rate}%)\n${taskSummary}\nNew penalties: ${failed.length}`
        }]
      })

      const review = response.content[0].type === 'text'
        ? response.content[0].text
        : `You completed ${completed.length}/${all.length} tasks today. ${failed.length > 0 ? 'Penalties have been issued.' : 'Good work.'} Today: ${Math.round(rate / 10)}/10.`

      // ── Save night review conversation ────────────────────────
      await supabase.from('ai_conversations').insert({
        user_id:      profile.id,
        session_type: 'night_review',
        date:         today,
        messages:     [{ role: 'assistant', content: review, ts: new Date().toISOString() }]
      })

      // ── Compress today's sessions with Gemini Flash (free) ────
      await compressTodaySessions(profile.id, today)

      processed++
    }

    return ok({ processed })
  } catch (err) {
    console.error('night-review error:', err)
    return new Response(JSON.stringify({ ok: false, error: err.message }), { status: 500 })
  }
})

// ─── Helpers ──────────────────────────────────────────────────

function generatePenalty(taskTitle: string, durationMins: number): string {
  const category = taskTitle.toLowerCase()
  if (category.includes('run') || category.includes('exercise') || category.includes('workout')) {
    return `Missed ${taskTitle} — do ${Math.round(durationMins * 0.5)} min of exercise`
  }
  if (category.includes('study') || category.includes('read')) {
    return `Missed ${taskTitle} — study for ${Math.round(durationMins * 0.5)} min tomorrow`
  }
  return `Missed ${taskTitle} — complete a ${Math.round(durationMins * 0.5)} min equivalent task`
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

async function compressTodaySessions(userId: string, date: string) {
  const geminiKey = Deno.env.get('GEMINI_API_KEY')
  if (!geminiKey) return // Skip if key not configured

  try {
    const { data: convs } = await supabase
      .from('ai_conversations')
      .select('id, session_type, messages')
      .eq('user_id', userId)
      .eq('date', date)
      .is('summary', null)

    if (!convs || convs.length === 0) return

    for (const conv of convs) {
      const messages = (conv.messages ?? []) as Array<{ role: string; content: string }>
      if (messages.length < 2) continue

      const transcript = messages
        .map(m => `${m.role === 'user' ? 'User' : 'Coach'}: ${m.content}`)
        .join('\n')

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: `Summarize this coaching session in exactly 50 words. Focus on: tasks completed/failed, excuses used, coach tone, behavior patterns noticed. Facts only.\n\n${transcript}`
              }]
            }]
          })
        }
      )

      const data = await res.json()
      const summary = data?.candidates?.[0]?.content?.parts?.[0]?.text
      if (!summary) continue

      await supabase
        .from('ai_conversations')
        .update({ summary: summary.trim() })
        .eq('id', conv.id)
    }
  } catch (err) {
    console.error('Gemini compression error:', err) // Non-blocking
  }
}

function ok(data: unknown) {
  return new Response(JSON.stringify({ ok: true, ...data }), {
    headers: { 'Content-Type': 'application/json' }
  })
}
