import { useState, useEffect, useCallback } from 'react'
import {
  format, parseISO, startOfMonth, endOfMonth,
  eachDayOfInterval, subMonths, addMonths, isSameMonth, isToday
} from 'date-fns'
import toast from 'react-hot-toast'
import { useStore } from '../store/useStore'
import { supabase } from '../lib/supabase'
import { getInstancesForDate } from '../lib/tasks'
import { getCompletionsForDate } from '../lib/habits'

const CATEGORY_ICON = {
  wake_up: '🌅', exercise: '💪', study: '📚',
  hustle: '⚡', sleep: '🌙', custom: '✦'
}

// Fetch monthly overview: completion % per day for calendar coloring
async function getMonthOverview(userId, year, month) {
  const startDate = format(new Date(year, month, 1), 'yyyy-MM-dd')
  const endDate   = format(new Date(year, month + 1, 0), 'yyyy-MM-dd')

  const { data } = await supabase
    .from('daily_task_instances')
    .select('date, status')
    .eq('user_id', userId)
    .gte('date', startDate)
    .lte('date', endDate)

  const byDate = {}
  for (const row of data ?? []) {
    if (!byDate[row.date]) byDate[row.date] = { done: 0, total: 0 }
    byDate[row.date].total++
    if (row.status === 'completed') byDate[row.date].done++
  }
  return byDate
}

function dayColor(stats) {
  if (!stats || stats.total === 0) return 'transparent'
  const rate = stats.done / stats.total
  if (rate === 1)   return 'var(--accent)'
  if (rate >= 0.5)  return 'var(--warn)'
  return 'var(--danger)'
}

