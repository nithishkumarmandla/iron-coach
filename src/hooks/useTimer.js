import { useState, useEffect, useRef, useCallback } from 'react'

const STORAGE_KEY = 'iron_coach_active_timer'

// Saves timer state to localStorage (crash recovery only)
function saveToStorage(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

function clearStorage() {
  localStorage.removeItem(STORAGE_KEY)
}

export function getOrphanedTimer() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const state = JSON.parse(raw)
    // Calculate elapsed even if app was closed
    const elapsedSeconds = Math.floor(
      (Date.now() - state.startTimestamp - state.totalPausedMs) / 1000
    )
    return { ...state, elapsedSeconds }
  } catch {
    return null
  }
}

export function clearOrphanedTimer() {
  clearStorage()
}

/**
 * useTimer — timestamp-based timer
 *
 * @param {number} targetSeconds - required duration (from task.duration_mins * 60)
 * @param {string} instanceId    - for localStorage key
 * @returns timer state and controls
 */
export function useTimer(targetSeconds, instanceId) {
  const [elapsed, setElapsed] = useState(0)
  const [running, setRunning] = useState(false)
  const [finished, setFinished] = useState(false)

  // Internal refs — not state (no re-render on change)
  const startTimestamp = useRef(null)     // absolute ms when started
  const totalPausedMs  = useRef(0)        // accumulated pause time
  const pausedAt       = useRef(null)     // ms when last paused
  const rafId          = useRef(null)     // requestAnimationFrame id

  // Calculate current elapsed seconds from timestamps
  const calcElapsed = useCallback(() => {
    if (!startTimestamp.current) return 0
    const pauseOffset = pausedAt.current
      ? Date.now() - pausedAt.current
      : 0
    return Math.floor(
      (Date.now() - startTimestamp.current - totalPausedMs.current - pauseOffset) / 1000
    )
  }, [])

  // RAF loop — only for display updates
  const tick = useCallback(() => {
    const secs = calcElapsed()
    setElapsed(secs)
    if (secs >= targetSeconds) {
      setRunning(false)
      setFinished(true)
      clearStorage()
      return
    }
    rafId.current = requestAnimationFrame(tick)
  }, [calcElapsed, targetSeconds])

  // Start timer
  const start = useCallback(() => {
    if (running) return
    const now = Date.now()

    if (!startTimestamp.current) {
      // Fresh start
      startTimestamp.current = now
    } else {
      // Resuming from pause
      if (pausedAt.current) {
        totalPausedMs.current += now - pausedAt.current
        pausedAt.current = null
      }
    }

    setRunning(true)

    // Persist to localStorage
    saveToStorage({
      instanceId,
      startTimestamp: startTimestamp.current,
      totalPausedMs: totalPausedMs.current,
      targetSeconds,
      pausedAt: null
    })

    rafId.current = requestAnimationFrame(tick)
  }, [running, instanceId, targetSeconds, tick])

  // Pause timer
  const pause = useCallback(() => {
    if (!running) return
    pausedAt.current = Date.now()
    setRunning(false)
    cancelAnimationFrame(rafId.current)

    saveToStorage({
      instanceId,
      startTimestamp: startTimestamp.current,
      totalPausedMs: totalPausedMs.current,
      targetSeconds,
      pausedAt: pausedAt.current
    })
  }, [running, instanceId, targetSeconds])

  // Stop and discard
  const stop = useCallback(() => {
    setRunning(false)
    setElapsed(0)
    setFinished(false)
    startTimestamp.current = null
    totalPausedMs.current = 0
    pausedAt.current = null
    cancelAnimationFrame(rafId.current)
    clearStorage()
  }, [])

  // Handle visibility change (screen lock / app switch)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        // App going to background — pause RAF (timer calc still correct on return)
        cancelAnimationFrame(rafId.current)
      } else {
        // App returning — recalculate from timestamps and restart RAF
        if (running) {
          const secs = calcElapsed()
          setElapsed(secs)
          if (secs < targetSeconds) {
            rafId.current = requestAnimationFrame(tick)
          } else {
            setRunning(false)
            setFinished(true)
          }
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [running, calcElapsed, targetSeconds, tick])

  // Cleanup on unmount
  useEffect(() => {
    return () => cancelAnimationFrame(rafId.current)
  }, [])

  const progress = targetSeconds > 0 ? Math.min(elapsed / targetSeconds, 1) : 0
  const remaining = Math.max(targetSeconds - elapsed, 0)

  return {
    elapsed,
    remaining,
    progress,
    running,
    finished,
    start,
    pause,
    stop,
    activeSeconds: calcElapsed
  }
}

// Format seconds as MM:SS or HH:MM:SS
export function formatTime(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
