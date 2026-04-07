import { supabase } from './supabase'
import { format } from 'date-fns'

// ─── TASKS (templates) ─────────────────────────────────────────

export async function getTasks(userId) {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('sort_order')
  if (error) throw error
  return data
}

export async function createTask(userId, task) {
  const { data, error } = await supabase
    .from('tasks')
    .insert({ ...task, user_id: userId })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateTask(id, updates) {
  const { error } = await supabase
    .from('tasks')
    .update(updates)
    .eq('id', id)
  if (error) throw error
}

export async function deleteTask(id) {
  const { error } = await supabase
    .from('tasks')
    .update({ is_active: false })
    .eq('id', id)
  if (error) throw error
}

// ─── DAILY INSTANCES ──────────────────────────────────────────

export async function getTodayInstances(userId) {
  const today = format(new Date(), 'yyyy-MM-dd')
  const { data, error } = await supabase
    .from('daily_task_instances')
    .select(`
      *,
      task:tasks(title, category, scheduled_time, duration_mins, proof_type, task_type)
    `)
    .eq('user_id', userId)
    .eq('date', today)
    .order('created_at')
  if (error) throw error
  return data
}

export async function getInstancesForDate(userId, date) {
  const { data, error } = await supabase
    .from('daily_task_instances')
    .select(`
      *,
      task:tasks(title, category, scheduled_time, duration_mins, proof_type)
    `)
    .eq('user_id', userId)
    .eq('date', date)
    .order('created_at')
  if (error) throw error
  return data
}

export async function updateInstanceStatus(id, status) {
  const { error } = await supabase
    .from('daily_task_instances')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

// ─── TIMER ────────────────────────────────────────────────────

export async function startTimer(instanceId) {
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('daily_task_instances')
    .update({
      status: 'in_progress',
      timer_started_at: now,
      updated_at: now
    })
    .eq('id', instanceId)
  if (error) throw error
}

export async function endTimer(instanceId, activeSeconds, completed) {
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('daily_task_instances')
    .update({
      status: completed ? 'completed' : 'failed',
      timer_ended_at: now,
      active_seconds: activeSeconds,
      updated_at: now
    })
    .eq('id', instanceId)
  if (error) throw error
}

// ─── PENALTIES (read only in Phase 1) ────────────────────────

export async function getActivePenalties(userId) {
  const today = format(new Date(), 'yyyy-MM-dd')
  const { data, error } = await supabase
    .from('penalties')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .lte('due_date', today)
  if (error) throw error
  return data ?? []
}

// ─── PROFILE ─────────────────────────────────────────────────

export async function getProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('total_streak, discipline_score, level_title, xp_total')
    .eq('id', userId)
    .single()
  if (error) throw error
  return data
}

// ─── BEHAVIOR LOG ─────────────────────────────────────────────

export async function logEvent(userId, eventType, metadata = {}) {
  await supabase.from('behavior_logs').insert({
    user_id: userId,
    event_type: eventType,
    metadata
  })
  // Fire and forget — don't block UI on logging
}