export default function HistoryView() {
  const { user } = useStore()

  const [viewDate, setViewDate]       = useState(new Date())       // displayed month
  const [selectedDate, setSelected]   = useState(format(new Date(), 'yyyy-MM-dd'))
  const [monthData, setMonthData]     = useState({})
  const [instances, setInstances]     = useState([])
  const [habitComps, setHabitComps]   = useState([])
  const [loadingDay, setLoadingDay]   = useState(false)
  const [loadingMonth, setLoadingMonth] = useState(false)

  const loadMonth = useCallback(async (date) => {
    setLoadingMonth(true)
    try {
      const data = await getMonthOverview(user.id, date.getFullYear(), date.getMonth())
      setMonthData(data)
    } catch {
      toast.error('Failed to load month')
    } finally {
      setLoadingMonth(false)
    }
  }, [user.id])

  const loadDay = useCallback(async (dateStr) => {
    setLoadingDay(true)
    try {
      const [inst, habits] = await Promise.all([
        getInstancesForDate(user.id, dateStr),
        getCompletionsForDate(user.id, dateStr)
      ])
      setInstances(inst)
      setHabitComps(habits)
    } catch {
      toast.error('Failed to load day')
    } finally {
      setLoadingDay(false)
    }
  }, [user.id])

  useEffect(() => { loadMonth(viewDate) }, [viewDate, loadMonth])
  useEffect(() => { loadDay(selectedDate) }, [selectedDate, loadDay])

  function prevMonth() { setViewDate(d => subMonths(d, 1)) }
  function nextMonth() {
    const next = addMonths(viewDate, 1)
    if (next <= new Date()) setViewDate(next)
  }

  // Build calendar grid
  const monthStart = startOfMonth(viewDate)
  const monthEnd   = endOfMonth(viewDate)
  const days       = eachDayOfInterval({ start: monthStart, end: monthEnd })

  // Pad start: Mon=0, so if 1st is Wed (3), add 2 blank cells
  const startPad = (monthStart.getDay() + 6) % 7  // convert to Mon=0
  const blanks   = Array(startPad).fill(null)

  const completedToday = instances.filter(i => i.status === 'completed').length
  const totalToday     = instances.length
  const habitsDone     = habitComps.filter(h => h.status === 'completed').length

  return (
    <div className="page">
      <h2 style={{ fontSize: 20, fontWeight: 600, color: 'var(--text)', marginBottom: 16 }}>History</h2>

      {/* Calendar */}
      <div className="card" style={{ marginBottom: 16 }}>
        {/* Month nav */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <button
            onClick={prevMonth}
            style={{ background: 'none', border: 'none', color: 'var(--text2)', fontSize: 20, cursor: 'pointer', padding: '0 8px' }}
          >
            ‹
          </button>
          <p style={{ fontSize: 15, fontWeight: 500, color: 'var(--text)' }}>
            {format(viewDate, 'MMMM yyyy')}
          </p>
          <button
            onClick={nextMonth}
            disabled={isSameMonth(viewDate, new Date())}
            style={{
              background: 'none', border: 'none',
              color: isSameMonth(viewDate, new Date()) ? 'var(--text3)' : 'var(--text2)',
              fontSize: 20, cursor: 'pointer', padding: '0 8px'
            }}
          >
            ›
          </button>
        </div>

        {/* Day-of-week headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3, marginBottom: 4 }}>
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
            <div key={i} style={{ textAlign: 'center', fontSize: 10, color: 'var(--text3)', padding: '2px 0' }}>
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
          {blanks.map((_, i) => <div key={`b${i}`} />)}
          {days.map(day => {
            const dateStr  = format(day, 'yyyy-MM-dd')
            const stats    = monthData[dateStr]
            const isSelected = dateStr === selectedDate
            const today    = isToday(day)
            const future   = day > new Date()
            const color    = dayColor(stats)

            return (
              <button
                key={dateStr}
                onClick={() => !future && setSelected(dateStr)}
                disabled={future}
                style={{
                  aspectRatio: '1',
                  borderRadius: 6,
                  border: isSelected ? '2px solid var(--accent)' : '1px solid transparent',
                  background: isSelected ? 'var(--accent-dim)' : 'var(--bg3)',
                  cursor: future ? 'default' : 'pointer',
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  gap: 2, padding: 2, position: 'relative'
                }}
              >
                <span style={{
                  fontSize: 12, fontWeight: today ? 700 : 400,
                  color: isSelected ? 'var(--accent)' : today ? 'var(--text)' : future ? 'var(--text3)' : 'var(--text2)'
                }}>
                  {day.getDate()}
                </span>
                {/* Completion dot */}
                {stats && stats.total > 0 && (
                  <div style={{
                    width: 5, height: 5, borderRadius: '50%', background: color
                  }} />
                )}
              </button>
            )
          })}
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: 12, marginTop: 10, justifyContent: 'flex-end' }}>
          {[['var(--accent)', 'All done'], ['var(--warn)', 'Partial'], ['var(--danger)', 'Failed']].map(([c, l]) => (
            <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: c }} />
              <span style={{ fontSize: 10, color: 'var(--text3)' }}>{l}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Selected day detail */}
      <div style={{ marginBottom: 12 }}>
        <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', marginBottom: 4 }}>
          {format(parseISO(selectedDate), 'EEEE, MMMM d')}
          {isToday(parseISO(selectedDate)) && (
            <span style={{ fontSize: 11, color: 'var(--accent)', marginLeft: 8 }}>today</span>
          )}
        </p>
        {!loadingDay && instances.length > 0 && (
          <p style={{ fontSize: 12, color: 'var(--text2)' }}>
            Tasks: {completedToday}/{totalToday} · Habits: {habitsDone}/{habitComps.length}
          </p>
        )}
      </div>

      {loadingDay ? (
        <div className="spinner" />
      ) : (
        <>
          {/* Tasks */}
          {instances.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '24px 16px' }}>
              <p style={{ fontSize: 14, color: 'var(--text2)' }}>No tasks on this day</p>
            </div>
          ) : (
            instances.map(instance => {
              const title  = instance.task?.title ?? instance.one_off_title ?? 'Task'
              const icon   = CATEGORY_ICON[instance.task?.category] ?? '✦'
              const status = instance.status

              const badgeMap = {
                completed:         { cls: 'badge-done',    label: 'Done' },
                failed:            { cls: 'badge-failed',  label: 'Failed' },
                penalty_pending:   { cls: 'badge-penalty', label: 'Penalty' },
                pending:           { cls: 'badge-pending', label: 'Pending' },
                in_progress:       { cls: 'badge-active',  label: 'In progress' },
                emergency_shifted: { cls: 'badge-pending', label: 'Shifted' }
              }[status] ?? { cls: 'badge-pending', label: status }

              return (
                <div key={instance.id} className="card" style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 20 }}>{icon}</span>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', marginBottom: 2 }}>
                        {title}
                      </p>
                      {instance.task?.scheduled_time && (
                        <p style={{ fontSize: 11, color: 'var(--text3)' }}>
                          ⏰ {instance.task.scheduled_time.slice(0, 5)}
                          {instance.active_seconds > 0 && ` · ${Math.round(instance.active_seconds / 60)} min active`}
                        </p>
                      )}
                    </div>
                    <span className={`badge ${badgeMap.cls}`}>{badgeMap.label}</span>
                  </div>
                </div>
              )
            })
          )}

          {/* Habits that day */}
          {habitComps.length > 0 && (
            <>
              <p className="section-header" style={{ marginTop: 12 }}>Habits</p>
              {habitComps.map(hc => (
                <div key={hc.id} className="card" style={{
                  marginBottom: 6,
                  display: 'flex', alignItems: 'center', gap: 10
                }}>
                  <span style={{ fontSize: 18 }}>{hc.habit?.icon ?? '⭐'}</span>
                  <span style={{
                    flex: 1, fontSize: 13, color: 'var(--text)',
                    textDecoration: hc.status === 'completed' ? 'none' : 'none'
                  }}>
                    {hc.habit?.title ?? 'Habit'}
                  </span>
                  <span className={`badge ${hc.status === 'completed' ? 'badge-done' : 'badge-failed'}`}>
                    {hc.status === 'completed' ? '✓' : '✗'}
                  </span>
                </div>
              ))}
            </>
          )}
        </>
      )}
    </div>
  )
}
