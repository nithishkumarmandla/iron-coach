-- =================================================================
-- IRON COACH — COMPLETE DATABASE SCHEMA
-- Paste this entire file into Supabase SQL Editor and Run
-- =================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_cron";

-- =================================================================
-- TABLE: profiles
-- Extends auth.users. One row per user.
-- =================================================================
CREATE TABLE public.profiles (
  id                    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username              TEXT UNIQUE NOT NULL,
  timezone              TEXT DEFAULT 'Asia/Kolkata',
  utc_offset_mins       INT DEFAULT 330,

  -- Health inputs (updated daily by user)
  avg_sleep_hours       NUMERIC(4,2) DEFAULT 7.0,
  energy_level          INT DEFAULT 3 CHECK (energy_level BETWEEN 1 AND 5),

  -- AI coach state
  coach_mode            TEXT DEFAULT 'balanced'
                        CHECK (coach_mode IN ('strict','balanced','supportive')),

  -- Emergency mode
  emergency_used        INT DEFAULT 0,
  emergency_limit       INT DEFAULT 2,
  emergency_reset_date  DATE,

  -- Streaks & score (denormalized for fast reads)
  total_streak          INT DEFAULT 0,
  best_streak           INT DEFAULT 0,
  discipline_score      NUMERIC(5,2) DEFAULT 0,

  -- XP & leveling
  xp_total              INT DEFAULT 0,
  level                 INT DEFAULT 1,
  level_title           TEXT DEFAULT 'Recruit',

  -- Notification config
  phone_number          TEXT,
  whatsapp_enabled      BOOLEAN DEFAULT FALSE,
  call_enabled          BOOLEAN DEFAULT FALSE,
  notify_missed_task    BOOLEAN DEFAULT TRUE,
  notify_daily_brief    BOOLEAN DEFAULT TRUE,
  notify_penalty        BOOLEAN DEFAULT TRUE,
  quiet_hours_start     TIME DEFAULT '23:00',
  quiet_hours_end       TIME DEFAULT '06:00',

  -- Accountability partner (optional)
  accountability_partner_id UUID REFERENCES public.profiles(id),
  partner_notifications BOOLEAN DEFAULT FALSE,

  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- =================================================================
-- TABLE: tasks
-- Template definitions for recurring tasks.
-- =================================================================
CREATE TABLE public.tasks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  description     TEXT,
  task_type       TEXT NOT NULL CHECK (task_type IN ('fixed','flexible')),
  category        TEXT NOT NULL CHECK (category IN ('wake_up','sleep','exercise','study','hustle','custom')),
  scheduled_time  TIME,
  duration_mins   INT DEFAULT 60,
  is_daily        BOOLEAN DEFAULT TRUE,
  days_of_week    INT[] DEFAULT '{1,2,3,4,5,6,7}',
  proof_type      TEXT[] DEFAULT '{"photo"}',
  difficulty      INT DEFAULT 1 CHECK (difficulty BETWEEN 1 AND 5),
  is_active       BOOLEAN DEFAULT TRUE,
  sort_order      INT DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- =================================================================
-- TABLE: daily_task_instances
-- One row per task per day. Generated at midnight.
-- =================================================================
CREATE TABLE public.daily_task_instances (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id           UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date              DATE NOT NULL,

  -- State machine
  status            TEXT DEFAULT 'pending' CHECK (status IN (
                      'pending','in_progress','completed',
                      'failed','emergency_shifted','penalty_pending'
                    )),

  -- Timer tracking (server-authoritative)
  timer_started_at  TIMESTAMPTZ,
  timer_ended_at    TIMESTAMPTZ,
  active_seconds    INT DEFAULT 0,
  timer_interrupted BOOLEAN DEFAULT FALSE,

  -- Emergency shift
  shifted_to_date   DATE,

  -- Pre-planned / one-off tasks
  created_by        TEXT DEFAULT 'auto' CHECK (created_by IN ('auto','user_preplanned')),
  is_one_off        BOOLEAN DEFAULT FALSE,
  one_off_title     TEXT,
  one_off_duration  INT,

  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(task_id, date)
);

-- =================================================================
-- TABLE: proofs
-- =================================================================
CREATE TABLE public.proofs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id       UUID NOT NULL REFERENCES public.daily_task_instances(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  proof_type        TEXT NOT NULL CHECK (proof_type IN (
                      'photo_before','photo_after','timer_log','voice_note'
                    )),
  storage_path      TEXT,
  thumbnail_path    TEXT,
  timer_seconds     INT,
  timer_valid       BOOLEAN,
  voice_transcript  TEXT,
  uploaded_at       TIMESTAMPTZ DEFAULT NOW(),
  device_info       JSONB DEFAULT '{}',
  ai_verified       BOOLEAN,
  ai_note           TEXT
);

-- =================================================================
-- TABLE: penalties
-- =================================================================
CREATE TABLE public.penalties (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id       UUID REFERENCES public.daily_task_instances(id),
  user_id           UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  description       TEXT NOT NULL,
  duration_mins     INT,
  due_date          DATE NOT NULL,
  status            TEXT DEFAULT 'pending' CHECK (status IN (
                      'pending','completed','missed','escalated'
                    )),
  escalation_level  INT DEFAULT 1 CHECK (escalation_level BETWEEN 1 AND 3),
  parent_penalty_id UUID REFERENCES public.penalties(id),
  proof_required    BOOLEAN DEFAULT TRUE,
  proof_id          UUID REFERENCES public.proofs(id),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  completed_at      TIMESTAMPTZ
);

-- =================================================================
-- TABLE: habits
-- =================================================================
CREATE TABLE public.habits (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title             TEXT NOT NULL,
  description       TEXT,
  icon              TEXT DEFAULT '⭐',
  color             TEXT DEFAULT '#4ade80',
  frequency         TEXT DEFAULT 'daily' CHECK (frequency IN ('daily','weekdays','weekends','custom')),
  days_of_week      INT[] DEFAULT '{1,2,3,4,5,6,7}',
  habit_type        TEXT DEFAULT 'positive' CHECK (habit_type IN ('positive','negative')),
  proof_required    BOOLEAN DEFAULT FALSE,
  proof_type        TEXT DEFAULT 'checkbox' CHECK (proof_type IN ('checkbox','photo','note','number')),
  target_value      NUMERIC,
  unit              TEXT,
  current_streak    INT DEFAULT 0,
  longest_streak    INT DEFAULT 0,
  total_completions INT DEFAULT 0,
  sort_order        INT DEFAULT 0,
  is_active         BOOLEAN DEFAULT TRUE,
  linked_task_id    UUID REFERENCES public.tasks(id),
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- =================================================================
-- TABLE: habit_completions
-- One row per habit per day. Drives heatmap.
-- =================================================================
CREATE TABLE public.habit_completions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  habit_id      UUID NOT NULL REFERENCES public.habits(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date          DATE NOT NULL,
  status        TEXT DEFAULT 'pending' CHECK (status IN ('pending','completed','skipped','failed')),
  value         NUMERIC,
  notes         TEXT,
  photo_path    TEXT,
  completed_at  TIMESTAMPTZ,
  UNIQUE(habit_id, date)
);

-- =================================================================
-- TABLE: emergency_events
-- =================================================================
CREATE TABLE public.emergency_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  instance_id   UUID REFERENCES public.daily_task_instances(id),
  reason        TEXT NOT NULL,
  approved      BOOLEAN DEFAULT FALSE,
  ai_verdict    TEXT,
  abuse_flag    BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- =================================================================
-- TABLE: ai_conversations
-- =================================================================
CREATE TABLE public.ai_conversations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_type    TEXT NOT NULL CHECK (session_type IN (
                    'morning_plan','night_review','coaching',
                    'quick_nudge','body_double'
                  )),
  date            DATE NOT NULL,
  messages        JSONB DEFAULT '[]',
  summary         TEXT,
  coach_mode_decided TEXT,
  behavior_flags  TEXT[] DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- =================================================================
-- TABLE: behavior_logs
-- =================================================================
CREATE TABLE public.behavior_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL,
  metadata    JSONB DEFAULT '{}',
  logged_at   TIMESTAMPTZ DEFAULT NOW()
);

-- =================================================================
-- TABLE: notification_log
-- =================================================================
CREATE TABLE public.notification_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  channel       TEXT NOT NULL CHECK (channel IN ('whatsapp','sms','call','push','in_app')),
  message_type  TEXT NOT NULL,
  reference_id  UUID,
  content       TEXT,
  sent_at       TIMESTAMPTZ DEFAULT NOW(),
  delivered     BOOLEAN DEFAULT FALSE,
  user_replied  TEXT
);

