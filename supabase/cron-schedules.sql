-- =================================================================
-- IRON COACH — CRON SCHEDULES
-- Run this in Supabase SQL Editor AFTER enabling pg_cron extension.
-- Dashboard → Database → Extensions → enable pg_cron first.
-- =================================================================

-- Replace YOUR_PROJECT_REF and YOUR_SERVICE_ROLE_KEY with real values.
-- Service role key: Supabase Dashboard → Settings → API → service_role key

-- 1. Generate daily task instances — midnight UTC
SELECT cron.schedule(
  'generate-daily-instances',
  '0 0 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/generate-daily-instances',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
    body    := '{}'::jsonb
  )
  $$
);

-- 2. Morning brief — 1:30am UTC (~7am IST)
SELECT cron.schedule(
  'morning-brief',
  '30 1 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/morning-brief',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
    body    := '{}'::jsonb
  )
  $$
);

-- 3. Night review — 4:30pm UTC (~10pm IST)
SELECT cron.schedule(
  'night-review',
  '30 16 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/night-review',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
    body    := '{}'::jsonb
  )
  $$
);

-- Verify schedules were created:
-- SELECT * FROM cron.job;

-- =================================================================
-- NOTE: If your timezone is not IST (+5:30), adjust the UTC times:
-- Your morning 7am in UTC = 7am minus your UTC offset
-- Example: UTC+5:30 (IST) → 7:00am - 5:30 = 1:30am UTC ✓
-- =================================================================

-- 4. Weekly evolution — Sunday 5pm UTC (~10:30pm IST)
SELECT cron.schedule(
  'weekly-evolution',
  '0 17 * * 0',
  $$
  SELECT net.http_post(
    url     := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/weekly-evolution',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
    body    := '{"manual":false}'::jsonb
  )
  $$
);

-- 5. Check delayed tasks — every 30 minutes
SELECT cron.schedule(
  'check-delayed-tasks',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/check-delayed-tasks',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
    body    := '{}'::jsonb
  )
  $$
);

-- =================================================================
-- TWILIO WHATSAPP WEBHOOK SETUP
-- In Twilio Console → Messaging → WhatsApp Sandbox:
-- Set "When a message comes in" to:
-- https://YOUR_PROJECT_REF.supabase.co/functions/v1/whatsapp-webhook
--
-- TWILIO SECRETS (add in Supabase → Settings → Edge Functions → Secrets):
-- TWILIO_ACCOUNT_SID = ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
-- TWILIO_AUTH_TOKEN  = your_auth_token
-- TWILIO_WHATSAPP_FROM = whatsapp:+14155238886  (Twilio sandbox number)
-- =================================================================
