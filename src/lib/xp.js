import { supabase } from './supabase'

const XP_REWARDS = {
  task_completed:      10,
  task_on_time:         5,   // bonus if completed within 30 min of scheduled_time
  penalty_completed:    8,
  habit_completed:      3,
  perfect_day:         50,   // all tasks done
  streak_milestone:    25    // every 7-day streak milestone
}

const LEVEL_THRESHOLDS = [
  { level: 1, min: 0,    title: 'Recruit' },
  { level: 2, min: 500,  title: 'Soldier' },
  { level: 3, min: 1500, title: 'Warrior' },
  { level: 4, min: 3500, title: 'Elite' },
  { level: 5, min: 7000, title: 'Iron' }
]

function calcLevel(xp) {
  let current = LEVEL_THRESHOLDS[0]
  for (const tier of LEVEL_THRESHOLDS) {
    if (xp >= tier.min) current = tier
  }
  return current
}

/**
 * Award XP to a user and update level if changed.
 * Returns { newXP, levelUp, newTitle } for toast display.
 */
export async function awardXP(userId, reason) {
  const points = XP_REWARDS[reason] ?? 0
  if (points === 0) return null

  // Get current XP
  const { data: profile } = await supabase
    .from('profiles')
    .select('xp_total, level, level_title')
    .eq('id', userId)
    .single()

  if (!profile) return null

  const oldXP      = profile.xp_total ?? 0
  const newXP      = oldXP + points
  const oldLevel   = calcLevel(oldXP)
  const newLevel   = calcLevel(newXP)
  const didLevelUp = newLevel.level > oldLevel.level

  await supabase.from('profiles').update({
    xp_total:    newXP,
    level:       newLevel.level,
    level_title: newLevel.title
  }).eq('id', userId)

  return {
    points,
    newXP,
    levelUp:  didLevelUp,
    newTitle: didLevelUp ? newLevel.title : null
  }
}

/**
 * Check if today is a perfect day (all tasks completed) and award bonus XP.
 * Call after any task completion.
 */
export async function checkPerfectDay(userId) {
  const today = new Date().toISOString().split('T')[0]

  const { data: instances } = await supabase
    .from('daily_task_instances')
    .select('status')
    .eq('user_id', userId)
    .eq('date', today)

  if (!instances || instances.length === 0) return

  const allDone = instances.every(i => i.status === 'completed')
  if (allDone) {
    await awardXP(userId, 'perfect_day')
  }
}