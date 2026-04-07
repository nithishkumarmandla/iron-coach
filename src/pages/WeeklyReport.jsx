import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { useStore } from '../store/useStore'
import { getWeeklyReports } from '../lib/whatsapp'

export default function WeeklyReport() {
  const { user }    = useStore()
  const navigate    = useNavigate()
  const location    = useLocation()

  // Can be passed via navigation state from Performance screen
  const [report, setReport]   = useState(location.state?.report ?? null)
  const [loading, setLoading] = useState(!report)

  useEffect(() => {
    if (report) return
    async function load() {
      try {
        const reports = await getWeeklyReports(user.id, 1)
        if (reports.length > 0) setReport(reports[0])
      } catch {
        toast.error('Failed to load report')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [user.id, report])

  if (loading) return <div className="spinner" />

  if (!report) {
    return (
      <div className="page">
        <h2 style={{ fontSize: 20, fontWeight: 600, color: 'var(--text)', marginBottom: 20 }}>Weekly report</h2>
        <div className="card" style={{ textAlign: 'center', padding: '40px 16px' }}>
          <p style={{ fontSize: 15, color: 'var(--text2)', marginBottom: 8 }}>No report yet</p>
          <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 20 }}>
            Weekly reports are generated every Sunday night after your review.
          </p>
          <button
            className="btn btn-primary"
            style={{ width: 'auto', padding: '10px 24px', fontSize: 14 }}
            onClick={() => navigate('/contract')}
          >
            Generate weekly contract →
          </button>
        </div>
      </div>
    )
  }

  const weekStart   = format(new Date(report.week_start), 'MMM d')
  const weekEnd     = format(new Date(new Date(report.week_start).getTime() + 6 * 86400000), 'MMM d, yyyy')
  const rate        = Math.round(report.completion_rate ?? 0)
  const scoreColor  = rate >= 80 ? 'var(--accent)' : rate >= 50 ? 'var(--warn)' : 'var(--danger)'

  // Parse sections from ai_analysis text
  const sections = parseAIAnalysis(report.ai_analysis ?? '')

  return (
    <div className="page">
      <div style={{ marginBottom: 20 }}>
        <button
          onClick={() => navigate('/performance')}
          style={{ background: 'none', border: 'none', color: 'var(--text2)', fontSize: 14, cursor: 'pointer', padding: 0, marginBottom: 6 }}
        >
          ← Back
        </button>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>Weekly report</h2>
        <p style={{ fontSize: 13, color: 'var(--text2)' }}>{weekStart} — {weekEnd}</p>
      </div>

      {/* Score banner */}
      <div style={{
        background: 'var(--bg2)', border: `1px solid ${scoreColor}`,
        borderRadius: 12, padding: '16px 20px', marginBottom: 16
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
          <MiniStat label="Done" value={`${rate}%`} color={scoreColor} />
          <MiniStat label="Tasks" value={`${report.tasks_completed}/${(report.tasks_completed ?? 0) + (report.tasks_failed ?? 0)}`} color="var(--text)" />
          <MiniStat label="Penalties" value={report.penalties_issued ?? 0} color={report.penalties_issued > 0 ? 'var(--warn)' : 'var(--accent)'} />
          <MiniStat label="Streak" value={`${report.streak_days ?? 0}d`} color="var(--accent)" />
        </div>
      </div>

      {/* Difficulty change */}
      {report.difficulty_delta !== 0 && (
        <div style={{
          background: report.difficulty_delta > 0 ? 'var(--accent-dim)' : 'var(--warn-dim)',
          border: `1px solid ${report.difficulty_delta > 0 ? 'var(--accent)' : 'var(--warn)'}`,
          borderRadius: 10, padding: '10px 14px', marginBottom: 16,
          display: 'flex', alignItems: 'center', gap: 10
        }}>
          <span style={{ fontSize: 18 }}>{report.difficulty_delta > 0 ? '↑' : '↓'}</span>
          <p style={{
            fontSize: 13, fontWeight: 500,
            color: report.difficulty_delta > 0 ? 'var(--accent)' : 'var(--warn)'
          }}>
            Task difficulty {report.difficulty_delta > 0 ? 'increased' : 'decreased'} for next week
            {report.difficulty_delta > 0 ? ' — you earned it' : ' — rebuild consistency first'}
          </p>
        </div>
      )}

      {/* AI analysis sections */}
      {sections.review && (
        <div className="card" style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Review
          </p>
          <p style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.7 }}>{sections.review}</p>
        </div>
      )}

      {sections.lesson && (
        <div style={{
          background: 'var(--info-dim)', border: '1px solid var(--info)',
          borderRadius: 10, padding: '12px 14px', marginBottom: 12
        }}>
          <p style={{ fontSize: 11, color: 'var(--info)', marginBottom: 6, fontWeight: 600 }}>KEY LESSON</p>
          <p style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.6 }}>{sections.lesson}</p>
        </div>
      )}

      {sections.contract && sections.contract.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Next week commitments
          </p>
          {sections.contract.map((item, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 8, alignItems: 'flex-start' }}>
              <div style={{
                width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                background: 'var(--bg3)', border: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, color: 'var(--text3)', marginTop: 1
              }}>
                {i + 1}
              </div>
              <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>{item}</p>
            </div>
          ))}
        </div>
      )}

      {/* If parsing failed, show raw text */}
      {!sections.review && report.ai_analysis && (
        <div className="card" style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
            {report.ai_analysis}
          </p>
        </div>
      )}

      {/* Actions */}
      <button
        className="btn btn-primary"
        onClick={() => navigate('/contract')}
        style={{ marginBottom: 10, fontSize: 14 }}
      >
        View / accept weekly contract →
      </button>
      <button
        className="btn btn-secondary"
        onClick={() => navigate('/performance')}
        style={{ fontSize: 14 }}
      >
        Back to performance
      </button>
    </div>
  )
}

// Parse the structured AI output into sections
function parseAIAnalysis(text) {
  const result = { review: '', lesson: '', contract: [] }
  if (!text) return result

  const reviewMatch  = text.match(/REVIEW:\s*([\s\S]*?)(?=LESSON:|CONTRACT:|$)/i)
  const lessonMatch  = text.match(/LESSON:\s*([\s\S]*?)(?=CONTRACT:|REVIEW:|$)/i)
  const contractMatch = text.match(/CONTRACT:\s*([\s\S]*?)$/i)

  result.review  = reviewMatch?.[1]?.trim()  ?? ''
  result.lesson  = lessonMatch?.[1]?.trim()  ?? ''

  if (contractMatch?.[1]) {
    result.contract = contractMatch[1]
      .split('\n')
      .map(l => l.replace(/^[•\-\*]\s*/, '').trim())
      .filter(l => l.length > 5)
  }

  // Fallback: if no sections found, treat whole text as review
  if (!result.review && !result.lesson) {
    result.review = text.trim()
  }

  return result
}

function MiniStat({ label, value, color }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <p style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </p>
      <p style={{ fontSize: 18, fontWeight: 700, color }}>{value}</p>
    </div>
  )
}
