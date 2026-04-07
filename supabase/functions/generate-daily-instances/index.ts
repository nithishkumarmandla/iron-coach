// supabase/functions/generate-daily-instances/index.ts
// Cron: "0 0 * * *" (midnight UTC daily)
// Creates daily_task_instances for all active users' tasks
// Also escalates any penalties missed from yesterday

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

Deno.serve(async () => {
  try {
    const today = new Date()
    const todayStr = today.toISOString().split('T')[0]
    const yesterdayStr = new Date(today.getTime() - 86400000).toISOString().split('T')[0]

    // Day of week: 1=Mon ... 7=Sun (matching our DB convention)
    const dayOfWeek = today.getDay() === 0 ? 7 : today.getDay()

    // ── Step 1: Get all active tasks scheduled for today ──────────
    const { data: tasks, error: tasksError } = await supabase
      .from('tasks')
      .select('id, user_id, days_of_week')
      .eq('is_active', true)
      .contains('days_of_week', [dayOfWeek])

    if (tasksError) throw tasksError

    // ── Step 2: Batch insert instances (skip existing) ─────────────
    if (tasks && tasks.length > 0) {
      const rows = tasks.map(task => ({
        task_id:    task.id,
        user_id:    task.user_id,
        date:       todayStr,
        status:     'pending',
        created_by: 'auto'
      }))

      // onConflict: skip if (task_id, date) already exists
      const { error: insertError } = await supabase
        .from('daily_task_instances')
        .upsert(rows, { onConflict: 'task_id,date', ignoreDuplicates: true })

      if (insertError) throw insertError
    }

    // ── Step 3: Mark yesterday's still-pending tasks as failed ─────
    const { error: failError } = await supabase
      .from('daily_task_instances')
      .update({ status: 'failed', updated_at: new Date().toISOString() })
      .eq('date', yesterdayStr)
      .in('status', ['pending', 'in_progress'])

    if (failError) throw failError

    // ── Step 4: Escalate missed penalties from yesterday ───────────
    const { data: missedPenalties } = await supabase
      .from('penalties')
      .select('id, user_id, description, duration_mins, escalation_level')
      .eq('status', 'pending')
      .lte('due_date', yesterdayStr)

    if (missedPenalties && missedPenalties.length > 0) {
      // Mark missed
      const missedIds = missedPenalties.map(p => p.id)
      await supabase
        .from('penalties')
        .update({ status: 'missed' })
        .in('id', missedIds)

      // Create escalated penalties (harder, due today)
      const escalated = missedPenalties
        .filter(p => p.escalation_level < 3)
        .map(p => ({
          user_id:          p.user_id,
          description:      escalateDescription(p.description, p.escalation_level + 1),
          duration_mins:    p.duration_mins ? Math.round(p.duration_mins * 1.5) : null,
          due_date:         todayStr,
          status:           'pending',
          escalation_level: p.escalation_level + 1,
          parent_penalty_id: p.id,
          proof_required:   true
        }))

      if (escalated.length > 0) {
        await supabase.from('penalties').insert(escalated)
      }
    }

    // ── Step 5: Generate today's habit_completions ─────────────
    const { data: habits } = await supabase
      .from('habits')
      .select('id, user_id, frequency, days_of_week')
      .eq('is_active', true)

    if (habits && habits.length > 0) {
      const habitRows = habits
        .filter(h => {
          if (h.frequency === 'daily') return true
          if (h.frequency === 'weekdays') return dayOfWeek <= 5
          if (h.frequency === 'weekends') return dayOfWeek >= 6
          if (h.frequency === 'custom') return (h.days_of_week ?? []).includes(dayOfWeek)
          return false
        })
        .map(h => ({
          habit_id: h.id,
          user_id:  h.user_id,
          date:     todayStr,
          status:   'pending'
        }))

      if (habitRows.length > 0) {
        await supabase
          .from('habit_completions')
          .upsert(habitRows, { onConflict: 'habit_id,date', ignoreDuplicates: true })
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      date: todayStr,
      instancesCreated: tasks?.length ?? 0,
      penaltiesEscalated: missedPenalties?.length ?? 0
    }), { headers: { 'Content-Type': 'application/json' } })

  } catch (err) {
    console.error('generate-daily-instances error:', err)
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})

function escalateDescription(original: string, level: number): string {
  const multiplier = level === 2 ? '2x' : '3x'
  return `[Level ${level} escalation — ${multiplier}] ${original}`
}
