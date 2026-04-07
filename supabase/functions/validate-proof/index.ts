// supabase/functions/validate-proof/index.ts
// Called after proof upload to validate timer integrity.
// Anti-cheat Layer 1: timer inflation check
// Anti-cheat Layer 2: EXIF timestamp vs task start time

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const { instanceId, userId } = await req.json()
    if (!instanceId || !userId) {
      return json({ ok: false, error: 'Missing instanceId or userId' }, 400)
    }

    // Fetch instance with timer timestamps
    const { data: instance, error: instErr } = await supabase
      .from('daily_task_instances')
      .select('timer_started_at, timer_ended_at, active_seconds, status, task_id')
      .eq('id', instanceId)
      .eq('user_id', userId)
      .single()

    if (instErr || !instance) return json({ ok: false, error: 'Instance not found' }, 404)

    const flags: string[] = []

    // ── Anti-cheat Layer 1: Timer inflation ──────────────────────
    if (instance.timer_started_at && instance.timer_ended_at && instance.active_seconds) {
      const serverElapsed = Math.floor(
        (new Date(instance.timer_ended_at).getTime() -
         new Date(instance.timer_started_at).getTime()) / 1000
      )
      const tolerance = 60 // 1 min grace

      if (instance.active_seconds > serverElapsed + tolerance) {
        flags.push(`timer_inflation:reported=${instance.active_seconds}s,server=${serverElapsed}s`)

        // Log to behavior_logs
        await supabase.from('behavior_logs').insert({
          user_id:    userId,
          event_type: 'anticheat_timer_inflation',
          metadata: {
            instanceId,
            reported:  instance.active_seconds,
            server:    serverElapsed,
            delta:     instance.active_seconds - serverElapsed
          }
        })
      }
    }

    // ── Anti-cheat Layer 2: Proof upload timing ───────────────────
    // Check if photo_after was uploaded significantly before timer ended
    const { data: proofs } = await supabase
      .from('proofs')
      .select('proof_type, uploaded_at')
      .eq('instance_id', instanceId)

    if (proofs && instance.timer_started_at) {
      const afterProof = proofs.find(p => p.proof_type === 'photo_after')
      if (afterProof) {
        const uploadTime  = new Date(afterProof.uploaded_at).getTime()
        const startTime   = new Date(instance.timer_started_at).getTime()

        // Photo uploaded before timer even started?
        if (uploadTime < startTime - 5000) {
          flags.push('photo_predates_timer_start')
          await supabase.from('behavior_logs').insert({
            user_id:    userId,
            event_type: 'anticheat_photo_predates_timer',
            metadata:   { instanceId, uploadTime, startTime }
          })
        }
      }
    }

    return json({ ok: true, flags, clean: flags.length === 0 })

  } catch (err) {
    console.error('validate-proof error:', err)
    return json({ ok: false, error: err.message }, 500)
  }
})

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}
