import { supabase } from './supabase'
import { format } from 'date-fns'

// ─── READ ─────────────────────────────────────────────────────

export async function getPenalties(userId, statusFilter = null) {
  let query = supabase
    .from('penalties')
    .select(`
      *,
      instance:daily_task_instances(
        date,
        task:tasks(title)
      )
    `)
    .eq('user_id', userId)
    .order('due_date', { ascending: true })

  if (statusFilter) query = query.eq('status', statusFilter)

  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function getPenaltyById(id) {
  const { data, error } = await supabase
    .from('penalties')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

// ─── COMPLETE ─────────────────────────────────────────────────

export async function completePenalty(id, proofId = null) {
  const { error } = await supabase
    .from('penalties')
    .update({
      status:       'completed',
      completed_at: new Date().toISOString(),
      proof_id:     proofId
    })
    .eq('id', id)
  if (error) throw error
}

// ─── EMERGENCY ────────────────────────────────────────────────

export async function createEmergencyRequest(userId, instanceId, reason) {
  const { data, error } = await supabase
    .from('emergency_events')
    .insert({ user_id: userId, instance_id: instanceId, reason })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

export async function resolveEmergency(emergencyId, approved, aiVerdict, abuseFlag) {
  const { error } = await supabase
    .from('emergency_events')
    .update({ approved, ai_verdict: aiVerdict, abuse_flag: abuseFlag })
    .eq('id', emergencyId)
  if (error) throw error
}

export async function shiftInstance(instanceId, toDate) {
  const { error } = await supabase
    .from('daily_task_instances')
    .update({ status: 'emergency_shifted', shifted_to_date: toDate })
    .eq('id', instanceId)
  if (error) throw error
}

// Lazy monthly reset + increment
export async function useEmergency(userId) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('emergency_used, emergency_limit, emergency_reset_date, timezone')
    .eq('id', userId)
    .single()

  if (!profile) throw new Error('Profile not found')

  const now        = new Date()
  const resetMonth = profile.emergency_reset_date
    ? new Date(profile.emergency_reset_date).getMonth()
    : -1

  let used = profile.emergency_used

  // Reset if new month
  if (now.getMonth() !== resetMonth) {
    used = 0
    await supabase.from('profiles').update({
      emergency_used:       0,
      emergency_reset_date: format(now, 'yyyy-MM-dd')
    }).eq('id', userId)
  }

  if (used >= (profile.emergency_limit ?? 2)) {
    throw new Error(`Emergency limit reached (${profile.emergency_limit}/month)`)
  }

  // Increment
  await supabase.from('profiles')
    .update({ emergency_used: used + 1 })
    .eq('id', userId)

  return { used: used + 1, limit: profile.emergency_limit ?? 2 }
}

// ─── WEEKLY CONTRACT ──────────────────────────────────────────

export async function getThisWeekContract(userId) {
  const weekStart = getMonday(new Date())
  const { data } = await supabase
    .from('weekly_reports')
    .select('id, ai_analysis, schedule_changes, generated_at')
    .eq('user_id', userId)
    .eq('week_start', weekStart)
    .single()
  return data
}

export async function acceptContract(reportId) {
  const { error } = await supabase
    .from('weekly_reports')
    .update({ schedule_changes: { accepted: true, accepted_at: new Date().toISOString() } })
    .eq('id', reportId)
  if (error) throw error
}

function getMonday(date) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return format(d, 'yyyy-MM-dd')
}
