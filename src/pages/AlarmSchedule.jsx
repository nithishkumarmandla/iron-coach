import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { useStore } from '../store/useStore'
import { getTodayInstances, updateTask } from '../lib/tasks'
import { useAlarms, requestPushPermission } from '../hooks/useAlarms'
import { sound } from '../lib/sound'

function formatTime12(timeStr) {
  if (!timeStr) return '--:--'
  const [h, m] = timeStr.split(':').map(Number)
  const ampm = h < 12 ? 'AM' : 'PM'
  const h12  = h % 12 || 12
  return { time: `${h12}:${String(m).padStart(2, '0')}`, ampm }
}

export default function AlarmSchedule() {
  const { user }  = useStore()
  const navigate  = useNavigate()

  const [instances, setInstances] = useState([])
  const [loading, setLoading]     = useState(true)
  const [pushGranted, setPush]    = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await getTodayInstances(user.id)
      // Only show tasks with a scheduled time
      setInstances(data.filter(i => i.task?.scheduled_time))
    } catch {
      toast.error('Failed to load alarms')
    } finally {
      setLoading(false)
    }
  }, [user.id])

  useEffect(() => {
    load()
    setPush(Notification?.permission === 'granted')
  }, [load])

  // Handle alarm fires
  function onAlarm({ type, instance }) {
    const title = instance.task?.title ?? 'Task'
    if (type === 'warning') toast(`⚠ ${title} in 5 minutes`, { duration: 5000 })
    if (type === 'due')     toast.error(`🔔 ${title} is due NOW`)
  }

  const { countdowns } = useAlarms(instances, onAlarm)

  async function handleEnablePush() {
    const granted = await requestPushPermission()
    setPush(granted)
    if (granted) toast.success('Push notifications enabled')
    else toast.error('Notifications denied — enable in browser settings')
  }

  // Find next upcoming alarm
  const upcomingAlarms = instances
    .filter(i => i.status === 'pending' && i.task?.scheduled_time)
    .sort((a, b) => a.task.scheduled_time.localeCompare(b.task.scheduled_time))

  const nextAlarm = upcomingAlarms[0]

  if (loading) return <div className="spinner" />

  return (
    <div className="page">
      <div style={{ marginBottom: 20 }}>
        <button
          onClick={() => navigate('/')}
          style={{ background: 'none', border: 'none', color: 'var(--text2)', fontSize: 14, cursor: 'pointer', padding: 0, marginBottom: 6 }}
        >
          ← Back
        </button>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: 'var(--text)' }}>Alarm schedule</h2>
        <p style={{ fontSize: 13, color: 'var(--text2)', marginTop: 3 }}>
          {format(new Date(), 'EEEE, MMMM d')}
        </p>
      </div>

      {/* Next alarm callout — matches the screenshot reference */}
      {nextAlarm && countdowns[nextAlarm.id] && (
        <div style={{
          background: 'var(--bg2)', border: '1px solid var(--border)',
          borderRadius: 12, padding: '12px 16px', marginBottom: 16,
          display: 'flex', alignItems: 'center', gap: 12
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%',
            background: 'var(--bg3)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0
          }}>
            🔔
          </div>
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
              {countdowns[nextAlarm.id]}
            </p>
            <p style={{ fontSize: 11, color: 'var(--text2)', marginTop: 1 }}>
              {nextAlarm.task?.title ?? 'Next task'}
            </p>
          </div>
        </div>
      )}

      {/* Push permission banner */}
      {!pushGranted && (
        <div style={{
          background: 'var(--info-dim)', border: '1px solid var(--info)',
          borderRadius: 10, padding: '12px 14px', marginBottom: 16,
          display: 'flex', alignItems: 'center', gap: 12
        }}>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--info)' }}>Enable notifications</p>
            <p style={{ fontSize: 11, color: 'var(--info)', opacity: 0.8, marginTop: 2 }}>
              Get alarms even when the app is closed
            </p>
          </div>
          <button
            onClick={handleEnablePush}
            style={{
              background: 'var(--info)', color: '#fff', border: 'none',
              borderRadius: 8, padding: '8px 14px', fontSize: 12,
              fontWeight: 500, cursor: 'pointer', flexShrink: 0
            }}
          >
            Enable
          </button>
        </div>
      )}

      {/* Alarm list */}
      {instances.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '32px 16px' }}>
          <p style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 6 }}>No scheduled tasks today</p>
          <button
            className="btn btn-secondary"
            style={{ width: 'auto', padding: '9px 20px', fontSize: 13 }}
            onClick={() => navigate('/tasks')}
          >
            Add tasks with times →
          </button>
        </div>
      ) : (
        instances
          .sort((a, b) => (a.task?.scheduled_time ?? '').localeCompare(b.task?.scheduled_time ?? ''))
          .map(instance => {
            const { time, ampm } = formatTime12(instance.task?.scheduled_time)
            const countdown = countdowns[instance.id]
            const isPast    = instance.status !== 'pending'
            const isDone    = instance.status === 'completed'

            return (
              <div
                key={instance.id}
                className="card"
                style={{
                  marginBottom: 10,
                  opacity: isPast ? 0.6 : 1,
                  cursor: 'pointer'
                }}
                onClick={() => !isPast && navigate(`/focus/${instance.id}`)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {/* Time display */}
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                      <span style={{
                        fontSize: 32, fontWeight: 600,
                        color: isDone ? 'var(--text3)' : 'var(--text)',
                        fontVariantNumeric: 'tabular-nums'
                      }}>
                        {time}
                      </span>
                      <span style={{ fontSize: 13, color: 'var(--text3)', fontWeight: 500 }}>
                        {ampm}
                      </span>
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>
                      {instance.task?.title ?? 'Task'} · {instance.task?.duration_mins ?? 60} min
                    </p>
                  </div>

                  {/* Countdown or status */}
                  <div style={{ textAlign: 'right' }}>
                    {!isPast && countdown ? (
                      <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--info)', marginBottom: 4 }}>
                        {countdown}
                      </p>
                    ) : (
                      <span className={`badge ${isDone ? 'badge-done' : 'badge-failed'}`} style={{ marginBottom: 4, display: 'block' }}>
                        {isDone ? 'Done' : 'Missed'}
                      </span>
                    )}

                    {/* Toggle — visual only (alarm is always on for pending tasks) */}
                    <div style={{
                      width: 40, height: 22, borderRadius: 11, marginLeft: 'auto',
                      background: !isPast ? '#378ADD' : 'var(--bg3)',
                      border: '1px solid var(--border)',
                      position: 'relative', transition: 'background 0.2s'
                    }}>
                      <div style={{
                        position: 'absolute', top: 2,
                        left: !isPast ? 20 : 2,
                        width: 16, height: 16, borderRadius: '50%',
                        background: '#fff', transition: 'left 0.2s'
                      }} />
                    </div>
                  </div>
                </div>
              </div>
            )
          })
      )}

      {/* Test alarm button */}
      <button
        className="btn btn-secondary"
        onClick={() => sound.alarm()}
        style={{ marginTop: 8, fontSize: 13 }}
      >
        🔔 Test alarm sound
      </button>
    </div>
  )
}
