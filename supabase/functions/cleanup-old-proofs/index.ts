// supabase/functions/cleanup-old-proofs/index.ts
// Cron: "0 2 1 * *" (2am UTC on 1st of every month)
// Deletes proof files + DB rows older than 90 days.
// Skips proofs linked to pending penalties or flagged for anti-cheat.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

Deno.serve(async () => {
  try {
    const cutoff = new Date(Date.now() - 90 * 86400000).toISOString()

    // Find old proofs — skip those linked to active penalties or flagged
    const { data: oldProofs, error } = await supabase
      .from('proofs')
      .select('id, storage_path, thumbnail_path, instance_id')
      .lt('uploaded_at', cutoff)
      .eq('ai_verified', true)   // only delete verified ones — keep disputed

    if (error) throw error
    if (!oldProofs || oldProofs.length === 0) return ok({ deleted: 0 })

    // Filter out proofs linked to pending penalties
    const instanceIds = oldProofs.map(p => p.instance_id).filter(Boolean)
    const { data: activePenalties } = await supabase
      .from('penalties')
      .select('instance_id')
      .in('instance_id', instanceIds)
      .in('status', ['pending', 'escalated'])

    const protectedInstances = new Set((activePenalties ?? []).map(p => p.instance_id))

    const toDelete = oldProofs.filter(p => !protectedInstances.has(p.instance_id))
    if (toDelete.length === 0) return ok({ deleted: 0, skipped: oldProofs.length })

    // Delete storage files
    const storagePaths = [
      ...toDelete.map(p => p.storage_path).filter(Boolean),
      ...toDelete.map(p => p.thumbnail_path).filter(Boolean)
    ]

    if (storagePaths.length > 0) {
      await supabase.storage.from('proofs').remove(storagePaths)
    }

    // Delete DB rows
    const idsToDelete = toDelete.map(p => p.id)
    await supabase.from('proofs').delete().in('id', idsToDelete)

    console.log(`Cleanup: deleted ${toDelete.length} proofs, skipped ${oldProofs.length - toDelete.length}`)

    return ok({ deleted: toDelete.length, skipped: oldProofs.length - toDelete.length })

  } catch (err) {
    console.error('cleanup-old-proofs error:', err)
    return new Response(JSON.stringify({ ok: false, error: err.message }), { status: 500 })
  }
})

function ok(data: unknown) {
  return new Response(JSON.stringify({ ok: true, ...data }), {
    headers: { 'Content-Type': 'application/json' }
  })
}