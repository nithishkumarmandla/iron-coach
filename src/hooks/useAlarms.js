import { useState, useEffect, useRef, useCallback } from 'react'
import { format } from 'date-fns'
import { sound } from '../lib/sound'

/**
 * useAlarms
 * Takes today's task instances and:
 * 1. Schedules setTimeout alarms for each task's scheduled_time
 * 2. Returns live countdown strings updated every 30 seconds
 *
 * @param {Array} instances  — today's daily_task_instances with task joined
 * @param {Function} onAlarm — called when an alarm fires: (instance) => void
 */
export function useAlarms(instances, onAlarm) {
  const [countdowns, setCountdowns] = useState({})  // { instanceId: "Ring in 2h 30m" }
  const timerIds = useRef([])

  // Build countdown text for a scheduled_time string "HH:MM:SS"
  function buildCountdown(scheduledTime) {
    if (!scheduledTime) return null

    const [h, m] = scheduledTime.split(':').map(Number)
    const now    = new Date()
    const target = new Date(now)
    target.setHours(h, m, 0, 0)

    // If time already passed today → show for tomorrow
    if (target <= now) target.setDate(target.getDate() + 1)

    const diffMs   = target - now
    const diffMins = Math.round(diffMs / 60000)

    if (diffMins < 1)  return 'Ringing now'
    if (diffMins < 60) return `Ring in ${diffMins}m`

    const hrs  = Math.floor(diffMins / 60)
    const mins = diffMins % 60
    if (mins === 0) return `Ring in ${hrs}h`
    return `Ring in ${hrs}h ${mins}m`
  }

  // Recalculate all countdowns
  const refreshCountdowns = useCallback(() => {
    const next = {}
    for (const inst of instances) {
      const time = inst.task?.scheduled_time
      if (time && inst.status === 'pending') {
        next[inst.id] = buildCountdown(time)
      }
    }
    setCountdowns(next)
  }, [instances])

  // Schedule alarms for pending tasks
  useEffect(() => {
    // Clear previous alarms
    timerIds.current.forEach(clearTimeout)
    timerIds.current = []

    const now = new Date()

    for (const inst of instances) {
      if (inst.status !== 'pending') continue
      const time = inst.task?.scheduled_time
      if (!time) continue

      const [h, m] = time.split(':').map(Number)
      const due    = new Date(now)
      due.setHours(h, m, 0, 0)

      if (due <= now) continue  // already passed

      const warn = new Date(due.getTime() - 5 * 60 * 1000)

      // 5-minute warning
      const msWarn = warn - now
      if (msWarn > 0) {
        timerIds.current.push(setTimeout(() => {
          sound.warning()
          onAlarm?.({ type: 'warning', instance: inst })
        }, msWarn))
      }

      // Task due alarm
      const msDue = due - now
      timerIds.current.push(setTimeout(() => {
        sound.alarm()
        onAlarm?.({ type: 'due', instance: inst })
        // Trigger push notification if PWA
        sendPushNotification(
          `⏰ ${inst.task?.title ?? 'Task'} is due now`,
          'Tap to open the timer'
        )
      }, msDue))
    }

    // Refresh countdowns immediately then every 30 seconds
    refreshCountdowns()
    const intervalId = setInterval(refreshCountdowns, 30000)

    return () => {
      timerIds.current.forEach(clearTimeout)
      clearInterval(intervalId)
    }
  }, [instances, onAlarm, refreshCountdowns])

  return { countdowns }
}

// ── Push notification helper ───────────────────────────────────
export function sendPushNotification(title, body, tag = 'task-alarm') {
  if (!('Notification' in window)) return
  if (Notification.permission !== 'granted') return

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then(reg => {
      reg.showNotification(title, {
        body,
        icon:    '/icons/icon-192.png',
        badge:   '/icons/icon-192.png',
        tag,
        renotify: true,
        vibrate: [200, 100, 200, 100, 400]
      })
    }).catch(() => {})
  } else {
    new Notification(title, { body, icon: '/icons/icon-192.png' })
  }
}

// ── Request push permission (called once on first login) ───────
export async function requestPushPermission() {
  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied')  return false

  const result = await Notification.requestPermission()
  return result === 'granted'
}
