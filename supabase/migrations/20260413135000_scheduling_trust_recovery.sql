-- ============================================================================
-- Scheduling Trust Recovery
-- Creates the scheduling foundation if it is missing and replaces the
-- permissive draft policies with location-scoped RLS.
-- ============================================================================

-- ─── updated_at helper ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_scheduling_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ─── scheduling_matrix_daily ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS scheduling_matrix_daily (
  id                      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  location_id             text NOT NULL,
  matrix_date             date NOT NULL,
  boarding_large          int NOT NULL DEFAULT 0,
  boarding_small          int NOT NULL DEFAULT 0,
  boarding_unknown_size   int NOT NULL DEFAULT 0,
  daycare_large           int NOT NULL DEFAULT 0,
  daycare_small           int NOT NULL DEFAULT 0,
  daycare_unknown_size    int NOT NULL DEFAULT 0,
  pp_dayboarders          int NOT NULL DEFAULT 0,
  pp_overnight_boarders   int NOT NULL DEFAULT 0,
  departure_baths         int NOT NULL DEFAULT 0,
  evaluations             int NOT NULL DEFAULT 0,
  tours                   int NOT NULL DEFAULT 0,
  gross_dogs_in_building  int NOT NULL DEFAULT 0,
  feeding_dogs            int NOT NULL DEFAULT 0,
  medication_dogs         int NOT NULL DEFAULT 0,
  dogs_arriving           int NOT NULL DEFAULT 0,
  dogs_departing          int NOT NULL DEFAULT 0,
  dogs_checked_out        int NOT NULL DEFAULT 0,
  rooms_occupied          int NOT NULL DEFAULT 0,
  rooms_available         int NOT NULL DEFAULT 0,
  total_rooms             int NOT NULL DEFAULT 0,
  detail_json             jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_sched_matrix_location_date UNIQUE (location_id, matrix_date)
);

ALTER TABLE scheduling_matrix_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read scheduling_matrix_daily" ON scheduling_matrix_daily;
DROP POLICY IF EXISTS "Authenticated users can insert scheduling_matrix_daily" ON scheduling_matrix_daily;
DROP POLICY IF EXISTS "Authenticated users can update scheduling_matrix_daily" ON scheduling_matrix_daily;
DROP POLICY IF EXISTS "Authenticated users can delete scheduling_matrix_daily" ON scheduling_matrix_daily;
DROP POLICY IF EXISTS scheduling_matrix_daily_select ON scheduling_matrix_daily;
DROP POLICY IF EXISTS scheduling_matrix_daily_insert ON scheduling_matrix_daily;
DROP POLICY IF EXISTS scheduling_matrix_daily_update ON scheduling_matrix_daily;
DROP POLICY IF EXISTS scheduling_matrix_daily_delete ON scheduling_matrix_daily;

CREATE POLICY scheduling_matrix_daily_select ON scheduling_matrix_daily
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM lite_profiles
      WHERE user_id = auth.uid()
        AND is_active = true
        AND (role = 'enterprise_admin' OR location_id = scheduling_matrix_daily.location_id)
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('owner', 'role_owner')
    )
  );

CREATE POLICY scheduling_matrix_daily_insert ON scheduling_matrix_daily
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM lite_profiles
      WHERE user_id = auth.uid()
        AND is_active = true
        AND role IN ('manager', 'location_admin', 'enterprise_admin')
        AND (role = 'enterprise_admin' OR location_id = scheduling_matrix_daily.location_id)
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('owner', 'role_owner')
    )
  );

CREATE POLICY scheduling_matrix_daily_update ON scheduling_matrix_daily
  FOR UPDATE USING (
    EXISTS (
      SELECT 1
      FROM lite_profiles
      WHERE user_id = auth.uid()
        AND is_active = true
        AND role IN ('manager', 'location_admin', 'enterprise_admin')
        AND (role = 'enterprise_admin' OR location_id = scheduling_matrix_daily.location_id)
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('owner', 'role_owner')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM lite_profiles
      WHERE user_id = auth.uid()
        AND is_active = true
        AND role IN ('manager', 'location_admin', 'enterprise_admin')
        AND (role = 'enterprise_admin' OR location_id = scheduling_matrix_daily.location_id)
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('owner', 'role_owner')
    )
  );

CREATE POLICY scheduling_matrix_daily_delete ON scheduling_matrix_daily
  FOR DELETE USING (
    EXISTS (
      SELECT 1
      FROM lite_profiles
      WHERE user_id = auth.uid()
        AND is_active = true
        AND role IN ('location_admin', 'enterprise_admin')
        AND (role = 'enterprise_admin' OR location_id = scheduling_matrix_daily.location_id)
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('owner', 'role_owner')
    )
  );

CREATE INDEX IF NOT EXISTS idx_sched_matrix_location_date
  ON scheduling_matrix_daily(location_id, matrix_date);


