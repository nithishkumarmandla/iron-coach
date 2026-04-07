import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import toast from 'react-hot-toast'
import { useStore } from '../store/useStore'
import { get30DayStats, getWeeklyReports, getCategoryBreakdown } from '../lib/whatsapp'

const LEVEL_THRESHOLDS = [
  { min: 0,    max: 499,   title: 'Recruit' },
  { min: 500,  max: 1499,  title: 'Soldier' },
  { min: 1500, max: 3499,  title: 'Warrior' },
  { min: 3500, max: 6999,  title: 'Elite' },
  { min: 7000, max: Infinity, title: 'Iron' }
]

function getLevel(xp) {
  return LEVEL_THRESHOLDS.find(l => xp >= l.min && xp <= l.max) ?? LEVEL_THRESHOLDS[0]
}

function getNextLevel(xp) {
  const idx = LEVEL_THRESHOLDS.findIndex(l => xp >= l.min && xp <= l.max)
  return LEVEL_THRESHOLDS[idx + 1] ?? null
}

const CATEGORY_COLORS = {
  'wake up':  '#4ade80',
  exercise:   '#f59e0b',
  study:      '#3b82f6',
  hustle:     '#a855f7',
  sleep:      '#64748b',
  custom:     '#6b7280'
}

// Custom tooltip for bar chart
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--bg2)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '8px 12px', fontSize: 12
    }}>
      <p style={{ color: 'var(--text2)', marginBottom: 2 }}>{label}</p>
      <p style={{ color: 'var(--accent)', fontWeight: 600 }}>{payload[0].value}% done</p>
    </div>
  )
}

export default function Performance() {
  const { user, profile } = useStore()
  const navigate          = useNavigate()

  const [chartData, setChartData]   = useState([])
  const [categories, setCategories] = useState([])
  const [weeklyRep, setWeeklyRep]   = useState([])
  const [loading, setLoading]       = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [chart, cats, weekly] = await Promise.all([
          get30DayStats(user.id),
          getCategoryBreakdown(user.id),
          getWeeklyReports(user.id, 4)
        ])
        setChartData(chart)
        setCategories(cats)
        setWeeklyRep(weekly)
      } catch {
        toast.error('Failed to load stats')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [user.id])

  const xp        = profile?.xp_total ?? 0
  const level     = getLevel(xp)
  const nextLevel = getNextLevel(xp)
  const xpProgress = nextLevel
    ? Math.round(((xp - level.min) / (nextLevel.min - level.min)) * 100)
    : 100

  const score  = Math.round(profile?.discipline_score ?? 0)
  const streak = profile?.total_streak ?? 0

  // Last 7 days average from chart data
  const last7     = chartData.slice(-7)
  const avg7      = last7.length
    ? Math.round(last7.reduce((s, d) => s + d.rate, 0) / last7.length)
    : 0

  if (loading) return <div className="spinner" />

  return (
    <div className="page">
      <h2 style={{ fontSize: 20, fontWeight: 600, color: 'var(--text)', marginBottom: 16 }}>Performance</h2>

      {/* Top stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
        <StatCard label="Score" value={score} unit="/100" color="var(--text)" />
        <StatCard label="Streak" value={streak} unit="days" color="var(--accent)" />
        <StatCard label="7-day avg" value={avg7} unit="%" color="var(--info)" />
      </div>

      {/* XP level card */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
          <div>
            <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 3 }}>Level</p>
            <p style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>{level.title}</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 3 }}>Total XP</p>
            <p style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent)' }}>
              {xp.toLocaleString()}
            </p>
          </div>
        </div>

        {nextLevel && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
              <p style={{ fontSize: 11, color: 'var(--text3)' }}>{level.title}</p>
              <p style={{ fontSize: 11, color: 'var(--text3)' }}>{nextLevel.title} at {nextLevel.min.toLocaleString()} XP</p>
            </div>
            <div style={{ height: 6, background: 'var(--bg3)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 3,
                background: 'var(--accent)',
                width: `${xpProgress}%`,
                transition: 'width 0.6s ease'
              }} />
            </div>
            <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 5, textAlign: 'right' }}>
              {(nextLevel.min - xp).toLocaleString()} XP to {nextLevel.title}
            </p>
          </>
        )}
        {!nextLevel && (
          <p style={{ fontSize: 12, color: 'var(--accent)', marginTop: 4 }}>Maximum level reached</p>
        )}
      </div>

      {/* 30-day completion chart */}
      <div className="card" style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', marginBottom: 14 }}>
          Completion rate — last 30 days
        </p>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={chartData} barSize={6} margin={{ top: 0, right: 0, left: -30, bottom: 0 }}>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 9, fill: 'var(--text3)' }}
                tickLine={false}
                axisLine={false}
                interval={6}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 9, fill: 'var(--text3)' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={v => `${v}%`}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Bar dataKey="rate" radius={[3, 3, 0, 0]}>
                {chartData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={entry.rate >= 80 ? '#4ade80' : entry.rate >= 50 ? '#f59e0b' : '#ef4444'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p style={{ fontSize: 13, color: 'var(--text3)', textAlign: 'center', padding: '20px 0' }}>
            No data yet — complete tasks to see your chart
          </p>
        )}
      </div>

      {/* Category breakdown */}
      {categories.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', marginBottom: 12 }}>
            By category — last 30 days
          </p>
          {categories.map(cat => (
            <div key={cat.category} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{
                  fontSize: 12, color: 'var(--text2)',
                  textTransform: 'capitalize'
                }}>
                  {cat.category}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text2)' }}>
                  {cat.completed}/{cat.total} · {cat.rate}%
                </span>
              </div>
              <div style={{ height: 5, background: 'var(--bg3)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 3,
                  background: CATEGORY_COLORS[cat.category] ?? '#6b7280',
                  width: `${cat.rate}%`,
                  transition: 'width 0.5s ease'
                }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Weekly reports summary */}
      {weeklyRep.length > 0 && (
        <>
          <p className="section-header">Recent weeks</p>
          {weeklyRep.map(report => (
            <div
              key={report.id}
              className="card"
              style={{ marginBottom: 8, cursor: 'pointer' }}
              onClick={() => navigate('/report', { state: { report } })}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', marginBottom: 2 }}>
                    Week of {new Date(report.week_start).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--text3)' }}>
                    {report.tasks_completed}/{report.tasks_completed + report.tasks_failed} tasks ·
                    {report.penalties_issued} penalties
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{
                    fontSize: 20, fontWeight: 700,
                    color: report.completion_rate >= 80 ? 'var(--accent)'
                      : report.completion_rate >= 50 ? 'var(--warn)' : 'var(--danger)'
                  }}>
                    {Math.round(report.completion_rate ?? 0)}%
                  </p>
                  <p style={{ fontSize: 10, color: 'var(--text3)' }}>›</p>
                </div>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

function StatCard({ label, value, unit, color }) {
  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 10px' }}>
      <p style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </p>
      <p style={{ fontSize: 22, fontWeight: 700, color }}>
        {value}<span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text3)' }}>{unit}</span>
      </p>
    </div>
  )
}
