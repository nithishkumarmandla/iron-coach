// supabase/functions/assess-emergency/index.ts
// Called when user submits an emergency request.
// Claude assesses legitimacy and detects abuse patterns.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.27.0'

const supabase  = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)
const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! })

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  try {
    const token = req.headers.get('Authorization')?.replace('Bearer ', '')
    const { data: { user } } = await supabase.auth.getUser(token!)
    if (!user) return json({ error: 'Unauthorized' }, 401)

    const { emergencyId, reason, taskTitle, userId } = await req.json()

    // Get past emergency history for this user
    const { data: history } = await supabase
      .from('emergency_events')
      .select('reason, approved, abuse_flag, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5)

    const historyText = history && history.length > 0
      ? history.map(h =>
          `  [${h.created_at?.slice(0, 10)}] "${h.reason}" → ${h.approved ? 'approved' : 'denied'}${h.abuse_flag ? ' (abuse flagged)' : ''}`
        ).join('\n')
      : '  No previous emergencies.'

    // Ask Claude to assess
    const response = await anthropic.messages.create({
      model:      'claude-haiku-4-5',
      max_tokens: 200,
      system: `You are IRON COACH assessing an emergency request. Be strict but fair.
A genuine emergency: illness, family crisis, unavoidable work conflict, natural disaster.
NOT an emergency: tiredness, poor planning, forgetting, social events, "not feeling like it".

Respond ONLY with valid JSON in this exact format:
{"approved": true/false, "verdict": "your response to the user under 80 words", "abuse_flag": true/false}

abuse_flag = true if: reason is vague/dishonest, similar reasons used repeatedly, or pattern suggests avoidance.`,
      messages: [{
        role: 'user',
        content: `Task: ${taskTitle}
Reason given: "${reason}"

Past emergency history:
${historyText}

Assess this request.`
      }]
    })

    const rawText = response.content[0].type === 'text' ? response.content[0].text : ''

    let result = { approved: false, verdict: 'Could not assess. Task remains due.', abuse_flag: false }
    try {
      result = JSON.parse(rawText)
    } catch {
      // Try to extract JSON from response
      const match = rawText.match(/\{[\s\S]*\}/)
      if (match) result = JSON.parse(match[0])
    }

    // If abuse detected, switch coach mode to strict
    if (result.abuse_flag) {
      await supabase.from('profiles')
        .update({ coach_mode: 'strict' })
        .eq('id', userId)

      await supabase.from('behavior_logs').insert({
        user_id:    userId,
        event_type: 'emergency_abuse_detected',
        metadata:   { emergencyId, reason }
      })
    }

    return json(result)

  } catch (err) {
    console.error('assess-emergency error:', err)
    return json({ approved: false, verdict: 'Assessment failed. Task remains due.', abuse_flag: false }, 500)
  }
})

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}
