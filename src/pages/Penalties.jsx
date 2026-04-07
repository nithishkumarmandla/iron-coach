import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, isPast } from 'date-fns'
import toast from 'react-hot-toast'
import { useStore } from '../store/useStore'
import { getPenalties, completePenalty } from '../lib/penalties'
import { uploadProofImage, uploadThumbnail, saveProofRow } from '../lib/proofs'
import { compressProofImage } from '../hooks/useImageCompressor'
import { logEvent } from '../lib/tasks'

const LEVEL_STYLE = {
  1: { color: 'var(--warn)',   bg: 'var(--warn-dim)',   label: 'Level 1' },
  2: { color: '#f97316',       bg: '#2a1500',           label: 'Level 2' },
  3: { color: 'var(--danger)', bg: 'var(--danger-dim)', label: 'Level 3' }
}

export default function Penalties() {
  const { user }    = useStore()
  const navigate    = useNavigate()

  const [active, setActive]       = useState([])
  const [history, setHistory]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [uploading, setUploading] = useState(null)   // penalty id being processed
  const [showHistory, setShowHistory] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    try {
      setLoading(true)
      const all = await getPenalties(user.id)
      setActive(all.filter(p => p.status === 'pending'))
      setHistory(all.filter(p => p.status !== 'pending'))
    } catch {
      toast.error('Failed to load penalties')
    } finally {
      setLoading(false)
    }
  }

  async function handleProofUpload(penalty, file) {
    if (!file) return
    setUploading(penalty.id)
    try {
      const { compressed, thumbnail } = await compressProofImage(file)
      const [fullPath, thumbPath] = await Promise.all([
        uploadProofImage(user.id, penalty.id, 'penalty', compressed),
        uploadThumbnail(user.id, penalty.id, 'penalty', thumbnail)
      ])
      const proofId = await saveProofRow(
        user.id, penalty.id, 'photo_after', fullPath, thumbPath
      )
      await completePenalty(penalty.id, proofId)
      await logEvent(user.id, 'penalty_completed', { penaltyId: penalty.id })
      toast.success('Penalty completed!')
      load()
    } catch {
      toast.error('Upload failed — try again')
    } finally {
      setUploading(null)
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
        <h2 style={{ fontSize: 20, fontWeight: 600, color: 'var(--text)' }}>Penalties</h2>
        <p style={{ fontSize: 13, color: 'var(--text2)', marginTop: 3 }}>
          {active.length === 0 ? 'No active penalties' : `${active.length} penalty${active.length > 1 ? 'ies' : ''} due`}
        </p>
      </div>

      {/* Active penalties */}
      {active.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '32px 16px' }}>
          <p style={{ fontSize: 15, color: 'var(--accent)', fontWeight: 500 }}>✓ All clear</p>
          <p style={{ fontSize: 13, color: 'var(--text2)', marginTop: 6 }}>No active penalties</p>
        </div>
      ) : (
        active.map(penalty => (
          <PenaltyCard
            key={penalty.id}
            penalty={penalty}
            uploading={uploading === penalty.id}
            onUpload={(file) => handleProofUpload(penalty, file)}
          />
        ))
      )}

      {/* History toggle */}
      {history.length > 0 && (
        <>
          <button
            onClick={() => setShowHistory(v => !v)}
            style={{
              background: 'none', border: 'none', color: 'var(--text2)',
              fontSize: 13, cursor: 'pointer', padding: '8px 0', width: '100%',
              textAlign: 'left', marginTop: 8
            }}
          >
            {showHistory ? '▲' : '▼'} History ({history.length})
          </button>

          {showHistory && history.map(penalty => (
            <div key={penalty.id} className="card" style={{ opacity: 0.6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <p style={{ fontSize: 14, color: 'var(--text)', marginBottom: 3 }}>{penalty.description}</p>
                  <p style={{ fontSize: 12, color: 'var(--text3)' }}>
                    {penalty.instance?.task?.title ?? 'Task'} · {format(new Date(penalty.due_date), 'MMM d')}
                  </p>
                </div>
                <span className={`badge ${penalty.status === 'completed' ? 'badge-done' : 'badge-failed'}`}>
                  {penalty.status}
                </span>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

// ─── Penalty card with proof upload ───────────────────────────
function PenaltyCard({ penalty, uploading, onUpload }) {
  const fileRef = React.useRef(null)
  const level   = penalty.escalation_level ?? 1
  const style   = LEVEL_STYLE[level] ?? LEVEL_STYLE[1]
  const overdue = isPast(new Date(penalty.due_date + 'T23:59:00'))

  return (
    <div className="card" style={{ marginBottom: 12, borderColor: style.color }}>
      {/* Level badge */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 10, fontWeight: 600, padding: '2px 8px',
              borderRadius: 20, background: style.bg, color: style.color,
              border: `1px solid ${style.color}`
            }}>
              {style.label}
            </span>
            {overdue && (
              <span style={{ fontSize: 10, color: 'var(--danger)', fontWeight: 600 }}>OVERDUE</span>
            )}
          </div>
          <p style={{ fontSize: 15, fontWeight: 500, color: 'var(--text)', marginBottom: 4 }}>
            {penalty.description}
          </p>
          <p style={{ fontSize: 12, color: 'var(--text2)' }}>
            From: {penalty.instance?.task?.title ?? 'Failed task'} ·
            Due: {format(new Date(penalty.due_date), 'MMM d')}
            {penalty.duration_mins && ` · ${penalty.duration_mins} min`}
          </p>
        </div>
      </div>

      {/* Parent penalty note */}
      {penalty.parent_penalty_id && (
        <p style={{
          fontSize: 11, color: style.color, background: style.bg,
          padding: '6px 10px', borderRadius: 6, marginBottom: 10
        }}>
          ⚠ Escalated from missed penalty
        </p>
      )}

      {/* Proof upload */}
      {penalty.proof_required && (
        <>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={e => onUpload(e.target.files?.[0])}
          />
          <button
            className="btn btn-danger"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            style={{ fontSize: 13 }}
          >
            {uploading ? 'Uploading...' : '📷 Submit proof & complete'}
          </button>
        </>
      )}
    </div>
  )
}

// Need React for useRef in PenaltyCard
import React from 'react'
