// supabase/functions/weekly-evolution/index.ts
// Cron: "0 17 * * 0" (UTC 5pm Sunday = ~10:30pm IST Sunday)
// Also called manually from WeeklyContract screen.
// Generates the weekly report, AI analysis, and next week's contract.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.27.0'

const supabase  = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)
const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! })

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  try {
    const token = req.headers.get('Authorization')?.replace('Bearer ', '')
    const { data: { user } } = await supabase.auth.getUser(token!)
    if (!user) return json({ error: 'Unauthorized' }, 401)

    const body   = await req.json()
    const userId = body.userId ?? user.id

    const today     = new Date()
    const weekStart = getMonday(today)
    const weekEnd   = getSunday(today)

    // Skip if already generated this week (unless manual)
    if (!body.manual) {
      const { data: existing } = await supabase
        .from('weekly_reports')
        .select('id')
        .eq('user_id', userId)
        .eq('week_start', weekStart)
        .single()
      if (existing) return json({ ok: true, skipped: true })
    }

    // ── Gather week's stats ───────────────────────────────────────
    const { data: instances } = await supabase
      .from('daily_task_instances')
      .select('status, date, task:tasks(title, category, difficulty)')
      .eq('user_id', userId)
      .gte('date', weekStart)
      .lte('date', weekEnd)

    const all       = instances ?? []
    const completed = all.filter(i => i.status === 'completed')
    const failed    = all.filter(i => ['failed','penalty_pending'].includes(i.status))
    const rate      = all.length ? Math.round((completed.length / all.length) * 100) : 0

    const { data: penalties } = await supabase
      .from('penalties')
      .select('status')
      .eq('user_id', userId)
      .gte('created_at', weekStart)

    const { data: profile } = await supabase
      .from('profiles')
      .select('username, coach_mode, total_streak, discipline_score, avg_sleep_hours')
      .eq('id', userId)
      .single()

    // Task failure breakdown
    const failedTitles = [...new Set(failed.map(i => i.task?.title ?? 'Unknown'))]
      .slice(0, 5).join(', ')

    // ── Generate AI weekly review + contract ──────────────────────
    const response = await anthropic.messages.create({
      model:      'claude-haiku-4-5',
      max_tokens: 500,
      system: `You are IRON COACH writing a weekly review and next-week contract.
Be specific, data-driven, and honest. No filler.
Format your response as:
REVIEW: [2-3 sentences about this week's performance]
LESSON: [the single most important thing to improve]
CONTRACT: [3-5 specific commitments for next week, each on a new line starting with "•"]`,
      messages: [{
        role: 'user',
        content: `User: ${profile?.username}
Week: ${weekStart} to ${weekEnd}
Completion rate: ${rate}% (${completed.length}/${all.length} tasks)
Failed tasks: ${failedTitles || 'none'}
Penalties issued: ${penalties?.length ?? 0}
Current streak: ${profile?.total_streak ?? 0} days
Discipline score: ${Math.round(profile?.discipline_score ?? 0)}/100
Coach mode: ${profile?.coach_mode ?? 'balanced'}

Generate the weekly review and contract.`
      }]
    })

    const aiText = response.content[0].type === 'text'
      ? response.content[0].text
      : `Week complete. ${rate}% completion rate.\n• Continue your current schedule next week.`

    // Determine difficulty delta
    const difficultyDelta = rate >= 85 ? 1 : rate < 50 ? -1 : 0

    // ── Save or update weekly report ──────────────────────────────
    const { data: report, error } = await supabase
      .from('weekly_reports')
      .upsert({
        user_id:          userId,
        week_start:       weekStart,
        completion_rate:  rate,
        discipline_score: Math.round(profile?.discipline_score ?? 0),
        streak_days:      profile?.total_streak ?? 0,
        tasks_completed:  completed.length,
        tasks_failed:     failed.length,
        penalties_issued: penalties?.length ?? 0,
        ai_analysis:      aiText,
        difficulty_delta: difficultyDelta,
        schedule_changes: { generated_at: new Date().toISOString() }
      }, { onConflict: 'user_id,week_start' })
      .select('id')
      .single()

    if (error) throw error

    // Update task difficulty if needed
    if (difficultyDelta !== 0) {
      const { data: tasks } = await supabase
        .from('tasks')
        .select('id, difficulty')
        .eq('user_id', userId)
        .eq('is_active', true)

      for (const task of tasks ?? []) {
        const newDiff = Math.max(1, Math.min(5, (task.difficulty ?? 1) + difficultyDelta))
        if (newDiff !== task.difficulty) {
          await supabase.from('tasks').update({ difficulty: newDiff }).eq('id', task.id)
        }
      }
    }

    return json({ ok: true, reportId: report?.id, rate, difficultyDelta })

  } catch (err) {
    console.error('weekly-evolution error:', err)
    return json({ ok: false, error: err.message }, 500)
  }
})

function getMonday(date: Date): string {
  const d = new Date(date)
  const day = d.getDay()
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
  return d.toISOString().split('T')[0]
}

function getSunday(date: Date): string {
  const d = new Date(date)
  const day = d.getDay()
  d.setDate(d.getDate() + (day === 0 ? 0 : 7 - day))
  return d.toISOString().split('T')[0]
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}
