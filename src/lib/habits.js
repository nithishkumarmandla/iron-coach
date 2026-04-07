import { supabase } from './supabase'
import { format, subDays } from 'date-fns'

// ─── HABITS (templates) ────────────────────────────────────────

export async function getHabits(userId) {
  const { data, error } = await supabase
    .from('habits')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('sort_order')
  if (error) throw error
  return data ?? []
}

export async function createHabit(userId, habit) {
  const { data, error } = await supabase
    .from('habits')
    .insert({ ...habit, user_id: userId })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateHabit(id, updates) {
  const { error } = await supabase
    .from('habits')
    .update(updates)
    .eq('id', id)
  if (error) throw error
}

export async function deleteHabit(id) {
  const { error } = await supabase
    .from('habits')
    .update({ is_active: false })
    .eq('id', id)
  if (error) throw error
}

// ─── COMPLETIONS ───────────────────────────────────────────────

export async function getTodayCompletions(userId) {
  const today = format(new Date(), 'yyyy-MM-dd')
  const { data, error } = await supabase
    .from('habit_completions')
    .select('*, habit:habits(title, icon, color, proof_type, habit_type)')
    .eq('user_id', userId)
    .eq('date', today)
  if (error) throw error
  return data ?? []
}

export async function completeHabit(userId, habitId, value = null, notes = null) {
  const today = format(new Date(), 'yyyy-MM-dd')

  // Upsert — update if exists, insert if not
  const { data, error } = await supabase
    .from('habit_completions')
    .upsert({
      habit_id:     habitId,
      user_id:      userId,
      date:         today,
      status:       'completed',
      value,
      notes,
      completed_at: new Date().toISOString()
    }, { onConflict: 'habit_id,date' })
    .select('id')
    .single()

  if (error) throw error

  // Update streak on the habit
  await recalcStreak(habitId, userId)
  return data.id
}

export async function uncompleteHabit(userId, habitId) {
  const today = format(new Date(), 'yyyy-MM-dd')
  const { error } = await supabase
    .from('habit_completions')
    .update({ status: 'pending', completed_at: null })
    .eq('habit_id', habitId)
    .eq('user_id', userId)
    .eq('date', today)
  if (error) throw error
  await recalcStreak(habitId, userId)
}

// Recalculate streak for a habit — call after any completion change
async function recalcStreak(habitId, userId) {
  const { data: recents } = await supabase
    .from('habit_completions')
    .select('date, status')
    .eq('habit_id', habitId)
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(365)

  if (!recents) return

  let streak = 0
  const today = format(new Date(), 'yyyy-MM-dd')

  for (let i = 0; i < recents.length; i++) {
    const expected = format(subDays(new Date(today), i), 'yyyy-MM-dd')
    const rec = recents.find(r => r.date === expected)
    if (rec?.status === 'completed') {
      streak++
    } else {
      break
    }
  }

  const total = recents.filter(r => r.status === 'completed').length

  // Get current longest
  const { data: habit } = await supabase
    .from('habits')
    .select('longest_streak')
    .eq('id', habitId)
    .single()

  await supabase.from('habits').update({
    current_streak:   streak,
    longest_streak:   Math.max(streak, habit?.longest_streak ?? 0),
    total_completions: total
  }).eq('id', habitId)
}

// ─── HEATMAP DATA ──────────────────────────────────────────────

// Returns 365 days of daily completion rates for the heatmap grid
export async function getHeatmapData(userId, habitId = null) {
  const endDate   = format(new Date(), 'yyyy-MM-dd')
  const startDate = format(subDays(new Date(), 364), 'yyyy-MM-dd')

  let query = supabase
    .from('habit_completions')
    .select('date, status, habit_id')
    .eq('user_id', userId)
    .gte('date', startDate)
    .lte('date', endDate)

  if (habitId) query = query.eq('habit_id', habitId)

  const { data, error } = await query
  if (error) throw error

  // Aggregate by date: count completed / total scheduled
  const byDate = {}
  for (const row of data ?? []) {
    if (!byDate[row.date]) byDate[row.date] = { completed: 0, total: 0 }
    byDate[row.date].total++
    if (row.status === 'completed') byDate[row.date].completed++
  }

  // Build full 365-day array
  const result = []
  for (let i = 364; i >= 0; i--) {
    const date = format(subDays(new Date(), i), 'yyyy-MM-dd')
    const day  = byDate[date]
    result.push({
      date,
      rate:      day ? day.completed / day.total : 0,
      completed: day?.completed ?? 0,
      total:     day?.total ?? 0
    })
  }
  return result
}

// ─── HISTORY ──────────────────────────────────────────────────

// Get habit completions for a specific past date
export async function getCompletionsForDate(userId, date) {
  const { data, error } = await supabase
    .from('habit_completions')
    .select('*, habit:habits(title, icon, color)')
    .eq('user_id', userId)
    .eq('date', date)
  if (error) throw error
  return data ?? []
}

// ─── ENSURE TODAY'S COMPLETIONS EXIST ─────────────────────────
// Called on app load — creates pending rows for habits not yet generated today
export async function ensureTodayCompletions(userId) {
  const today   = format(new Date(), 'yyyy-MM-dd')
  const dayNum  = new Date().getDay() === 0 ? 7 : new Date().getDay()

  const habits = await getHabits(userId)
  const scheduledToday = habits.filter(h =>
    h.frequency === 'daily' ||
    (h.frequency === 'weekdays' && dayNum <= 5) ||
    (h.frequency === 'weekends' && dayNum >= 6) ||
    (h.frequency === 'custom' && (h.days_of_week ?? []).includes(dayNum))
  )

  if (scheduledToday.length === 0) return

  const rows = scheduledToday.map(h => ({
    habit_id: h.id,
    user_id:  userId,
    date:     today,
    status:   'pending'
  }))

  // ignoreDuplicates: true — safe to call multiple times
  await supabase
    .from('habit_completions')
    .upsert(rows, { onConflict: 'habit_id,date', ignoreDuplicates: true })
}
