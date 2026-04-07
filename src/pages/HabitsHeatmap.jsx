import { useState, useEffect, useCallback } from 'react'
import { format, subDays, parseISO } from 'date-fns'
import toast from 'react-hot-toast'
import { useStore } from '../store/useStore'
import {
  getHabits, createHabit, updateHabit, deleteHabit,
  getTodayCompletions, completeHabit, uncompleteHabit,
  getHeatmapData, ensureTodayCompletions
} from '../lib/habits'

// Heatmap color scale
function heatColor(rate) {
  if (rate === 0)   return '#1a1a1a'
  if (rate < 0.25)  return '#14532d'
  if (rate < 0.5)   return '#166534'
  if (rate < 0.75)  return '#15803d'
  return '#4ade80'
}

const EMPTY_FORM = {
  title: '', icon: '⭐', color: '#4ade80',
  frequency: 'daily', habit_type: 'positive',
  proof_type: 'checkbox', target_value: '', unit: ''
}

// ─── Heatmap grid ──────────────────────────────────────────────
function HeatmapGrid({ data, onDayTap }) {
  // Group into weeks (columns), 7 rows per column
  const weeks = []
  for (let i = 0; i < data.length; i += 7) {
    weeks.push(data.slice(i, i + 7))
  }

  // Month labels: find where month changes
  const monthLabels = []
  let lastMonth = ''
  weeks.forEach((week, wi) => {
    const month = format(parseISO(week[0].date), 'MMM')
    if (month !== lastMonth) {
      monthLabels.push({ wi, label: month })
      lastMonth = month
    }
  })

  const cellSize = 11
  const gap      = 2
  const total    = weeks.length * (cellSize + gap)

  return (
    <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
      {/* Month labels */}
      <div style={{ display: 'flex', marginBottom: 4, minWidth: total }}>
        {monthLabels.map(({ wi, label }) => (
          <div key={label} style={{
            position: 'absolute',
            left: wi * (cellSize + gap),
            fontSize: 10, color: 'var(--text3)'
          }}>
            {label}
          </div>
        ))}
        <div style={{ height: 14, position: 'relative', width: total }} />
      </div>

      {/* Grid */}
      <div style={{ display: 'flex', gap, minWidth: total }}>
        {weeks.map((week, wi) => (
          <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap }}>
            {week.map((day) => (
              <div
                key={day.date}
                onClick={() => onDayTap(day)}
                title={`${day.date}: ${day.completed}/${day.total}`}
                style={{
                  width: cellSize, height: cellSize,
                  borderRadius: 2,
                  background: heatColor(day.rate),
                  cursor: 'pointer',
                  transition: 'transform 0.1s'
                }}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8 }}>
        <span style={{ fontSize: 10, color: 'var(--text3)' }}>Less</span>
        {[0, 0.25, 0.5, 0.75, 1].map(r => (
          <div key={r} style={{ width: 10, height: 10, borderRadius: 2, background: heatColor(r) }} />
        ))}
        <span style={{ fontSize: 10, color: 'var(--text3)' }}>More</span>
      </div>
    </div>
  )
}

// ─── Main screen ───────────────────────────────────────────────
export default function HabitsHeatmap() {
  const { user } = useStore()

  const [habits, setHabits]           = useState([])
  const [completions, setCompletions] = useState([])
  const [heatmap, setHeatmap]         = useState([])
  const [loading, setLoading]         = useState(true)
  const [selectedDay, setSelectedDay] = useState(null)
  const [selectedHabit, setSelectedHabit] = useState(null) // filter heatmap
  const [showForm, setShowForm]       = useState(false)
  const [form, setForm]               = useState(EMPTY_FORM)
  const [editId, setEditId]           = useState(null)
  const [saving, setSaving]           = useState(false)

  const load = useCallback(async () => {
    try {
      await ensureTodayCompletions(user.id)
      const [h, c, hm] = await Promise.all([
        getHabits(user.id),
        getTodayCompletions(user.id),
        getHeatmapData(user.id)
      ])
      setHabits(h)
      setCompletions(c)
      setHeatmap(hm)
    } catch {
      toast.error('Failed to load habits')
    } finally {
      setLoading(false)
    }
  }, [user.id])

  useEffect(() => { load() }, [load])

  async function refreshHeatmap(habitId) {
    const hm = await getHeatmapData(user.id, habitId ?? undefined)
    setHeatmap(hm)
  }

  async function toggleHabit(completion) {
    const isDone = completion.status === 'completed'
    try {
      if (isDone) {
        await uncompleteHabit(user.id, completion.habit_id)
      } else {
        await completeHabit(user.id, completion.habit_id)
      }
      // Refresh completions + heatmap
      const [c, hm] = await Promise.all([
        getTodayCompletions(user.id),
        getHeatmapData(user.id, selectedHabit ?? undefined)
      ])
      setCompletions(c)
      setHeatmap(hm)
    } catch {
      toast.error('Failed to update habit')
    }
  }

  async function handleFilterHabit(habitId) {
    const newFilter = selectedHabit === habitId ? null : habitId
    setSelectedHabit(newFilter)
    const hm = await getHeatmapData(user.id, newFilter ?? undefined)
    setHeatmap(hm)
  }

  function openNew() {
    setEditId(null); setForm(EMPTY_FORM); setShowForm(true)
  }

  function openEdit(habit) {
    setEditId(habit.id)
    setForm({
      title: habit.title, icon: habit.icon, color: habit.color,
      frequency: habit.frequency, habit_type: habit.habit_type,
      proof_type: habit.proof_type,
      target_value: habit.target_value ?? '', unit: habit.unit ?? ''
    })
    setShowForm(true)
  }

  async function handleSave() {
    if (!form.title.trim()) return toast.error('Habit title required')
    setSaving(true)
    try {
      const payload = {
        ...form,
        title:        form.title.trim(),
        target_value: form.target_value ? Number(form.target_value) : null,
        unit:         form.unit || null
      }
      if (editId) { await updateHabit(editId, payload); toast.success('Habit updated') }
      else        { await createHabit(user.id, payload); toast.success('Habit added') }
      setShowForm(false)
      load()
    } catch { toast.error('Failed to save') }
    finally   { setSaving(false) }
  }

  async function handleDelete(id) {
    if (!confirm('Remove this habit?')) return
    try {
      await deleteHabit(id)
      toast.success('Habit removed')
      load()
    } catch { toast.error('Failed to remove') }
  }

  const today     = format(new Date(), 'yyyy-MM-dd')
  const todayDone = completions.filter(c => c.status === 'completed').length
  const todayTotal = completions.length

  if (loading) return <div className="spinner" />

  return (
    <div className="page">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 600, color: 'var(--text)' }}>Habits</h2>
          <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>
            Today: {todayDone}/{todayTotal} done
          </p>
        </div>
        <button
          className="btn btn-primary"
          style={{ width: 'auto', padding: '9px 14px', fontSize: 13 }}
          onClick={openNew}
        >
          + Add
        </button>
      </div>

      {/* Heatmap */}
      {heatmap.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>
              {selectedHabit
                ? habits.find(h => h.id === selectedHabit)?.title ?? 'Habit'
                : 'All habits — last 365 days'}
            </p>
            {selectedHabit && (
              <button
                onClick={() => handleFilterHabit(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 12, cursor: 'pointer' }}
              >
                Clear filter ×
              </button>
            )}
          </div>
          <HeatmapGrid
            data={heatmap}
            onDayTap={(day) => setSelectedDay(day.date === selectedDay ? null : day.date)}
          />
          {selectedDay && (
            <div style={{
              marginTop: 10, padding: '8px 10px',
              background: 'var(--bg3)', borderRadius: 8
            }}>
              <p style={{ fontSize: 12, color: 'var(--text2)' }}>
                {format(parseISO(selectedDay), 'MMMM d, yyyy')} —{' '}
                {heatmap.find(d => d.date === selectedDay)?.completed ?? 0} habits completed
              </p>
            </div>
          )}
        </div>
      )}

      {/* Today's habit check-ins */}
      {completions.length > 0 && (
        <>
          <p className="section-header">Today</p>
          {completions.map(completion => {
            const done  = completion.status === 'completed'
            const habit = completion.habit

            return (
              <div
                key={completion.id}
                className="card"
                style={{
                  marginBottom: 8,
                  borderColor: done ? 'var(--accent)' : 'var(--border)',
                  display: 'flex', alignItems: 'center', gap: 12
                }}
              >
                {/* Check button */}
                <button
                  onClick={() => toggleHabit(completion)}
                  style={{
                    width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                    background: done ? 'var(--accent)' : 'var(--bg3)',
                    border: `2px solid ${done ? 'var(--accent)' : 'var(--border)'}`,
                    cursor: 'pointer', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: 16, color: '#000',
                    transition: 'all 0.15s'
                  }}
                >
                  {done ? '✓' : ''}
                </button>

                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 16 }}>{habit?.icon ?? '⭐'}</span>
                    <span style={{
                      fontSize: 14, fontWeight: 500,
                      color: done ? 'var(--text2)' : 'var(--text)',
                      textDecoration: done ? 'line-through' : 'none'
                    }}>
                      {habit?.title ?? 'Habit'}
                    </span>
                  </div>
                </div>

                {/* Filter to this habit's heatmap */}
                <button
                  onClick={() => handleFilterHabit(completion.habit_id)}
                  style={{
                    background: 'none', border: 'none',
                    color: selectedHabit === completion.habit_id ? 'var(--accent)' : 'var(--text3)',
                    fontSize: 14, cursor: 'pointer', padding: '4px'
                  }}
                >
                  ▦
                </button>
              </div>
            )
          })}
        </>
      )}

      {/* All habits list (manage) */}
      {habits.length > 0 && (
        <>
          <p className="section-header" style={{ marginTop: 16 }}>Manage habits</p>
          {habits.map(habit => {
            const streak = habit.current_streak ?? 0
            return (
              <div key={habit.id} className="card" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 20 }}>{habit.icon}</span>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>{habit.title}</p>
                  <p style={{ fontSize: 11, color: 'var(--text3)' }}>
                    🔥 {streak} day streak · {habit.frequency}
                  </p>
                </div>
                <button
                  onClick={() => openEdit(habit)}
                  style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text2)', fontSize: 12, padding: '4px 10px', cursor: 'pointer' }}
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(habit.id)}
                  style={{ background: 'none', border: '1px solid var(--danger)', borderRadius: 6, color: 'var(--danger)', fontSize: 12, padding: '4px 10px', cursor: 'pointer' }}
                >
                  ✕
                </button>
              </div>
            )
          })}
        </>
      )}

      {habits.length === 0 && !showForm && (
        <div style={{ textAlign: 'center', color: 'var(--text2)', marginTop: 40 }}>
          <p style={{ fontSize: 15, marginBottom: 6 }}>No habits yet</p>
          <p style={{ fontSize: 13 }}>Habits are small daily actions that build identity over time</p>
        </div>
      )}

      {/* Add / Edit form */}
      {showForm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
          display: 'flex', alignItems: 'flex-end', zIndex: 200
        }}>
          <div style={{
            background: 'var(--bg2)', borderRadius: '16px 16px 0 0',
            padding: '20px 20px 36px', width: '100%', maxWidth: 480,
            margin: '0 auto', maxHeight: '86vh', overflowY: 'auto'
          }}>
            <h3 style={{ fontSize: 17, fontWeight: 600, marginBottom: 16, color: 'var(--text)' }}>
              {editId ? 'Edit habit' : 'New habit'}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '48px 1fr', gap: 10 }}>
                <input
                  value={form.icon}
                  onChange={e => setForm(f => ({ ...f, icon: e.target.value }))}
                  style={{ textAlign: 'center', fontSize: 20, padding: '8px 4px' }}
                  maxLength={2}
                />
                <input
                  placeholder="Habit title (e.g. Read 10 pages)"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <select value={form.habit_type} onChange={e => setForm(f => ({ ...f, habit_type: e.target.value }))}>
                  <option value="positive">Do this ✓</option>
                  <option value="negative">Avoid this ✗</option>
                </select>
                <select value={form.frequency} onChange={e => setForm(f => ({ ...f, frequency: e.target.value }))}>
                  <option value="daily">Every day</option>
                  <option value="weekdays">Weekdays</option>
                  <option value="weekends">Weekends</option>
                </select>
              </div>

              <select value={form.proof_type} onChange={e => setForm(f => ({ ...f, proof_type: e.target.value }))}>
                <option value="checkbox">Checkbox (just tap done)</option>
                <option value="number">Number (e.g. pages read)</option>
                <option value="note">Note (write what you did)</option>
                <option value="photo">Photo proof</option>
              </select>

              {form.proof_type === 'number' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <input
                    type="number"
                    placeholder="Target (e.g. 10)"
                    value={form.target_value}
                    onChange={e => setForm(f => ({ ...f, target_value: e.target.value }))}
                  />
                  <input
                    placeholder="Unit (e.g. pages)"
                    value={form.unit}
                    onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                  />
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button className="btn btn-secondary" onClick={() => setShowForm(false)} style={{ flex: 1 }}>Cancel</button>
                <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ flex: 1 }}>
                  {saving ? 'Saving...' : editId ? 'Update' : 'Add habit'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
