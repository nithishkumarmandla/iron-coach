// supabase/functions/anti-cheat-spotcheck/index.ts
// Runs weekly (Sunday) as part of weekly-evolution.
// Layer 3: Random spot checks on 10% of completed tasks.
// Layer 4: AI analyzes behavior_logs for gaming patterns.

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

    const { userId } = await req.json()
    const targetId   = userId ?? user.id

    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]
    const today   = new Date().toISOString().split('T')[0]

    // ── Layer 3: Random spot checks (10% of completions) ─────
    const { data: completed } = await supabase
      .from('daily_task_instances')
      .select('id, task:tasks(title)')
      .eq('user_id', targetId)
      .eq('status', 'completed')
      .gte('date', weekAgo)
      .lte('date', today)

    const spotCheckCount = Math.max(1, Math.floor((completed?.length ?? 0) * 0.1))
    const shuffled       = [...(completed ?? [])].sort(() => Math.random() - 0.5)
    const toCheck        = shuffled.slice(0, spotCheckCount)

    for (const inst of toCheck) {
      // Create a spot check request — stored in behavior_logs
      // The AI coach will ask about this in the next session
      await supabase.from('behavior_logs').insert({
        user_id:    targetId,
        event_type: 'spot_check_scheduled',
        metadata:   {
          instanceId: inst.id,
          taskTitle:  inst.task?.title ?? 'Task',
          checkDate:  today
        }
      })
    }

    // ── Layer 4: AI pattern analysis ─────────────────────────
    const { data: logs } = await supabase
      .from('behavior_logs')
      .select('event_type, metadata, logged_at')
      .eq('user_id', targetId)
      .gte('logged_at', new Date(Date.now() - 30 * 86400000).toISOString())
      .order('logged_at', { ascending: false })
      .limit(100)

    if (!logs || logs.length === 0) return json({ ok: true, spotChecks: toCheck.length, patterns: [] })

    // Summarize for AI
    const eventSummary = logs.reduce((acc: Record<string, number>, log) => {
      acc[log.event_type] = (acc[log.event_type] ?? 0) + 1
      return acc
    }, {})

    const timerInflations = logs.filter(l => l.event_type === 'anticheat_timer_inflation').length
    const abandonments    = logs.filter(l => l.event_type === 'timer_abandoned').length
    const emergencyAbuses = logs.filter(l => l.event_type === 'emergency_abuse_detected').length
    const nudgesSent      = logs.filter(l => l.event_type === 'task_nudge_sent').length

    const response = await anthropic.messages.create({
      model:      'claude-haiku-4-5',
      max_tokens: 200,
      system: `You are IRON COACH analyzing behavior patterns for anti-cheat detection. 
Respond ONLY with valid JSON: {"abuse_detected": boolean, "patterns": ["pattern1"], "confidence": 0.0-1.0, "action": "none|warn|strict_mode|flag"}`,
      messages: [{
        role: 'user',
        content: `Last 30 days behavior:
- Timer inflation flags: ${timerInflations}
- Timer abandonments: ${abandonments}
- Emergency abuse flags: ${emergencyAbuses}
- Nudges sent for overdue tasks: ${nudgesSent}
- Event breakdown: ${JSON.stringify(eventSummary)}

Detect abuse or gaming patterns.`
      }]
    })

    let analysis = { abuse_detected: false, patterns: [], confidence: 0, action: 'none' }
    try {
      const raw = response.content[0].type === 'text' ? response.content[0].text : ''
      const match = raw.match(/\{[\s\S]*\}/)
      if (match) analysis = JSON.parse(match[0])
    } catch { /* use defaults */ }

    // Apply action
    if (analysis.action === 'strict_mode' || analysis.action === 'flag') {
      await supabase.from('profiles')
        .update({ coach_mode: 'strict' })
        .eq('id', targetId)

      await supabase.from('behavior_logs').insert({
        user_id:    targetId,
        event_type: 'anticheat_pattern_detected',
        metadata:   analysis
      })
    }

    return json({
      ok:          true,
      spotChecks:  toCheck.length,
      patterns:    analysis.patterns,
      action:      analysis.action
    })

  } catch (err) {
    console.error('anti-cheat-spotcheck error:', err)
    return json({ ok: false, error: err.message }, 500)
  }
})

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json' }
  })
}