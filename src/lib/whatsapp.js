import { supabase } from './supabase'

/**
 * Send a WhatsApp message to the current user via Twilio.
 * Calls the whatsapp-send Edge Function (server-side Twilio call).
 * @param {string} message  — plain text message
 * @param {string} type     — message_type for dedup log
 * @param {string} refId    — optional reference id (task/penalty id)
 */
export async function sendWhatsApp(message, type = 'manual', refId = null) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')

  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-send`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ message, type, refId })
    }
  )

  const data = await res.json()
  if (!data.ok) throw new Error(data.error ?? 'WhatsApp send failed')
  return data
}

// ─── Performance data queries ─────────────────────────────────

export async function get30DayStats(userId) {
  const endDate   = new Date()
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - 29)

  const fmt = (d) => d.toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('daily_task_instances')
    .select('date, status')
    .eq('user_id', userId)
    .gte('date', fmt(startDate))
    .lte('date', fmt(endDate))

  if (error) throw error

  // Group by date
  const byDate = {}
  for (const row of data ?? []) {
    if (!byDate[row.date]) byDate[row.date] = { completed: 0, total: 0 }
    byDate[row.date].total++
    if (row.status === 'completed') byDate[row.date].completed++
  }

  // Build 30-day array for chart
  const result = []
  for (let i = 29; i >= 0; i--) {
    const d    = new Date()
    d.setDate(d.getDate() - i)
    const date = fmt(d)
    const day  = byDate[date]
    result.push({
      date,
      label:    d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
      rate:     day ? Math.round((day.completed / day.total) * 100) : 0,
      completed: day?.completed ?? 0,
      total:    day?.total ?? 0
    })
  }
  return result
}

export async function getWeeklyReports(userId, limit = 8) {
  const { data, error } = await supabase
    .from('weekly_reports')
    .select('*')
    .eq('user_id', userId)
    .order('week_start', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data ?? []
}

export async function getCategoryBreakdown(userId) {
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - 29)
  const fmt = (d) => d.toISOString().split('T')[0]

  const { data } = await supabase
    .from('daily_task_instances')
    .select('status, task:tasks(category)')
    .eq('user_id', userId)
    .gte('date', fmt(startDate))

  const cats = {}
  for (const row of data ?? []) {
    const cat = row.task?.category ?? 'custom'
    if (!cats[cat]) cats[cat] = { completed: 0, total: 0 }
    cats[cat].total++
    if (row.status === 'completed') cats[cat].completed++
  }

  return Object.entries(cats).map(([cat, s]) => ({
    category: cat.replace('_', ' '),
    rate:     s.total ? Math.round((s.completed / s.total) * 100) : 0,
    completed: s.completed,
    total:    s.total
  })).sort((a, b) => b.total - a.total)
}