-- =================================================================
-- TABLE: weekly_reports
-- =================================================================
CREATE TABLE public.weekly_reports (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  week_start        DATE NOT NULL,
  completion_rate   NUMERIC(5,2),
  discipline_score  NUMERIC(5,2),
  streak_days       INT,
  tasks_completed   INT,
  tasks_failed      INT,
  penalties_issued  INT,
  ai_analysis       TEXT,
  schedule_changes  JSONB DEFAULT '{}',
  difficulty_delta  INT DEFAULT 0,
  generated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, week_start)
);

-- =================================================================
-- INDEXES
-- =================================================================
CREATE INDEX idx_tasks_user               ON public.tasks(user_id) WHERE is_active = TRUE;
CREATE INDEX idx_instances_user_date      ON public.daily_task_instances(user_id, date);
CREATE INDEX idx_instances_date_status    ON public.daily_task_instances(date, status);
CREATE INDEX idx_proofs_instance          ON public.proofs(instance_id);
CREATE INDEX idx_penalties_user_due       ON public.penalties(user_id, due_date, status);
CREATE INDEX idx_habits_user              ON public.habits(user_id) WHERE is_active = TRUE;
CREATE INDEX idx_habit_completions_user   ON public.habit_completions(user_id, date DESC);
CREATE INDEX idx_habit_completions_habit  ON public.habit_completions(habit_id, date DESC);
CREATE INDEX idx_ai_conv_user_date        ON public.ai_conversations(user_id, date DESC);
CREATE INDEX idx_behavior_logs_user       ON public.behavior_logs(user_id, logged_at DESC);
CREATE INDEX idx_notif_log_user           ON public.notification_log(user_id, sent_at DESC);