-- ─── daily_staff_plan ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS daily_staff_plan (
  id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  location_id          text NOT NULL,
  plan_date            date NOT NULL,
  shift                text NOT NULL CHECK (shift IN ('am', 'pm', 'full')),
  pct_count            int NOT NULL DEFAULT 0,
  csr_count            int NOT NULL DEFAULT 0,
  supervisor_count     int NOT NULL DEFAULT 0,
  mod_count            int NOT NULL DEFAULT 0,
  supervisor_present   boolean NOT NULL DEFAULT false,
  allow_csr_as_pct     boolean NOT NULL DEFAULT false,
  allow_mod_as_pct     boolean NOT NULL DEFAULT false,
  staff_names          jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes                text,
  created_by           text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_staff_plan_location_date_shift UNIQUE (location_id, plan_date, shift)
);

ALTER TABLE daily_staff_plan ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read daily_staff_plan" ON daily_staff_plan;
DROP POLICY IF EXISTS "Authenticated users can insert daily_staff_plan" ON daily_staff_plan;
DROP POLICY IF EXISTS "Authenticated users can update daily_staff_plan" ON daily_staff_plan;
DROP POLICY IF EXISTS "Authenticated users can delete daily_staff_plan" ON daily_staff_plan;
DROP POLICY IF EXISTS daily_staff_plan_select ON daily_staff_plan;
DROP POLICY IF EXISTS daily_staff_plan_insert ON daily_staff_plan;
DROP POLICY IF EXISTS daily_staff_plan_update ON daily_staff_plan;
DROP POLICY IF EXISTS daily_staff_plan_delete ON daily_staff_plan;

CREATE POLICY daily_staff_plan_select ON daily_staff_plan
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM lite_profiles
      WHERE user_id = auth.uid()
        AND is_active = true
        AND (role = 'enterprise_admin' OR location_id = daily_staff_plan.location_id)
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('owner', 'role_owner')
    )
  );

CREATE POLICY daily_staff_plan_insert ON daily_staff_plan
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM lite_profiles
      WHERE user_id = auth.uid()
        AND is_active = true
        AND role IN ('manager', 'location_admin', 'enterprise_admin')
        AND (role = 'enterprise_admin' OR location_id = daily_staff_plan.location_id)
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('owner', 'role_owner')
    )
  );

CREATE POLICY daily_staff_plan_update ON daily_staff_plan
  FOR UPDATE USING (
    EXISTS (
      SELECT 1
      FROM lite_profiles
      WHERE user_id = auth.uid()
        AND is_active = true
        AND role IN ('manager', 'location_admin', 'enterprise_admin')
        AND (role = 'enterprise_admin' OR location_id = daily_staff_plan.location_id)
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('owner', 'role_owner')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM lite_profiles
      WHERE user_id = auth.uid()
        AND is_active = true
        AND role IN ('manager', 'location_admin', 'enterprise_admin')
        AND (role = 'enterprise_admin' OR location_id = daily_staff_plan.location_id)
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('owner', 'role_owner')
    )
  );

CREATE POLICY daily_staff_plan_delete ON daily_staff_plan
  FOR DELETE USING (
    EXISTS (
      SELECT 1
      FROM lite_profiles
      WHERE user_id = auth.uid()
        AND is_active = true
        AND role IN ('location_admin', 'enterprise_admin')
        AND (role = 'enterprise_admin' OR location_id = daily_staff_plan.location_id)
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('owner', 'role_owner')
    )
  );

CREATE INDEX IF NOT EXISTS idx_staff_plan_location_date
  ON daily_staff_plan(location_id, plan_date);

DROP TRIGGER IF EXISTS trg_daily_staff_plan_updated_at ON daily_staff_plan;
CREATE TRIGGER trg_daily_staff_plan_updated_at
  BEFORE UPDATE ON daily_staff_plan
  FOR EACH ROW EXECUTE FUNCTION update_scheduling_updated_at();


-- ─── rotation_schedules ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS rotation_schedules (
  id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  location_id           text NOT NULL,
  schedule_date         date NOT NULL,
  shift                 text NOT NULL CHECK (shift IN ('am', 'pm', 'full')),
  version               int NOT NULL DEFAULT 1,
  status                text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  staff_input           jsonb NOT NULL DEFAULT '{}'::jsonb,
  dog_metrics           jsonb NOT NULL DEFAULT '{}'::jsonb,
  assumptions_snapshot  jsonb NOT NULL DEFAULT '{}'::jsonb,
  time_slots            jsonb NOT NULL DEFAULT '[]'::jsonb,
  persons               jsonb NOT NULL DEFAULT '[]'::jsonb,
  grid                  jsonb NOT NULL DEFAULT '{}'::jsonb,
  warnings              jsonb NOT NULL DEFAULT '[]'::jsonb,
  violations            jsonb NOT NULL DEFAULT '[]'::jsonb,
  overrides             jsonb NOT NULL DEFAULT '[]'::jsonb,
  explanation           jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_at          timestamptz,
  generated_by          text,
  published_at          timestamptz,
  published_by          text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_rotation_location_date_shift_version UNIQUE (location_id, schedule_date, shift, version)
);

