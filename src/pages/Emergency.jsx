import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useStore } from '../store/useStore'
import { supabase } from '../lib/supabase'
import {
  createEmergencyRequest, resolveEmergency,
  shiftInstance, useEmergency
} from '../lib/penalties'
import { logEvent } from '../lib/tasks'
import { addDays, format } from 'date-fns'

export default function Emergency() {
  const { instanceId } = useParams()
  const navigate       = useNavigate()
  const { user }       = useStore()

  const [instance, setInstance]   = useState(null)
  const [reason, setReason]       = useState('')
  const [loading, setLoading]     = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [verdict, setVerdict]     = useState(null)   // { approved, text, abuseFlag }
  const [usage, setUsage]         = useState(null)   // { used, limit }

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from('daily_task_instances')
        .select('*, task:tasks(title, duration_mins)')
        .eq('id', instanceId)
        .single()
      if (error) { toast.error('Task not found'); navigate('/'); return }
      setInstance(data)

      // Get current emergency usage
      const { data: profile } = await supabase
        .from('profiles')
        .select('emergency_used, emergency_limit, emergency_reset_date')
        .eq('id', user.id)
        .single()

      const now = new Date()
      const resetMonth = profile?.emergency_reset_date
        ? new Date(profile.emergency_reset_date).getMonth() : -1
      const used = now.getMonth() !== resetMonth ? 0 : (profile?.emergency_used ?? 0)
      setUsage({ used, limit: profile?.emergency_limit ?? 2 })

      setLoading(false)
    }
    load()
  }, [instanceId, user.id, navigate])

  async function handleSubmit() {
    if (reason.trim().length < 20) {
      return toast.error('Explain your emergency (at least 20 characters)')
    }
    setSubmitting(true)

    try {
      // Check + increment counter first
      await useEmergency(user.id)

      // Create emergency event record
      const emergencyId = await createEmergencyRequest(user.id, instanceId, reason.trim())

      // Call AI to assess
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/assess-emergency`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            emergencyId,
            reason: reason.trim(),
            taskTitle: instance?.task?.title ?? 'Task',
            userId: user.id
          })
        }
      )

      const data = await res.json()

      if (data.approved) {
        // Shift task to tomorrow
        const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd')
        await shiftInstance(instanceId, tomorrow)
        await resolveEmergency(emergencyId, true, data.verdict, data.abuseFlag)
      } else {
        await resolveEmergency(emergencyId, false, data.verdict, data.abuseFlag)
      }

      await logEvent(user.id, 'emergency_requested', {
        instanceId, approved: data.approved, abuseFlag: data.abuseFlag
      })

      setVerdict({ approved: data.approved, text: data.verdict, abuseFlag: data.abuseFlag })

    } catch (err) {
      if (err.message.includes('limit')) {
        toast.error(err.message)
      } else {
        toast.error('Failed to submit — check connection')
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div className="spinner" />

  const taskTitle   = instance?.task?.title ?? instance?.one_off_title ?? 'Task'
  const remaining   = usage ? usage.limit - usage.used : 0

  return (
    <div className="page">
      <button
        onClick={() => navigate('/')}
        style={{ background: 'none', border: 'none', color: 'var(--text2)', fontSize: 14, cursor: 'pointer', padding: 0, marginBottom: 16 }}
      >
        ← Back
      </button>

      {/* Verdict screen */}
      {verdict ? (
        <VerdictScreen
          verdict={verdict}
          taskTitle={taskTitle}
          onDone={() => navigate('/')}
        />
      ) : (
        <>
          <div style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: 20, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
              Emergency request
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text2)' }}>Task: {taskTitle}</p>
          </div>

          {/* Usage indicator */}
          <div style={{
            background: remaining <= 1 ? 'var(--danger-dim)' : 'var(--bg2)',
            border: `1px solid ${remaining <= 1 ? 'var(--danger)' : 'var(--border)'}`,
            borderRadius: 10, padding: 14, marginBottom: 20
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>
                Emergency uses this month
              </p>
              <span style={{
                fontSize: 20, fontWeight: 700,
                color: remaining <= 1 ? 'var(--danger)' : 'var(--text)'
              }}>
                {usage?.used ?? 0} / {usage?.limit ?? 2}
              </span>
            </div>
            {remaining <= 1 && (
              <p style={{ fontSize: 12, color: 'var(--danger)', marginTop: 6 }}>
                {remaining === 0 ? 'No emergencies left this month' : 'Last emergency use this month'}
              </p>
            )}
          </div>

          {/* Rules */}
          <div style={{
            background: 'var(--bg2)', border: '1px solid var(--border)',
            borderRadius: 10, padding: 14, marginBottom: 20
          }}>
            <p style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.7 }}>
              • Task will be <strong style={{ color: 'var(--text)' }}>shifted to tomorrow</strong> — not removed<br />
              • AI assesses your reason — approval is not guaranteed<br />
              • Repeated abuse will trigger stricter coach mode<br />
              • You must complete the shifted task tomorrow
            </p>
          </div>

          {/* Reason input */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 13, color: 'var(--text2)', display: 'block', marginBottom: 8 }}>
              Explain your emergency
            </label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Be honest and specific. What happened that genuinely prevents you from completing this task today?"
              rows={5}
              style={{ resize: 'none', lineHeight: 1.6, fontSize: 14 }}
            />
            <p style={{
              fontSize: 11, textAlign: 'right', marginTop: 4,
              color: reason.length < 20 ? 'var(--text3)' : 'var(--text2)'
            }}>
              {reason.length} characters {reason.length < 20 ? `(${20 - reason.length} more needed)` : '✓'}
            </p>
          </div>

          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={submitting || reason.trim().length < 20 || remaining <= 0}
            style={{
              opacity: reason.trim().length >= 20 && remaining > 0 ? 1 : 0.4,
              fontSize: 15, padding: '13px 0'
            }}
          >
            {submitting ? 'AI is assessing...' : 'Submit to AI coach'}
          </button>
        </>
      )}
    </div>
  )
}

// ─── Verdict display ───────────────────────────────────────────
function VerdictScreen({ verdict, taskTitle, onDone }) {
  const approved = verdict.approved

  return (
    <div>
      <div style={{
        background: approved ? 'var(--accent-dim)' : 'var(--danger-dim)',
        border: `1px solid ${approved ? 'var(--accent)' : 'var(--danger)'}`,
        borderRadius: 12, padding: 20, marginBottom: 20, textAlign: 'center'
      }}>
        <div style={{ fontSize: 36, marginBottom: 10 }}>
          {approved ? '✓' : '✗'}
        </div>
        <p style={{
          fontSize: 18, fontWeight: 700,
          color: approved ? 'var(--accent)' : 'var(--danger)',
          marginBottom: 8
        }}>
          {approved ? 'Emergency approved' : 'Emergency denied'}
        </p>
        <p style={{ fontSize: 13, color: 'var(--text2)' }}>
          {approved
            ? `"${taskTitle}" has been shifted to tomorrow.`
            : `"${taskTitle}" remains due today.`}
        </p>
      </div>

      {/* AI verdict */}
      <div className="card" style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>Iron Coach says:</p>
        <p style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.6 }}>
          {verdict.text}
        </p>
      </div>

      {/* Abuse warning */}
      {verdict.abuseFlag && (
        <div style={{
          background: 'var(--danger-dim)', border: '1px solid var(--danger)',
          borderRadius: 10, padding: 14, marginBottom: 20
        }}>
          <p style={{ fontSize: 13, color: 'var(--danger)', fontWeight: 500 }}>
            ⚠ Abuse pattern detected
          </p>
          <p style={{ fontSize: 12, color: 'var(--danger)', opacity: 0.8, marginTop: 4 }}>
            Coach mode has been switched to strict. Repeated abuse will disable emergency mode.
          </p>
        </div>
      )}

      <button className="btn btn-primary" onClick={onDone} style={{ fontSize: 15, padding: '13px 0' }}>
        Back to dashboard
      </button>
    </div>
  )
}
