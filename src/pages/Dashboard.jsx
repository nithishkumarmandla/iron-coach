import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { useStore } from '../store/useStore'
import { getTodayInstances, getActivePenalties, getProfile, updateInstanceStatus, logEvent } from '../lib/tasks'
import { getOrphanedTimer, clearOrphanedTimer } from '../hooks/useTimer'
import { useAlarms, requestPushPermission } from '../hooks/useAlarms'

const CATEGORY_ICON = {
  wake_up: '🌅', exercise: '💪', study: '📚',
  hustle: '⚡', sleep: '🌙', custom: '✦'
}

export default function Dashboard() {
  const { user, profile, fetchProfile } = useStore()
  const navigate = useNavigate()

  const [instances, setInstances]   = useState([])
  const [penalties, setPenalties]   = useState([])
  const [stats, setStats]           = useState(null)
  const [loading, setLoading]       = useState(true)
  const [orphan, setOrphan]         = useState(null)

  const load = useCallback(async () => {
    if (!user) return
    try {
      const [inst, pens, st] = await Promise.all([
        getTodayInstances(user.id),
        getActivePenalties(user.id),
        getProfile(user.id)
      ])
      setInstances(inst)
      setPenalties(pens)
      setStats(st)
    } catch {
      toast.error('Failed to load today')
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    load()
    // Check for orphaned timer (crash recovery)
    const o = getOrphanedTimer()
    if (o) setOrphan(o)
    // Request push permission on first load
    requestPushPermission()
  }, [load])

  // Wire up today's alarms — schedules in-app alerts automatically
  function onAlarm({ type, instance }) {
    const title = instance.task?.title ?? 'Task'
    if (type === 'warning') toast(`⚠ ${title} in 5 minutes`, { duration: 5000 })
    if (type === 'due')     toast.error(`🔔 ${title} is due NOW — start your timer`)
  }
  useAlarms(instances, onAlarm)

  // Refresh profile in store if not loaded
  useEffect(() => {
    if (user && !profile) fetchProfile(user.id)
  }, [user, profile, fetchProfile])

  function handleStart(instance) {
    navigate(`/focus/${instance.id}`)
  }

  function handleProof(instance) {
    navigate(`/proof/${instance.id}`)
  }

  function handleEmergency(instance) {
    navigate(`/emergency/${instance.id}`)
  }

  function resumeOrphan() {
    navigate(`/focus/${orphan.instanceId}`)
    setOrphan(null)
  }

  function discardOrphan() {
    clearOrphanedTimer()
    setOrphan(null)
  }

  // Group by status for display order: in_progress → pending → completed → failed
  const sorted = [...instances].sort((a, b) => {
    const order = { in_progress: 0, pending: 1, completed: 2, failed: 3, penalty_pending: 4, emergency_shifted: 5 }
    return (order[a.status] ?? 9) - (order[b.status] ?? 9)
  })

  const completedCount = instances.filter(i => i.status === 'completed').length
  const totalCount = instances.filter(i => i.status !== 'emergency_shifted').length
  const today = format(new Date(), 'EEEE, MMMM d')

  if (loading) return <div className="spinner" />

  return (
    <div className="page">
      {/* Orphaned timer recovery */}
      {orphan && (
        <div style={{ background: 'var(--warn-dim)', border: '1px solid var(--warn)', borderRadius: 10, padding: 14, marginBottom: 14 }}>
          <p style={{ fontSize: 13, color: 'var(--warn)', marginBottom: 10, fontWeight: 500 }}>
            Timer was running for "{orphan.instanceId.slice(0, 8)}..." — {Math.floor(orphan.elapsedSeconds / 60)} min elapsed
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={resumeOrphan} style={{ flex: 1, padding: '8px 0', fontSize: 13 }}>Resume</button>
            <button className="btn btn-secondary" onClick={discardOrphan} style={{ flex: 1, padding: '8px 0', fontSize: 13 }}>Discard</button>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 2 }}>{today}</p>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>
          Today's tasks
        </h1>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 2 }}>Streak</div>
            <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--accent)' }}>
              🔥 {stats?.total_streak ?? 0}
            </div>
          </div>
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 2 }}>Score</div>
            <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--text)' }}>
              {Math.round(stats?.discipline_score ?? 0)}
            </div>
          </div>
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 2 }}>Done</div>
            <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--text)' }}>
              {completedCount}/{totalCount}
            </div>
          </div>
        </div>
      </div>

      {/* Active penalties banner */}
      {penalties.length > 0 && (
        <div
          onClick={() => navigate('/penalties')}
          style={{ background: 'var(--warn-dim)', border: '1px solid var(--warn)', borderRadius: 10, padding: '12px 14px', marginBottom: 14, cursor: 'pointer' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--warn)' }}>
                ⚠ {penalties.length} penalty due
              </p>
              <p style={{ fontSize: 12, color: 'var(--warn)', opacity: 0.8, marginTop: 2 }}>
                {penalties[0].description}
              </p>
            </div>
            <span style={{ color: 'var(--warn)', fontSize: 18 }}>›</span>
          </div>
        </div>
      )}

      {/* Task list */}
      {sorted.length === 0 ? (
        <div style={{ textAlign: 'center', marginTop: 60 }}>
          <p style={{ fontSize: 15, color: 'var(--text2)', marginBottom: 8 }}>No tasks for today</p>
          <button className="btn btn-secondary" style={{ width: 'auto', padding: '9px 20px', fontSize: 14 }} onClick={() => navigate('/tasks')}>
            Add tasks →
          </button>
        </div>
      ) : (
        sorted.map(instance => (
          <TaskCard
            key={instance.id}
            instance={instance}
            onStart={handleStart}
            onProof={handleProof}
            onEmergency={handleEmergency}
          />
        ))
      )}

      {/* Quick links */}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button className="btn btn-secondary" onClick={() => navigate('/tasks')} style={{ flex: 1, fontSize: 13, padding: '10px 0' }}>
          Manage tasks
        </button>
        <button className="btn btn-secondary" onClick={() => navigate('/alarms')} style={{ flex: 1, fontSize: 13, padding: '10px 0' }}>
          Alarms
        </button>
      </div>
    </div>
  )
}

