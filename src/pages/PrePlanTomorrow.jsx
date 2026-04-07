import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, addDays } from 'date-fns'
import toast from 'react-hot-toast'
import { useStore } from '../store/useStore'
import { supabase } from '../lib/supabase'
import { getTasks } from '../lib/tasks'

export default function PrePlanTomorrow() {
  const { user }  = useStore()
  const navigate  = useNavigate()

  const [recurringTasks, setRecurring]   = useState([])
  const [tomorrowInst, setTomorrow]      = useState([])
  const [loading, setLoading]            = useState(true)
  const [saving, setSaving]              = useState(false)
  const [newTask, setNewTask]            = useState({ title: '', duration_mins: 60, scheduled_time: '' })
  const [showAdd, setShowAdd]            = useState(false)

  const tomorrow     = format(addDays(new Date(), 1), 'yyyy-MM-dd')
  const tomorrowLabel = format(addDays(new Date(), 1), 'EEEE, MMMM d')
  const tomorrowDay  = addDays(new Date(), 1).getDay() === 0 ? 7 : addDays(new Date(), 1).getDay()

  const hour = new Date().getHours()
  const isAvailable = hour >= 20 || hour < 4  // available after 8pm

  useEffect(() => { load() }, [])

  async function load() {
    try {
      // Recurring tasks scheduled for tomorrow
      const allTasks = await getTasks(user.id)
      const forTomorrow = allTasks.filter(t =>
        (t.days_of_week ?? []).includes(tomorrowDay)
      )
      setRecurring(forTomorrow)

      // Already pre-planned instances for tomorrow
      const { data } = await supabase
        .from('daily_task_instances')
        .select('*, task:tasks(title, scheduled_time, duration_mins)')
        .eq('user_id', user.id)
        .eq('date', tomorrow)
        .eq('created_by', 'user_preplanned')
      setTomorrow(data ?? [])
    } catch {
      toast.error('Failed to load tomorrow')
    } finally {
      setLoading(false)
    }
  }

  async function addOneOffTask() {
    if (!newTask.title.trim()) return toast.error('Task title required')
    setSaving(true)
    try {
      await supabase.from('daily_task_instances').insert({
        user_id:         user.id,
        task_id:         null,
        date:            tomorrow,
        status:          'pending',
        created_by:      'user_preplanned',
        is_one_off:      true,
        one_off_title:   newTask.title.trim(),
        one_off_duration: newTask.duration_mins
      })
      toast.success('Task added to tomorrow')
      setNewTask({ title: '', duration_mins: 60, scheduled_time: '' })
      setShowAdd(false)
      load()
    } catch {
      toast.error('Failed to add task')
    } finally {
      setSaving(false)
    }
  }

  async function removeOneOff(id) {
    try {
      await supabase.from('daily_task_instances').delete().eq('id', id)
      toast.success('Removed')
      load()
    } catch {
      toast.error('Failed to remove')
    }
  }

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
        <h2 style={{ fontSize: 20, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
          Plan tomorrow
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text2)' }}>{tomorrowLabel}</p>
      </div>

      {/* Availability notice */}
      {!isAvailable && (
        <div style={{
          background: 'var(--warn-dim)', border: '1px solid var(--warn)',
          borderRadius: 10, padding: '12px 14px', marginBottom: 16
        }}>
          <p style={{ fontSize: 13, color: 'var(--warn)', fontWeight: 500 }}>Available after 8 PM</p>
          <p style={{ fontSize: 12, color: 'var(--warn)', opacity: 0.8, marginTop: 3 }}>
            Plan tomorrow's extras in the evening — current time: {format(new Date(), 'h:mm a')}
          </p>
        </div>
      )}

      {/* Auto-scheduled tasks */}
      <p className="section-header">Auto-scheduled (from your recurring tasks)</p>
      {recurringTasks.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 16 }}>
          No recurring tasks for tomorrow
        </p>
      ) : (
        recurringTasks.map(task => (
          <div key={task.id} className="card" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12, opacity: 0.7 }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: 'var(--accent)', flexShrink: 0
            }} />
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>{task.title}</p>
              <p style={{ fontSize: 12, color: 'var(--text2)' }}>
                {task.scheduled_time?.slice(0,5)} · {task.duration_mins} min · auto
              </p>
            </div>
          </div>
        ))
      )}

      {/* Pre-planned one-offs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, marginBottom: 8 }}>
        <p className="section-header" style={{ margin: 0 }}>
          Custom tasks for tomorrow {tomorrowInst.length > 0 && `(${tomorrowInst.length})`}
        </p>
        {isAvailable && (
          <button
            onClick={() => setShowAdd(v => !v)}
            style={{
              background: 'none', border: '1px solid var(--border)',
              borderRadius: 6, color: 'var(--accent)', fontSize: 12,
              padding: '4px 10px', cursor: 'pointer'
            }}
          >
            + Add
          </button>
        )}
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input
              placeholder="Task title"
              value={newTask.title}
              onChange={e => setNewTask(n => ({ ...n, title: e.target.value }))}
              autoFocus
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <input
                type="time"
                value={newTask.scheduled_time}
                onChange={e => setNewTask(n => ({ ...n, scheduled_time: e.target.value }))}
              />
              <div>
                <label style={{ fontSize: 11, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>
                  Duration: {newTask.duration_mins}m
                </label>
                <input
                  type="range" min={5} max={480} step={5}
                  value={newTask.duration_mins}
                  onChange={e => setNewTask(n => ({ ...n, duration_mins: Number(e.target.value) }))}
                  style={{ width: '100%' }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary" onClick={() => setShowAdd(false)} style={{ flex: 1, fontSize: 13 }}>Cancel</button>
              <button className="btn btn-primary" onClick={addOneOffTask} disabled={saving} style={{ flex: 1, fontSize: 13 }}>
                {saving ? 'Adding...' : 'Add task'}
              </button>
            </div>
          </div>
        </div>
      )}

      {tomorrowInst.length === 0 && !showAdd && (
        <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 8 }}>
          No custom tasks added yet
        </p>
      )}

      {tomorrowInst.map(inst => (
        <div key={inst.id} className="card" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>
              {inst.one_off_title ?? inst.task?.title ?? 'Task'}
            </p>
            <p style={{ fontSize: 12, color: 'var(--text2)' }}>
              {inst.one_off_duration ?? inst.task?.duration_mins ?? 60} min · pre-planned
            </p>
          </div>
          <button
            onClick={() => removeOneOff(inst.id)}
            style={{
              background: 'none', border: '1px solid var(--danger)',
              borderRadius: 6, color: 'var(--danger)', fontSize: 12,
              padding: '4px 10px', cursor: 'pointer'
            }}
          >
            ✕
          </button>
        </div>
      ))}

      {/* Summary */}
      <div style={{
        marginTop: 20, background: 'var(--bg2)', border: '1px solid var(--border)',
        borderRadius: 10, padding: 14
      }}>
        <p style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.7 }}>
          Tomorrow's total: <strong style={{ color: 'var(--text)' }}>
            {recurringTasks.length + tomorrowInst.length} tasks
          </strong>
          {' '}scheduled.
          Recurring tasks auto-generate at midnight.
          Custom tasks are already saved.
        </p>
      </div>
    </div>
  )
}