-- =================================================================
-- ROW LEVEL SECURITY
-- Every user can only see and modify their own data.
-- =================================================================
ALTER TABLE public.profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_task_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proofs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.penalties          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habits             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habit_completions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_conversations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.behavior_logs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_log   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_reports     ENABLE ROW LEVEL SECURITY;

-- One policy per table: user sees only their own rows
CREATE POLICY "own_data" ON public.profiles           USING (auth.uid() = id);
CREATE POLICY "own_data" ON public.tasks              USING (auth.uid() = user_id);
CREATE POLICY "own_data" ON public.daily_task_instances USING (auth.uid() = user_id);
CREATE POLICY "own_data" ON public.proofs             USING (auth.uid() = user_id);
CREATE POLICY "own_data" ON public.penalties          USING (auth.uid() = user_id);
CREATE POLICY "own_data" ON public.habits             USING (auth.uid() = user_id);
CREATE POLICY "own_data" ON public.habit_completions  USING (auth.uid() = user_id);
CREATE POLICY "own_data" ON public.emergency_events   USING (auth.uid() = user_id);
CREATE POLICY "own_data" ON public.ai_conversations   USING (auth.uid() = user_id);
CREATE POLICY "own_data" ON public.behavior_logs      USING (auth.uid() = user_id);
CREATE POLICY "own_data" ON public.notification_log   USING (auth.uid() = user_id);
CREATE POLICY "own_data" ON public.weekly_reports     USING (auth.uid() = user_id);

-- =================================================================
-- STORAGE BUCKETS (run after schema)
-- =================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('proofs', 'proofs', false)
ON CONFLICT DO NOTHING;

-- Storage RLS: user can only access their own folder
CREATE POLICY "own_proofs" ON storage.objects
  FOR ALL USING (
    bucket_id = 'proofs' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- =================================================================
-- SCHEMA COMPLETE
-- =================================================================
