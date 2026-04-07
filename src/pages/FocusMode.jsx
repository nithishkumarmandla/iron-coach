import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useStore } from '../store/useStore'
import { supabase } from '../lib/supabase'
import { useTimer, formatTime } from '../hooks/useTimer'
import { startTimer, endTimer, logEvent } from '../lib/tasks'
import { saveTimerProof, validateTimerLocally } from '../lib/proofs'

// ─── Flip clock digit ─────────────────────────────────────────
function FlipDigit({ value }) {
  const [display, setDisplay] = useState(value)
  const [flipping, setFlipping] = useState(false)
  const prev = useRef(value)

  useEffect(() => {
    if (value !== prev.current) {
      setFlipping(true)
      const t = setTimeout(() => {
        setDisplay(value)
        setFlipping(false)
        prev.current = value
      }, 300)
      return () => clearTimeout(t)
    }
  }, [value])

  return (
    <div style={{
      width: 54, height: 70, background: '#111',
      borderRadius: 8, display: 'flex', alignItems: 'center',
      justifyContent: 'center', position: 'relative', overflow: 'hidden'
    }}>
      <span style={{
        fontSize: 46, fontWeight: 700, color: '#ccc', lineHeight: 1,
        display: 'block',
        transform: flipping ? 'rotateX(-90deg)' : 'rotateX(0)',
        transition: flipping ? 'transform 0.3s ease-in' : 'none'
      }}>
        {display}
      </span>
      {/* centre divider line */}
      <div style={{
        position: 'absolute', top: '50%', left: 0, right: 0,
        height: 1, background: '#2a2a2a', pointerEvents: 'none'
      }} />
    </div>
  )
}

function FlipClock() {
  const [time, setTime] = useState({ h: '00', m: '00', s: '00', ampm: 'AM' })

  useEffect(() => {
    function tick() {
      const now = new Date()
      const h = now.getHours()
      setTime({
        h:    String(h % 12 || 12).padStart(2, '0'),
        m:    String(now.getMinutes()).padStart(2, '0'),
        s:    String(now.getSeconds()).padStart(2, '0'),
        ampm: h < 12 ? 'AM' : 'PM'
      })
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  const sep = (
    <span style={{ fontSize: 36, fontWeight: 700, color: '#444', marginBottom: 4 }}>:</span>
  )

  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 11, color: '#444', marginBottom: 6, letterSpacing: '0.1em' }}>
        {time.ampm}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
        <div>
          <FlipDigit value={time.h} />
          <div style={{ fontSize: 9, color: '#333', textAlign: 'center', marginTop: 3 }}>HR</div>
        </div>
        {sep}
        <div>
          <FlipDigit value={time.m} />
          <div style={{ fontSize: 9, color: '#333', textAlign: 'center', marginTop: 3 }}>MIN</div>
        </div>
        {sep}
        <div>
          <FlipDigit value={time.s} />
          <div style={{ fontSize: 9, color: '#333', textAlign: 'center', marginTop: 3 }}>SEC</div>
        </div>
      </div>
    </div>
  )
}

