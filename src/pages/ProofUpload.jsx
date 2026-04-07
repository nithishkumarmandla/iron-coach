import { useState, useRef, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useStore } from '../store/useStore'
import { supabase } from '../lib/supabase'
import { compressProofImage } from '../hooks/useImageCompressor'
import {
  uploadProofImage, uploadThumbnail,
  saveProofRow, getProofsForInstance
} from '../lib/proofs'
import { updateInstanceStatus, logEvent } from '../lib/tasks'
import { awardXP, checkPerfectDay } from '../lib/xp'

export default function ProofUpload() {
  const { instanceId } = useParams()
  const navigate       = useNavigate()
  const { user }       = useStore()

  const [instance, setInstance]       = useState(null)
  const [existingProofs, setExisting] = useState([])
  const [loading, setLoading]         = useState(true)
  const [uploading, setUploading]     = useState(null)  // 'before' | 'after' | null
  const [previews, setPreviews]       = useState({ before: null, after: null })
  const [uploaded, setUploaded]       = useState({ before: false, after: false })
  const [submitting, setSubmitting]   = useState(false)

  const beforeInput = useRef(null)
  const afterInput  = useRef(null)

  // Load instance details
  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from('daily_task_instances')
        .select('*, task:tasks(title, proof_type, duration_mins)')
        .eq('id', instanceId)
        .single()

      if (error) { toast.error('Task not found'); navigate('/'); return }

      setInstance(data)
      const proofs = await getProofsForInstance(instanceId)
      setExisting(proofs)

      // Mark already-uploaded proofs
      const hasBefore = proofs.some(p => p.proof_type === 'photo_before')
      const hasAfter  = proofs.some(p => p.proof_type === 'photo_after')
      setUploaded({ before: hasBefore, after: hasAfter })

      setLoading(false)
    }
    load()
  }, [instanceId, navigate])

  // Determine what proof types are needed
  const proofTypes = instance?.task?.proof_type ?? ['photo']
  const needsBefore = proofTypes.includes('photo') || proofTypes.includes('both')
  const needsAfter  = proofTypes.includes('photo') || proofTypes.includes('both')
  const isViewMode  = instance?.status === 'completed'

  async function handlePhotoSelect(type, file) {
    if (!file) return
    setUploading(type)

    // Preview immediately
    const objectUrl = URL.createObjectURL(file)
    setPreviews(p => ({ ...p, [type]: objectUrl }))

    try {
      const { compressed, thumbnail } = await compressProofImage(file)

      const [fullPath, thumbPath] = await Promise.all([
        uploadProofImage(user.id, instanceId, type, compressed),
        uploadThumbnail(user.id, instanceId, type, thumbnail)
      ])

      await saveProofRow(user.id, instanceId, `photo_${type}`, fullPath, thumbPath)
      await logEvent(user.id, 'proof_uploaded', { instanceId, type })

      setUploaded(u => ({ ...u, [type]: true }))
      toast.success(`${type === 'before' ? 'Before' : 'After'} photo saved`)
    } catch (err) {
      toast.error('Upload failed — try again')
      setPreviews(p => ({ ...p, [type]: null }))
    } finally {
      setUploading(null)
    }
  }

  async function handleSubmit() {
    if (needsBefore && !uploaded.before) return toast.error('Before photo required')
    if (needsAfter  && !uploaded.after)  return toast.error('After photo required')

    setSubmitting(true)
    try {
      await updateInstanceStatus(instanceId, 'completed')
      await logEvent(user.id, 'task_completed_with_proof', { instanceId })

      // Award XP + check perfect day
      const xpResult = await awardXP(user.id, 'task_completed')
      await checkPerfectDay(user.id)

      if (xpResult?.levelUp) {
        toast.success(`🔥 Level up! You are now: ${xpResult.newTitle}`)
      } else if (xpResult) {
        toast.success(`Task complete! +${xpResult.points} XP`)
      } else {
        toast.success('Task marked complete!')
      }
      navigate('/')
    } catch {
      toast.error('Failed to complete task')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div className="spinner" />

  const title = instance?.task?.title ?? instance?.one_off_title ?? 'Task'
  const allDone = (!needsBefore || uploaded.before) && (!needsAfter || uploaded.after)

  return (
    <div className="page">
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <button
          onClick={() => navigate('/')}
          style={{ background: 'none', border: 'none', color: 'var(--text2)', fontSize: 14, cursor: 'pointer', padding: 0, marginBottom: 6 }}
        >
          ← Back
        </button>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: 'var(--text)' }}>
          {isViewMode ? 'Proof submitted' : 'Submit proof'}
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4 }}>{title}</p>
      </div>

      {/* Steps */}
      {!isViewMode && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          <StepDot
            num={1}
            label="Before photo"
            done={uploaded.before}
            required={needsBefore}
          />
          <div style={{ flex: 1, height: 1, background: 'var(--border)', alignSelf: 'center' }} />
          <StepDot
            num={2}
            label="After photo"
            done={uploaded.after}
            required={needsAfter}
          />
        </div>
      )}

      {/* Before photo */}
      {needsBefore && (
        <PhotoSlot
          label="Before"
          sublabel="Take photo BEFORE starting"
          done={uploaded.before}
          uploading={uploading === 'before'}
          preview={previews.before}
          existingPath={existingProofs.find(p => p.proof_type === 'photo_before')?.thumbnail_path}
          isViewMode={isViewMode}
          onTake={() => beforeInput.current?.click()}
        />
      )}

      {/* After photo */}
      {needsAfter && (
        <PhotoSlot
          label="After"
          sublabel="Take photo AFTER completing"
          done={uploaded.after}
          uploading={uploading === 'after'}
          preview={previews.after}
          existingPath={existingProofs.find(p => p.proof_type === 'photo_after')?.thumbnail_path}
          isViewMode={isViewMode}
          onTake={() => afterInput.current?.click()}
        />
      )}

      {/* Hidden file inputs — direct camera on Android */}
      <input
        ref={beforeInput}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={e => handlePhotoSelect('before', e.target.files?.[0])}
      />
      <input
        ref={afterInput}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={e => handlePhotoSelect('after', e.target.files?.[0])}
      />

      {/* Submit button */}
      {!isViewMode && (
        <div style={{ marginTop: 24 }}>
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={!allDone || submitting}
            style={{
              opacity: allDone ? 1 : 0.4,
              fontSize: 16,
              padding: '14px 0'
            }}
          >
            {submitting ? 'Completing...' : 'Mark task complete'}
          </button>
          {!allDone && (
            <p style={{ fontSize: 12, color: 'var(--text3)', textAlign: 'center', marginTop: 10 }}>
              Upload all required photos to continue
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Step indicator ────────────────────────────────────────────
function StepDot({ num, label, done, required }) {
  if (!required) return null
  return (
    <div style={{ textAlign: 'center', flex: 1 }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%', margin: '0 auto 4px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 13, fontWeight: 600,
        background: done ? 'var(--accent)' : 'var(--bg3)',
        border: `1px solid ${done ? 'var(--accent)' : 'var(--border)'}`,
        color: done ? '#000' : 'var(--text3)'
      }}>
        {done ? '✓' : num}
      </div>
      <p style={{ fontSize: 11, color: done ? 'var(--accent)' : 'var(--text3)' }}>{label}</p>
    </div>
  )
}

// ─── Photo slot ────────────────────────────────────────────────
function PhotoSlot({ label, sublabel, done, uploading, preview, isViewMode, onTake }) {
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div>
          <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>{label} photo</p>
          {!done && <p style={{ fontSize: 12, color: 'var(--text2)' }}>{sublabel}</p>}
        </div>
        {done && <span className="badge badge-done">✓ Uploaded</span>}
      </div>

      {preview ? (
        <img
          src={preview}
          alt={`${label} proof`}
          style={{ width: '100%', borderRadius: 8, maxHeight: 220, objectFit: 'cover' }}
        />
      ) : (
        <div style={{
          height: 140, background: 'var(--bg3)', borderRadius: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '1px dashed var(--border)'
        }}>
          {uploading ? (
            <div>
              <div className="spinner" style={{ margin: '0 auto 8px' }} />
              <p style={{ fontSize: 12, color: 'var(--text2)' }}>Compressing & uploading...</p>
            </div>
          ) : (
            <p style={{ fontSize: 13, color: 'var(--text3)' }}>No photo yet</p>
          )}
        </div>
      )}

      {!isViewMode && !done && !uploading && (
        <button
          className="btn btn-secondary"
          onClick={onTake}
          style={{ marginTop: 10, fontSize: 14 }}
        >
          📷 Take {label.toLowerCase()} photo
        </button>
      )}
    </div>
  )
}