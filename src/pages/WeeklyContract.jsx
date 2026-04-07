import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, startOfWeek, endOfWeek, addDays } from 'date-fns'
import toast from 'react-hot-toast'
import { useStore } from '../store/useStore'
import { supabase } from '../lib/supabase'
import { getThisWeekContract, acceptContract } from '../lib/penalties'
import { logEvent } from '../lib/tasks'

export default function WeeklyContract() {
  const { user }   = useStore()
  const navigate   = useNavigate()

  const [contract, setContract]   = useState(null)
  const [loading, setLoading]     = useState(true)
  const [accepted, setAccepted]   = useState(false)
  const [typed, setTyped]         = useState('')
  const [saving, setSaving]       = useState(false)
  const [generating, setGenerating] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    try {
      const c = await getThisWeekContract(user.id)
      if (c) {
        setContract(c)
        setAccepted(c.schedule_changes?.accepted === true)
      }
    } catch { /* no contract yet */ }
    finally { setLoading(false) }
  }

  async function handleGenerate() {
    setGenerating(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/weekly-evolution`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({ userId: user.id, manual: true })
        }
      )
      if (!res.ok) throw new Error('Generation failed')
      toast.success('Contract generated')
      load()
    } catch {
      toast.error('Failed to generate contract')
    } finally {
      setGenerating(false)
    }
  }

  async function handleAccept() {
    if (typed.toLowerCase().trim() !== 'i accept') {
      return toast.error('Type exactly: I accept')
    }
    setSaving(true)
    try {
      await acceptContract(contract.id)
      await logEvent(user.id, 'contract_accepted', { contractId: contract.id })
      setAccepted(true)
      toast.success('Contract accepted. Now execute.')
    } catch {
      toast.error('Failed to save acceptance')
    } finally {
      setSaving(false)
    }
  }

  const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'MMM d')
  const weekEnd   = format(endOfWeek(new Date(), { weekStartsOn: 1 }), 'MMM d')

  if (loading) return <div className="spinner" />

  return (
    <div className="page">
      <button
        onClick={() => navigate('/')}
        style={{ background: 'none', border: 'none', color: 'var(--text2)', fontSize: 14, cursor: 'pointer', padding: 0, marginBottom: 16 }}
      >
        ← Back
      </button>

      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
          Weekly contract
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text2)' }}>
          {weekStart} — {weekEnd}
        </p>
      </div>

      {/* No contract yet */}
      {!contract && (
        <div className="card" style={{ textAlign: 'center', padding: '32px 16px' }}>
          <p style={{ fontSize: 15, color: 'var(--text)', marginBottom: 8 }}>
            No contract for this week yet
          </p>
          <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 20 }}>
            Available every Sunday after the weekly AI review.
            You can also generate it manually.
          </p>
          <button
            className="btn btn-primary"
            onClick={handleGenerate}
            disabled={generating}
            style={{ width: 'auto', padding: '10px 24px', fontSize: 14 }}
          >
            {generating ? 'Generating...' : 'Generate contract'}
          </button>
        </div>
      )}

      {/* Contract content */}
      {contract && (
        <>
          {accepted && (
            <div style={{
              background: 'var(--accent-dim)', border: '1px solid var(--accent)',
              borderRadius: 10, padding: 12, marginBottom: 16,
              display: 'flex', alignItems: 'center', gap: 10
            }}>
              <span style={{ fontSize: 18 }}>✓</span>
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>Contract accepted</p>
                <p style={{ fontSize: 11, color: 'var(--accent)', opacity: 0.8 }}>
                  {format(new Date(contract.schedule_changes?.accepted_at ?? new Date()), 'MMM d · h:mm a')}
                </p>
              </div>
            </div>
          )}

          {/* Contract body */}
          <div style={{
            background: 'var(--bg2)', border: '1px solid var(--border)',
            borderRadius: 12, padding: 20, marginBottom: 20
          }}>
            <p style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 12, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              This week's commitments
            </p>
            <p style={{
              fontSize: 14, color: 'var(--text)', lineHeight: 1.8,
              whiteSpace: 'pre-wrap'
            }}>
              {contract.ai_analysis}
            </p>
          </div>

          {/* Schedule changes */}
          {contract.schedule_changes && !contract.schedule_changes.accepted && (
            <div style={{
              background: 'var(--info-dim)', border: '1px solid var(--info)',
              borderRadius: 10, padding: 14, marginBottom: 20
            }}>
              <p style={{ fontSize: 12, color: 'var(--info)', fontWeight: 500, marginBottom: 6 }}>
                AI schedule adjustments for this week:
              </p>
              <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>
                {JSON.stringify(contract.schedule_changes, null, 2)
                  .replace(/[{}"]/g, '')
                  .replace(/,\n/g, '\n')
                  .trim()}
              </p>
            </div>
          )}

          {/* Accept section */}
          {!accepted && (
            <div>
              <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 12, lineHeight: 1.6 }}>
                By typing <strong style={{ color: 'var(--text)' }}>"I accept"</strong> below,
                you commit to every item in this contract. The AI coach will hold you to this
                for the rest of the week.
              </p>
              <input
                value={typed}
                onChange={e => setTyped(e.target.value)}
                placeholder='Type "I accept" to confirm'
                style={{ marginBottom: 12, fontSize: 15 }}
              />
              <button
                className="btn btn-primary"
                onClick={handleAccept}
                disabled={typed.toLowerCase().trim() !== 'i accept' || saving}
                style={{
                  opacity: typed.toLowerCase().trim() === 'i accept' ? 1 : 0.4,
                  fontSize: 15, padding: '13px 0'
                }}
              >
                {saving ? 'Saving...' : 'Accept contract'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
