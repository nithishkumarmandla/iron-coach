import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useStore } from '../store/useStore'
import { getTasks, createTask, updateTask, deleteTask } from '../lib/tasks'

const CATEGORIES = [
  { value: 'wake_up',  label: 'Wake up' },
  { value: 'exercise', label: 'Exercise' },
  { value: 'study',    label: 'Study' },
  { value: 'hustle',   label: 'Side hustle' },
  { value: 'sleep',    label: 'Sleep' },
  { value: 'custom',   label: 'Custom' }
]

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const EMPTY_FORM = {
  title: '',
  category: 'custom',
  task_type: 'flexible',
  scheduled_time: '',
  duration_mins: 60,
  days_of_week: [1, 2, 3, 4, 5, 6, 7],
  proof_type: ['photo']
}

export default function TaskManager() {
  const { user } = useStore()
  const navigate = useNavigate()

  const [tasks, setTasks]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm]         = useState(EMPTY_FORM)
  const [saving, setSaving]     = useState(false)
  const [editId, setEditId]     = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    try {
      setLoading(true)
      const data = await getTasks(user.id)
      setTasks(data)
    } catch {
      toast.error('Failed to load tasks')
    } finally {
      setLoading(false)
    }
  }

  function openNew() {
    setEditId(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  function openEdit(task) {
    setEditId(task.id)
    setForm({
      title:          task.title,
      category:       task.category,
      task_type:      task.task_type,
      scheduled_time: task.scheduled_time ?? '',
      duration_mins:  task.duration_mins,
      days_of_week:   task.days_of_week,
      proof_type:     task.proof_type
    })
    setShowForm(true)
  }

  function toggleDay(day) {
    setForm(f => ({
      ...f,
      days_of_week: f.days_of_week.includes(day)
        ? f.days_of_week.filter(d => d !== day)
        : [...f.days_of_week, day].sort()
    }))
  }

  async function handleSave() {
    if (!form.title.trim()) return toast.error('Task title required')
    if (form.days_of_week.length === 0) return toast.error('Select at least one day')
    setSaving(true)
    try {
      const payload = {
        ...form,
        title: form.title.trim(),
        scheduled_time: form.scheduled_time || null
      }
      if (editId) {
        await updateTask(editId, payload)
        toast.success('Task updated')
      } else {
        await createTask(user.id, payload)
        toast.success('Task added')
      }
      setShowForm(false)
      load()
    } catch {
      toast.error('Failed to save task')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    if (!confirm('Remove this task?')) return
    try {
      await deleteTask(id)
      toast.success('Task removed')
      load()
    } catch {
      toast.error('Failed to remove')
    }
  }

  if (loading) return <div className="spinner" />

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <button
            onClick={() => navigate('/')}
            style={{ background: 'none', border: 'none', color: 'var(--text2)', fontSize: 14, cursor: 'pointer', padding: 0, marginBottom: 4 }}
          >
            ← Back
          </button>
          <h2 style={{ fontSize: 20, fontWeight: 600, color: 'var(--text)' }}>My tasks</h2>
        </div>
        <button className="btn btn-primary" style={{ width: 'auto', padding: '9px 16px' }} onClick={openNew}>
          + Add
        </button>
      </div>

      {tasks.length === 0 && !showForm && (
        <div style={{ textAlign: 'center', color: 'var(--text2)', marginTop: 60 }}>
          <p style={{ fontSize: 15, marginBottom: 8 }}>No tasks yet</p>
          <p style={{ fontSize: 13 }}>Add your first task above</p>
        </div>
      )}

      {tasks.map(task => (
        <div key={task.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--text)' }}>{task.title}</span>
              <span className="badge badge-pending">{task.category.replace('_', ' ')}</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text2)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {task.scheduled_time && <span>⏰ {task.scheduled_time.slice(0, 5)}</span>}
              <span>⏱ {task.duration_mins} min</span>
              <span style={{ textTransform: 'capitalize' }}>{task.task_type}</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
              {DAYS.filter((_, i) => task.days_of_week.includes(i + 1)).join(' · ')}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginLeft: 8 }}>
            <button
              onClick={() => openEdit(task)}
              style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text2)', fontSize: 12, padding: '5px 10px', cursor: 'pointer' }}
            >
              Edit
            </button>
            <button
              onClick={() => handleDelete(task.id)}
              style={{ background: 'none', border: '1px solid var(--danger)', borderRadius: 6, color: 'var(--danger)', fontSize: 12, padding: '5px 10px', cursor: 'pointer' }}
            >
              ✕
            </button>
          </div>
        </div>
      ))}

      {/* Add / Edit bottom sheet */}
      {showForm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
          display: 'flex', alignItems: 'flex-end', zIndex: 200
        }}>
          <div style={{
            background: 'var(--bg2)', borderRadius: '16px 16px 0 0',
            padding: '20px 20px 32px', width: '100%', maxWidth: 480, margin: '0 auto',
            maxHeight: '88vh', overflowY: 'auto'
          }}>
            <h3 style={{ fontSize: 17, fontWeight: 600, marginBottom: 16, color: 'var(--text)' }}>
              {editId ? 'Edit task' : 'New task'}
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input
                placeholder="Task title (e.g. Morning run)"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              />

              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <select value={form.task_type} onChange={e => setForm(f => ({ ...f, task_type: e.target.value }))}>
                  <option value="fixed">Fixed time</option>
                  <option value="flexible">Flexible</option>
                </select>
                <input
                  type="time"
                  value={form.scheduled_time}
                  onChange={e => setForm(f => ({ ...f, scheduled_time: e.target.value }))}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 6, display: 'block' }}>
                  Duration: {form.duration_mins} min
                </label>
                <input
                  type="range" min={5} max={480} step={5}
                  value={form.duration_mins}
                  onChange={e => setForm(f => ({ ...f, duration_mins: Number(e.target.value) }))}
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8, display: 'block' }}>Days</label>
                <div style={{ display: 'flex', gap: 5 }}>
                  {DAYS.map((day, i) => {
                    const dayNum = i + 1
                    const active = form.days_of_week.includes(dayNum)
                    return (
                      <button key={day} onClick={() => toggleDay(dayNum)} style={{
                        flex: 1, padding: '7px 0', fontSize: 11, fontWeight: 500,
                        border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                        borderRadius: 6, cursor: 'pointer',
                        background: active ? 'var(--accent-dim)' : 'var(--bg3)',
                        color: active ? 'var(--accent)' : 'var(--text3)'
                      }}>
                        {day}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div>
                <label style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8, display: 'block' }}>Proof type</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {['photo', 'timer', 'both'].map(type => {
                    const active = form.proof_type[0] === type
                    return (
                      <button key={type} onClick={() => setForm(f => ({ ...f, proof_type: [type] }))} style={{
                        flex: 1, padding: '8px 0', fontSize: 12, fontWeight: 500,
                        border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                        borderRadius: 6, cursor: 'pointer',
                        background: active ? 'var(--accent-dim)' : 'var(--bg3)',
                        color: active ? 'var(--accent)' : 'var(--text3)'
                      }}>
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button className="btn btn-secondary" onClick={() => setShowForm(false)} style={{ flex: 1 }}>Cancel</button>
                <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ flex: 1 }}>
                  {saving ? 'Saving...' : editId ? 'Update' : 'Add task'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
