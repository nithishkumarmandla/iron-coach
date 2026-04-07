import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useStore } from '../store/useStore'
import { supabase } from '../lib/supabase'
import { sound } from '../lib/sound'

const CHECK_INTERVAL_MS = 15 * 60 * 1000  // 15 minutes

export default function BodyDouble() {
  const { user }   = useStore()
  const navigate   = useNavigate()
  const [params]   = useSearchParams()
  const instanceId = params.get('instanceId')

  const [taskTitle, setTaskTitle]   = useState('')
  const [checkCount, setCheckCount] = useState(0)
  const [log, setLog]               = useState([])        // { time, summary }
  const [input, setInput]           = useState('')
  const [waiting, setWaiting]       = useState(true)      // waiting for next check-in
  const [timeToNext, setTimeToNext] = useState(CHECK_INTERVAL_MS)
  const [sending, setSending]       = useState(false)

  const intervalRef  = useRef(null)
  const countdownRef = useRef(null)
  const startedAt    = useRef(Date.now())

  // Load task info
  useEffect(() => {
    if (!instanceId) return
    supabase
      .from('daily_task_instances')
      .select('task:tasks(title)')
      .eq('id', instanceId)
      .single()
      .then(({ data }) => setTaskTitle(data?.task?.title ?? 'Task'))
  }, [instanceId])

  // Set up 15-minute check-in cycle
  useEffect(() => {
    // Countdown display — updates every second
    countdownRef.current = setInterval(() => {
      const elapsed = Date.now() - startedAt.current
      const lastCheck = checkCount * CHECK_INTERVAL_MS
      const nextCheck = lastCheck + CHECK_INTERVAL_MS
      const remaining = Math.max(0, nextCheck - elapsed)
      setTimeToNext(remaining)

      if (remaining === 0 && waiting) {
        triggerCheckIn()
      }
    }, 1000)

    return () => {
      clearInterval(intervalRef.current)
      clearInterval(countdownRef.current)
    }
  }, [checkCount, waiting])

  function triggerCheckIn() {
    setWaiting(false)
    sound.tick()
    sound.nudge()
  }

  async function handleSubmit() {
    if (!input.trim()) return toast.error('Describe what you accomplished')
    setSending(true)

    const summary = input.trim()
    const time    = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })

    // Get AI acknowledgement
    let aiReply = 'Good. Keep going.'
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-coach`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            userId: user.id,
            userMessage: `[Body double check-in ${checkCount + 1}] Working on: ${taskTitle}. Last 15 min: ${summary}`,
            sessionType: 'body_double'
          })
        }
      )
      const data = await res.json()
      if (data.reply) aiReply = data.reply
    } catch { /* use default */ }

    setLog(prev => [...prev, { time, summary, aiReply }])
    setCheckCount(c => c + 1)
    setInput('')
    setWaiting(true)
    startedAt.current = Date.now()
    setSending(false)
  }

  // Format countdown MM:SS
  const mins = Math.floor(timeToNext / 60000)
  const secs = Math.floor((timeToNext % 60000) / 1000)
  const countdown = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`

  return (
    <div style={{
      height: '100vh', display: 'flex', flexDirection: 'column',
      background: 'var(--bg)', maxWidth: 480, margin: '0 auto'
    }}>
      {/* Header */}
      <div style={{
        padding: '16px', borderBottom: '1px solid var(--border)',
        background: 'var(--bg2)', flexShrink: 0
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 2 }}>BODY DOUBLE MODE</p>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>{taskTitle}</h2>
          </div>
          <button
            onClick={() => navigate(-1)}
            style={{
              background: 'var(--bg3)', border: '1px solid var(--border)',
              borderRadius: 8, padding: '8px 14px', fontSize: 13,
              color: 'var(--text2)', cursor: 'pointer'
            }}
          >
            Exit
          </button>
        </div>
      </div>

      {/* Check-in log */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {log.length === 0 && (
          <div style={{ textAlign: 'center', marginTop: 32 }}>
            <p style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 8 }}>
              Working session started
            </p>
            <p style={{ fontSize: 12, color: 'var(--text3)' }}>
              Your coach will check in every 15 minutes.
              Stay focused — no switching apps.
            </p>
          </div>
        )}

        {log.map((entry, i) => (
          <div key={i}>
            {/* User entry */}
            <div style={{
              background: 'var(--bg3)', borderRadius: '12px 12px 4px 12px',
              padding: '10px 13px', marginLeft: 32, marginBottom: 6
            }}>
              <p style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 3 }}>{entry.time}</p>
              <p style={{ fontSize: 13, color: 'var(--text)' }}>{entry.summary}</p>
            </div>
            {/* AI reply */}
            <div style={{
              display: 'flex', gap: 8, alignItems: 'flex-start'
            }}>
              <div style={{
                width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                background: 'var(--accent-dim)', border: '1px solid var(--accent)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13
              }}>🤖</div>
              <div style={{
                background: 'var(--bg2)', border: '1px solid var(--border)',
                borderRadius: '4px 12px 12px 12px', padding: '10px 13px', flex: 1
              }}>
                <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>{entry.aiReply}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Bottom — check-in input or countdown */}
      <div style={{
        padding: '12px 16px 24px', borderTop: '1px solid var(--border)',
        background: 'var(--bg2)', flexShrink: 0
      }}>
        {waiting ? (
          /* Countdown to next check-in */
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>
              Next check-in in
            </p>
            <p style={{ fontSize: 36, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
              {countdown}
            </p>
            <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
              Stay on task · Check-in {checkCount + 1} coming up
            </p>
          </div>
        ) : (
          /* Check-in prompt */
          <div>
            <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--accent)', marginBottom: 10 }}>
              ⏱ Check-in {checkCount + 1} — what did you accomplish in the last 15 minutes?
            </p>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Be specific. What did you actually do?"
              rows={3}
              style={{ resize: 'none', fontSize: 14, marginBottom: 10, lineHeight: 1.5 }}
              autoFocus
            />
            <button
              className="btn btn-primary"
              onClick={handleSubmit}
              disabled={!input.trim() || sending}
              style={{ fontSize: 14 }}
            >
              {sending ? 'Sending...' : 'Submit check-in →'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