ALTER TABLE rotation_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read rotation_schedules" ON rotation_schedules;
DROP POLICY IF EXISTS "Authenticated users can insert rotation_schedules" ON rotation_schedules;
DROP POLICY IF EXISTS "Authenticated users can update rotation_schedules" ON rotation_schedules;
DROP POLICY IF EXISTS "Authenticated users can delete rotation_schedules" ON rotation_schedules;
DROP POLICY IF EXISTS rotation_schedules_select ON rotation_schedules;
DROP POLICY IF EXISTS rotation_schedules_insert ON rotation_schedules;
DROP POLICY IF EXISTS rotation_schedules_update ON rotation_schedules;
DROP POLICY IF EXISTS rotation_schedules_delete ON rotation_schedules;

CREATE POLICY rotation_schedules_select ON rotation_schedules
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM lite_profiles
      WHERE user_id = auth.uid()
        AND is_active = true
        AND (role = 'enterprise_admin' OR location_id = rotation_schedules.location_id)
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('owner', 'role_owner')
    )
  );

CREATE POLICY rotation_schedules_insert ON rotation_schedules
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM lite_profiles
      WHERE user_id = auth.uid()
        AND is_active = true
        AND role IN ('manager', 'location_admin', 'enterprise_admin')
        AND (role = 'enterprise_admin' OR location_id = rotation_schedules.location_id)
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('owner', 'role_owner')
    )
  );

CREATE POLICY rotation_schedules_update ON rotation_schedules
  FOR UPDATE USING (
    EXISTS (
      SELECT 1
      FROM lite_profiles
      WHERE user_id = auth.uid()
        AND is_active = true
        AND role IN ('manager', 'location_admin', 'enterprise_admin')
        AND (role = 'enterprise_admin' OR location_id = rotation_schedules.location_id)
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('owner', 'role_owner')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM lite_profiles
      WHERE user_id = auth.uid()
        AND is_active = true
        AND role IN ('manager', 'location_admin', 'enterprise_admin')
        AND (role = 'enterprise_admin' OR location_id = rotation_schedules.location_id)
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('owner', 'role_owner')
    )
  );

CREATE POLICY rotation_schedules_delete ON rotation_schedules
  FOR DELETE USING (
    EXISTS (
      SELECT 1
      FROM lite_profiles
      WHERE user_id = auth.uid()
        AND is_active = true
        AND role IN ('location_admin', 'enterprise_admin')
        AND (role = 'enterprise_admin' OR location_id = rotation_schedules.location_id)
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('owner', 'role_owner')
    )
  );

CREATE INDEX IF NOT EXISTS idx_rotation_schedules_location_date
  ON rotation_schedules(location_id, schedule_date);

CREATE INDEX IF NOT EXISTS idx_rotation_schedules_status
  ON rotation_schedules(location_id, status)
  WHERE status = 'published';

DROP TRIGGER IF EXISTS trg_rotation_schedules_updated_at ON rotation_schedules;
CREATE TRIGGER trg_rotation_schedules_updated_at
  BEFORE UPDATE ON rotation_schedules
  FOR EACH ROW EXECUTE FUNCTION update_scheduling_updated_at();


-- ─── schedule_config seed ──────────────────────────────────────────────────

INSERT INTO lite_settings (
  location_id,
  setting_key,
  setting_value
)
VALUES (
  '8ea382b0-63f7-44ac-b6f8-83243c03d946',
  'schedule_config',
  '{
    "weekday_am_open_window": ["06:00", "07:00"],
    "weekend_am_open_window": ["07:00", "09:00"],
    "weekday_site_hours": ["06:00", "20:00"],
    "weekend_site_hours": ["07:00", "18:00"],
    "public_hours_weekday": ["07:00", "19:00"],
    "public_hours_weekend": ["08:00", "18:00"],
    "daycare_ratio_large": 25,
    "daycare_ratio_small": 25,
    "small_daycare_practical_ratio": 35,
    "group_transport_minutes_each_way": 2,
    "morning_room_clean_minutes": 2.5,
    "private_play_move_minutes_each_way": 1.5,
    "private_play_box_dwell_minutes": 4,
    "private_play_rounds_per_day": 3,
    "private_play_round_minutes": 10,
    "bath_active_minutes": 15,
    "bath_passive_dry_minutes": 30,
    "dryer_capacity": 2,
    "feeding_minutes_per_dog": 1.5,
    "medication_minutes_per_dog": 2,
    "break_minutes": 30,
    "max_breaks_small_team": 1,
    "max_breaks_large_team": 2,
    "large_team_threshold": 6,
    "supervisor_buffer_minutes": 120,
    "allow_csr_backfill_default": true,
    "allow_mod_backfill_default": false,
    "room_mess_rate_default": 0.2,
    "pod_pass_dogs_per_trip": 1.5,
    "pod_pass_boxes": 4,
    "holiday_overrides": {}
  }'::jsonb
)
ON CONFLICT (location_id, setting_key) DO NOTHING;