// ─── Main Focus Mode page ──────────────────────────────────────
export default function FocusMode() {
  const { instanceId } = useParams()
  const navigate = useNavigate()
  const { user } = useStore()

  const [instance, setInstance] = useState(null)
  const [loading, setLoading]   = useState(true)
  const [started, setStarted]   = useState(false)
  const [ending, setEnding]     = useState(false)

  // Load instance + task
  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from('daily_task_instances')
        .select('*, task:tasks(title, duration_mins, proof_type, scheduled_time)')
        .eq('id', instanceId)
        .single()
      if (error) { toast.error('Task not found'); navigate('/'); return }
      setInstance(data)
      setLoading(false)
    }
    load()
  }, [instanceId, navigate])

  const durationSecs = (instance?.task?.duration_mins ?? 60) * 60
  const timer = useTimer(durationSecs, instanceId)

  // Auto-start if task was already in_progress
  useEffect(() => {
    if (!instance) return
    if (instance.status === 'in_progress' && instance.timer_started_at && !started) {
      timer.start()
      setStarted(true)
    }
  }, [instance])

  // Sound: 5-min warning + completion
  useEffect(() => {
    if (timer.remaining === 300) playWarning()
    if (timer.finished) handleTimerComplete()
  }, [timer.remaining, timer.finished])

  function playTone(freq, dur, type = 'sine') {
    try {
      const ctx = new AudioContext()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.type = type; osc.frequency.value = freq
      gain.gain.setValueAtTime(0.3, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur)
      osc.start(); osc.stop(ctx.currentTime + dur)
    } catch {}
  }

  function playWarning() {
    playTone(660, 0.3); setTimeout(() => playTone(660, 0.3), 400)
  }

  function playComplete() {
    [523, 659, 784, 1047].forEach((f, i) =>
      setTimeout(() => playTone(f, 0.4), i * 150))
  }

  async function handleStart() {
    try {
      await startTimer(instanceId)
      timer.start()
      setStarted(true)
      await logEvent(user.id, 'timer_started', { instanceId })
    } catch {
      toast.error('Failed to start timer')
    }
  }

  async function handleTimerComplete() {
    playComplete()
    // Determine if proof type is timer-only
    const proofTypes = instance?.task?.proof_type ?? ['photo']
    const needsPhoto = proofTypes.includes('photo') || proofTypes.includes('both')

    const activeSecs = timer.activeSeconds()
    const validation = validateTimerLocally(
      instance.timer_started_at,
      new Date().toISOString(),
      activeSecs
    )

    try {
      await endTimer(instanceId, activeSecs, !needsPhoto)
      await saveTimerProof(user.id, instanceId, activeSecs, validation.valid)
      await logEvent(user.id, 'timer_completed', { instanceId, activeSecs, valid: validation.valid })
    } catch { /* non-blocking */ }

    if (needsPhoto) {
      toast.success('Timer done! Now submit your proof photo.')
      navigate(`/proof/${instanceId}`)
    } else {
      toast.success('Task complete!')
      navigate('/')
    }
  }

  async function handleAbandon() {
    if (!confirm('Abandon this task? It will be marked failed.')) return
    setEnding(true)
    try {
      const activeSecs = timer.activeSeconds()
      timer.stop()
      await endTimer(instanceId, activeSecs, false)
      await logEvent(user.id, 'timer_abandoned', { instanceId, activeSecs })
      toast.error('Task abandoned — marked failed')
      navigate('/')
    } catch {
      toast.error('Error ending task')
    } finally {
      setEnding(false)
    }
  }

  if (loading) return <div style={{ background: '#000', height: '100vh' }}><div className="spinner" /></div>

  const title     = instance?.task?.title ?? instance?.one_off_title ?? 'Task'
  const isWarning = timer.remaining <= 300 && timer.remaining > 0 && started
  const isAlmost  = timer.remaining <= 60 && timer.remaining > 0

  return (
    <div style={{
      height: '100vh', background: '#000', display: 'flex',
      flexDirection: 'column', alignItems: 'center',
      justifyContent: 'space-between', padding: '48px 24px 36px',
      maxWidth: 480, margin: '0 auto'
    }}>
      {/* Top — task label */}
      <div style={{ textAlign: 'center', width: '100%' }}>
        <p style={{ fontSize: 12, color: '#333', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
          FOCUS MODE
        </p>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: '#e0e0e0' }}>{title}</h2>
      </div>

      {/* Middle — task countdown timer */}
      <div style={{ textAlign: 'center' }}>
        <div style={{
          fontSize: 72, fontWeight: 700, letterSpacing: -2,
          color: isAlmost ? '#ef4444' : isWarning ? '#f59e0b' : '#e0e0e0',
          fontVariantNumeric: 'tabular-nums',
          transition: 'color 0.5s'
        }}>
          {formatTime(started ? timer.remaining : durationSecs)}
        </div>
        <p style={{ fontSize: 13, color: '#333', marginTop: 6 }}>
          {started
            ? isWarning ? '⚠ Almost done — keep going' : 'remaining'
            : `${instance?.task?.duration_mins ?? 60} minutes required`}
        </p>

        {/* Progress bar */}
        {started && (
          <div style={{ width: 200, height: 3, background: '#1a1a1a', borderRadius: 2, margin: '16px auto 0', overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 2,
              background: isAlmost ? '#ef4444' : '#4ade80',
              width: `${Math.round(timer.progress * 100)}%`,
              transition: 'width 1s linear, background 0.5s'
            }} />
          </div>
        )}
      </div>

      {/* Flip clock — real time */}
      <FlipClock />

      {/* Bottom — action buttons */}
      <div style={{ width: '100%' }}>
        {!started ? (
          <button className="btn btn-primary" onClick={handleStart} style={{ fontSize: 16, padding: '14px 0' }}>
            Start timer
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={timer.running ? timer.pause : timer.start}
              style={{
                flex: 2, padding: '13px 0', fontSize: 15, fontWeight: 500,
                background: 'var(--bg2)', border: '1px solid var(--border)',
                borderRadius: 8, color: 'var(--text)', cursor: 'pointer'
              }}
            >
              {timer.running ? 'Pause' : 'Resume'}
            </button>
            <button
              onClick={handleAbandon}
              disabled={ending}
              style={{
                flex: 1, padding: '13px 0', fontSize: 14,
                background: 'var(--danger-dim)', border: '1px solid var(--danger)',
                borderRadius: 8, color: 'var(--danger)', cursor: 'pointer'
              }}
            >
              Abandon
            </button>
          </div>
        )}

        {started && (
          <p style={{ fontSize: 11, color: '#333', textAlign: 'center', marginTop: 10 }}>
            Do not leave this screen — timer pauses if you switch apps
          </p>
        )}

        {/* Body double mode */}
        {started && (
          <button
            onClick={() => navigate(`/body-double?instanceId=${instanceId}`)}
            style={{
              background: 'none', border: '1px solid #2a2a2a',
              borderRadius: 8, color: '#444', fontSize: 12,
              padding: '8px 0', cursor: 'pointer', marginTop: 8, width: '100%'
            }}
          >
            Enable body double mode (AI checks in every 15 min)
          </button>
        )}
      </div>
    </div>
  )
}