function TaskCard({ instance, onStart, onProof, onEmergency }) {
  const task = instance.task
  const title = task?.title ?? instance.one_off_title ?? 'Task'
  const icon  = CATEGORY_ICON[task?.category] ?? '✦'
  const time  = task?.scheduled_time?.slice(0, 5)
  const dur   = task?.duration_mins ?? instance.one_off_duration

  const status = instance.status

  const statusStyle = {
    pending:           { badge: 'badge-pending',  label: 'Pending' },
    in_progress:       { badge: 'badge-active',   label: 'In progress' },
    completed:         { badge: 'badge-done',     label: 'Done' },
    failed:            { badge: 'badge-failed',   label: 'Failed' },
    penalty_pending:   { badge: 'badge-penalty',  label: 'Penalty due' },
    emergency_shifted: { badge: 'badge-pending',  label: 'Shifted' }
  }[status] ?? { badge: 'badge-pending', label: status }

  return (
    <div className="card" style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flex: 1 }}>
          <span style={{ fontSize: 22 }}>{icon}</span>
          <div>
            <p style={{ fontSize: 15, fontWeight: 500, color: 'var(--text)', marginBottom: 2 }}>{title}</p>
            <div style={{ display: 'flex', gap: 8, fontSize: 12, color: 'var(--text2)' }}>
              {time && <span>⏰ {time}</span>}
              {dur  && <span>⏱ {dur} min</span>}
            </div>
          </div>
        </div>
        <span className={`badge ${statusStyle.badge}`}>{statusStyle.label}</span>
      </div>

      {/* Progress bar for in_progress */}
      {status === 'in_progress' && instance.active_seconds > 0 && (
        <div style={{ height: 3, background: 'var(--bg3)', borderRadius: 2, marginBottom: 10, overflow: 'hidden' }}>
          <div style={{
            height: '100%', background: 'var(--accent)', borderRadius: 2,
            width: `${Math.min((instance.active_seconds / ((task?.duration_mins ?? 60) * 60)) * 100, 100)}%`
          }} />
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8 }}>
        {status === 'pending' && (
          <>
            <button className="btn btn-primary" onClick={() => onStart(instance)} style={{ flex: 2, padding: '9px 0', fontSize: 13 }}>
              Start timer
            </button>
            <button
              onClick={() => onEmergency(instance)}
              style={{ flex: 1, padding: '9px 0', fontSize: 12, background: 'none', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text2)', cursor: 'pointer' }}
            >
              Emergency
            </button>
          </>
        )}
        {status === 'in_progress' && (
          <button className="btn btn-primary" onClick={() => onStart(instance)} style={{ flex: 1, padding: '9px 0', fontSize: 13 }}>
            Continue →
          </button>
        )}
        {status === 'completed' && (
          <button className="btn btn-secondary" onClick={() => onProof(instance)} style={{ flex: 1, padding: '9px 0', fontSize: 13 }}>
            View proof
          </button>
        )}
        {(status === 'failed' || status === 'penalty_pending') && (
          <button className="btn btn-danger" onClick={() => onProof(instance)} style={{ flex: 1, padding: '9px 0', fontSize: 13 }}>
            Submit proof
          </button>
        )}
      </div>
    </div>
  )
}
