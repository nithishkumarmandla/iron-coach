import { supabase } from './supabase'
import { format } from 'date-fns'

// ─── CONVERSATIONS ─────────────────────────────────────────────

export async function getTodayConversation(userId, sessionType = 'coaching') {
  const today = format(new Date(), 'yyyy-MM-dd')
  const { data } = await supabase
    .from('ai_conversations')
    .select('*')
    .eq('user_id', userId)
    .eq('date', today)
    .eq('session_type', sessionType)
    .single()
  return data
}

export async function getOrCreateConversation(userId, sessionType) {
  const today = format(new Date(), 'yyyy-MM-dd')

  // Try to get existing
  const { data: existing } = await supabase
    .from('ai_conversations')
    .select('id, messages')
    .eq('user_id', userId)
    .eq('date', today)
    .eq('session_type', sessionType)
    .single()

  if (existing) return existing

  // Create new
  const { data, error } = await supabase
    .from('ai_conversations')
    .insert({ user_id: userId, session_type: sessionType, date: today, messages: [] })
    .select('id, messages')
    .single()

  if (error) throw error
  return data
}

export async function appendMessage(convId, role, content) {
  const { data: conv } = await supabase
    .from('ai_conversations')
    .select('messages')
    .eq('id', convId)
    .single()

  const messages = conv?.messages ?? []
  messages.push({ role, content, ts: new Date().toISOString() })

  const { error } = await supabase
    .from('ai_conversations')
    .update({ messages })
    .eq('id', convId)

  if (error) throw error
  return messages
}

// Get last 7 days compressed summaries for memory injection
export async function getWeekSummaries(userId) {
  const { data } = await supabase
    .from('ai_conversations')
    .select('date, session_type, summary')
    .eq('user_id', userId)
    .not('summary', 'is', null)
    .order('date', { ascending: false })
    .limit(14) // up to 2 sessions/day × 7 days

  return data ?? []
}

// ─── CONTEXT BUILDER ──────────────────────────────────────────

export async function buildUserContext(userId) {
  const today = format(new Date(), 'yyyy-MM-dd')

  const [profileRes, instancesRes, penaltiesRes] = await Promise.all([
    supabase.from('profiles').select(
      'username, coach_mode, total_streak, discipline_score, avg_sleep_hours, energy_level, timezone'
    ).eq('id', userId).single(),

    supabase.from('daily_task_instances')
      .select('status, one_off_title, task:tasks(title, scheduled_time, duration_mins)')
      .eq('user_id', userId)
      .eq('date', today),

    supabase.from('penalties')
      .select('description, due_date, escalation_level')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .limit(3)
  ])

  const profile   = profileRes.data
  const instances = instancesRes.data ?? []
  const penalties = penaltiesRes.data ?? []

  // Format task list for prompt
  const taskList = instances.map(i => {
    const title = i.task?.title ?? i.one_off_title ?? 'Task'
    const time  = i.task?.scheduled_time?.slice(0, 5) ?? '--:--'
    return `  • ${title} (${time}) — ${i.status.toUpperCase()}`
  }).join('\n')

  const completedCount = instances.filter(i => i.status === 'completed').length
  const totalCount     = instances.length
  const rate           = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  const now = new Date()
  const localTime = now.toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true,
    timeZone: profile?.timezone ?? 'Asia/Kolkata'
  })

  return {
    username:       profile?.username ?? 'User',
    coachMode:      profile?.coach_mode ?? 'balanced',
    streak:         profile?.total_streak ?? 0,
    score:          Math.round(profile?.discipline_score ?? 0),
    sleepHrs:       profile?.avg_sleep_hours ?? 7,
    energy:         profile?.energy_level ?? 3,
    localTime,
    today,
    taskList:       taskList || '  • No tasks scheduled',
    completionRate: rate,
    penaltyCount:   penalties.length,
    penaltyText:    penalties.map(p => `  • ${p.description}`).join('\n') || '  • None'
  }
}
