// supabase/functions/ai-coach/index.ts
// Called by the frontend chat UI for every user message.
// Uses Claude Haiku with Iron Coach persona + 2-layer memory.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.27.0'

const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY')

const supabase  = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)
const anthropic = anthropicApiKey
  ? new Anthropic({ apiKey: anthropicApiKey })
  : null

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  try {
    if (!anthropic) {
      return json({ error: 'ANTHROPIC_API_KEY is missing in Supabase Edge Function secrets' }, 500)
    }

    // Auth: verify JWT from frontend
    const token = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return json({ error: 'Unauthorized' }, 401)

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

    const { userMessage, sessionType } = await req.json()
    const userId = user.id
    const today  = new Date().toISOString().split('T')[0]

    // ── 1. Build user context ────────────────────────────────────
    const [profileRes, instancesRes, penaltiesRes] = await Promise.all([
      supabase.from('profiles').select(
        'username, coach_mode, total_streak, discipline_score, avg_sleep_hours, energy_level, timezone'
      ).eq('id', userId).single(),

      supabase.from('daily_task_instances')
        .select('status, one_off_title, task:tasks(title, scheduled_time)')
        .eq('user_id', userId).eq('date', today),

      supabase.from('penalties')
        .select('description, escalation_level')
        .eq('user_id', userId).eq('status', 'pending').limit(3)
    ])

    const profile   = profileRes.data
    const instances = instancesRes.data ?? []
    const penalties = penaltiesRes.data ?? []

    const taskList = instances.map(i => {
      const title = i.task?.title ?? i.one_off_title ?? 'Task'
      const time  = i.task?.scheduled_time?.slice(0, 5) ?? '--'
      return `  • ${title} (${time}) — ${i.status.toUpperCase()}`
    }).join('\n') || '  • No tasks today'

    const completedCount = instances.filter(i => i.status === 'completed').length
    const rate = instances.length
      ? Math.round((completedCount / instances.length) * 100) : 0

    const hour = new Date().getUTCHours()
    const localHour = (hour + Math.round((profile?.utc_offset_mins ?? 330) / 60)) % 24

    // ── 2. Get 7-day compressed summaries (long-term memory) ─────
    const { data: summaries } = await supabase
      .from('ai_conversations')
      .select('date, session_type, summary')
      .eq('user_id', userId)
      .not('summary', 'is', null)
      .order('date', { ascending: false })
      .limit(14)

    const memoryText = summaries && summaries.length > 0
      ? summaries.map(s => `[${s.date} ${s.session_type}]: ${s.summary}`).join('\n')
      : 'No previous session history.'

    // ── 3. Get today's conversation (short-term memory) ──────────
    const { data: todayConv } = await supabase
      .from('ai_conversations')
      .select('messages')
      .eq('user_id', userId)
      .eq('date', today)
      .eq('session_type', sessionType)
      .single()

    const todayMessages = (todayConv?.messages ?? [])
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .slice(-20)  // last 20 messages max
      .map(m => ({ role: m.role, content: m.content }))

    // ── 4. Build system prompt ────────────────────────────────────
    const coachMode   = profile?.coach_mode ?? 'balanced'
    const modeContext = {
      strict:     'Be harsh and demanding. No sympathy for excuses. Push hard.',
      balanced:   'Be firm but fair. Push when needed, acknowledge effort when genuine.',
      supportive: 'Be encouraging. The user is struggling. Support without removing accountability.'
    }[coachMode] ?? 'Be firm but fair.'

    const sessionContext = {
      morning_plan:  'This is a MORNING PLANNING session. Review the day, set intentions, energize the user. End with "Let\'s execute."',
      night_review:  'This is a NIGHT REVIEW session. Score the day 1-10. Be specific about what was done/failed. Assign penalties if tasks were missed. Give one key lesson.',
      coaching:      'This is a real-time COACHING session. Help with execution, not avoidance.',
      quick_nudge:   'The user has a delayed task. Push hard to start immediately.',
      body_double:   'The user is mid-task. Ask what they accomplished in the last 15 minutes. Keep it brief.'
    }[sessionType] ?? 'This is a coaching session.'

    const systemPrompt = `You are IRON COACH — a strict AI discipline enforcer.

COACH MODE: ${coachMode.toUpperCase()} — ${modeContext}
SESSION: ${sessionContext}

USER:
- Name: ${profile?.username ?? 'User'}
- Local time: approximately ${localHour}:00
- Sleep last night: ${profile?.avg_sleep_hours ?? 7} hours
- Energy level: ${profile?.energy_level ?? 3}/5
- Current streak: ${profile?.total_streak ?? 0} days
- Discipline score: ${Math.round(profile?.discipline_score ?? 0)}/100
- Today's completion rate: ${rate}%

TODAY'S TASKS:
${taskList}

ACTIVE PENALTIES: ${penalties.length === 0 ? 'None' : penalties.map(p => `• ${p.description} (Level ${p.escalation_level})`).join(', ')}

MEMORY — LAST 7 DAYS:
${memoryText}

RULES YOU NEVER BREAK:
- No proof = not done. No exceptions.
- Missed penalty = escalation. No sympathy.
- Emergency = AI assesses. User does not self-approve.
- Do not help the user avoid tasks. Help them do tasks.

FORMAT:
- Under 120 words unless doing night review
- Direct, specific, action-oriented
- No filler phrases like "Great question!" or "Certainly!"
- Morning plan ends with: "Let's execute."
- Night review ends with a score like "Today: 7/10" and one lesson`

    // ── 5. Call Claude Haiku ──────────────────────────────────────
    const messages = userMessage
      ? [...todayMessages, { role: 'user', content: userMessage }]
      : todayMessages.length > 0
        ? todayMessages
        : [{ role: 'user', content: `Start the ${sessionType.replace('_', ' ')} session.` }]

    const response = await anthropic.messages.create({
      model:      'claude-haiku-4-5',
      max_tokens: 400,
      system:     systemPrompt,
      messages
    })

    const reply = response.content[0].type === 'text'
      ? response.content[0].text
      : 'I encountered an issue. Please try again.'

    // ── 6. Log behavior event ─────────────────────────────────────
    if (userMessage) {
      await supabase.from('behavior_logs').insert({
        user_id:    userId,
        event_type: 'ai_message_sent',
        metadata:   { sessionType, messageLength: userMessage.length }
      })
    }

    return json({ reply })

  } catch (err) {
    console.error('ai-coach error:', err)
    return json({ error: err.message }, 500)
  }
})

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}
