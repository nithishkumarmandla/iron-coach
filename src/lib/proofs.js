import { supabase } from './supabase'

// ─── UPLOAD ───────────────────────────────────────────────────

/**
 * Upload a compressed image to Supabase Storage.
 * Path: proofs/{userId}/{YYYY-MM}/{instanceId}_{type}.webp
 */
export async function uploadProofImage(userId, instanceId, type, compressedBlob) {
  const month = new Date().toISOString().slice(0, 7)        // "2025-01"
  const path  = `${userId}/${month}/${instanceId}_${type}.webp`

  const { error } = await supabase.storage
    .from('proofs')
    .upload(path, compressedBlob, {
      contentType: 'image/webp',
      upsert: true                                           // replace if re-submitting
    })

  if (error) throw error
  return path
}

/**
 * Upload a thumbnail (smaller WebP) to same bucket.
 */
export async function uploadThumbnail(userId, instanceId, type, thumbBlob) {
  const month = new Date().toISOString().slice(0, 7)
  const path  = `${userId}/${month}/${instanceId}_${type}_thumb.webp`

  const { error } = await supabase.storage
    .from('proofs')
    .upload(path, thumbBlob, { contentType: 'image/webp', upsert: true })

  if (error) throw error
  return path
}

// ─── SAVE PROOF ROW ───────────────────────────────────────────

export async function saveProofRow(userId, instanceId, proofType, storagePath, thumbnailPath) {
  const { data, error } = await supabase
    .from('proofs')
    .insert({
      instance_id:    instanceId,
      user_id:        userId,
      proof_type:     proofType,        // 'photo_before' | 'photo_after' | 'timer_log'
      storage_path:   storagePath,
      thumbnail_path: thumbnailPath,
      uploaded_at:    new Date().toISOString()
    })
    .select('id')
    .single()

  if (error) throw error
  return data.id
}

/**
 * Auto-create a timer_log proof row (no image file needed).
 */
export async function saveTimerProof(userId, instanceId, activeSeconds, timerValid) {
  const { data, error } = await supabase
    .from('proofs')
    .insert({
      instance_id:   instanceId,
      user_id:       userId,
      proof_type:    'timer_log',
      timer_seconds: activeSeconds,
      timer_valid:   timerValid,
      uploaded_at:   new Date().toISOString()
    })
    .select('id')
    .single()

  if (error) throw error
  return data.id
}

// ─── GET PROOFS ────────────────────────────────────────────────

export async function getProofsForInstance(instanceId) {
  const { data, error } = await supabase
    .from('proofs')
    .select('*')
    .eq('instance_id', instanceId)
  if (error) throw error
  return data ?? []
}

/**
 * Get a signed URL so the image can be displayed in <img>.
 * Signed URLs expire in 1 hour.
 */
export async function getSignedUrl(storagePath) {
  const { data, error } = await supabase.storage
    .from('proofs')
    .createSignedUrl(storagePath, 3600)
  if (error) throw error
  return data.signedUrl
}

// ─── VALIDATE TIMER (anti-cheat layer 1) ──────────────────────

/**
 * Server-side timer validation:
 * Reported activeSeconds must not exceed server-calculated elapsed + 60s tolerance.
 * Returns { valid, reason }.
 */
export function validateTimerLocally(timerStartedAt, timerEndedAt, reportedSeconds) {
  if (!timerStartedAt || !timerEndedAt) return { valid: false, reason: 'missing_timestamps' }

  const serverElapsed = Math.floor(
    (new Date(timerEndedAt) - new Date(timerStartedAt)) / 1000
  )
  const tolerance = 60

  if (reportedSeconds > serverElapsed + tolerance) {
    return {
      valid: false,
      reason: `timer_inflation: reported ${reportedSeconds}s, server saw ${serverElapsed}s`
    }
  }
  return { valid: true, reason: null }
}
