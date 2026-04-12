-- Scheduling data foundation: scheduling_matrix_daily, daily_staff_plan, rotation_schedules
-- Plus RLS policies, indexes, and schedule_config seed in lite_settings.

-- ═══════════════════════════════════════════════════════════════════════
-- 1. scheduling_matrix_daily — precomputed operational demand per day
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS scheduling_matrix_daily (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  location_id     text NOT NULL,
  matrix_date     date NOT NULL,

  -- Boarding breakdown
  boarding_large          int NOT NULL DEFAULT 0,
  boarding_small          int NOT NULL DEFAULT 0,
  boarding_unknown_size   int NOT NULL DEFAULT 0,

  -- Daycare breakdown
  daycare_large           int NOT NULL DEFAULT 0,
  daycare_small           int NOT NULL DEFAULT 0,
  daycare_unknown_size    int NOT NULL DEFAULT 0,

  -- Private play
  pp_dayboarders          int NOT NULL DEFAULT 0,
  pp_overnight_boarders   int NOT NULL DEFAULT 0,

  -- Operations
  departure_baths         int NOT NULL DEFAULT 0,
  evaluations             int NOT NULL DEFAULT 0,
  tours                   int NOT NULL DEFAULT 0,
  gross_dogs_in_building  int NOT NULL DEFAULT 0,

  -- Feeding & medication
  feeding_dogs            int NOT NULL DEFAULT 0,
  medication_dogs         int NOT NULL DEFAULT 0,

  -- Arrivals & departures
  dogs_arriving           int NOT NULL DEFAULT 0,
  dogs_departing          int NOT NULL DEFAULT 0,
  dogs_checked_out        int NOT NULL DEFAULT 0,

  -- Room occupancy
  rooms_occupied          int NOT NULL DEFAULT 0,
  rooms_available         int NOT NULL DEFAULT 0,
  total_rooms             int NOT NULL DEFAULT 0,

  -- Raw breakdown for drill-down
  detail_json             jsonb NOT NULL DEFAULT '{}',

  computed_at             timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_sched_matrix_location_date UNIQUE (location_id, matrix_date)
);

ALTER TABLE scheduling_matrix_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read scheduling_matrix_daily"
  ON scheduling_matrix_daily FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert scheduling_matrix_daily"
  ON scheduling_matrix_daily FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update scheduling_matrix_daily"
  ON scheduling_matrix_daily FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete scheduling_matrix_daily"
  ON scheduling_matrix_daily FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_sched_matrix_location_date
  ON scheduling_matrix_daily(location_id, matrix_date);


-- ═══════════════════════════════════════════════════════════════════════
-- 2. daily_staff_plan — user-entered staff availability per day/shift
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS daily_staff_plan (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  location_id     text NOT NULL,
  plan_date       date NOT NULL,
  shift           text NOT NULL CHECK (shift IN ('am', 'pm', 'full')),

  pct_count       int NOT NULL DEFAULT 0,
  csr_count       int NOT NULL DEFAULT 0,
  supervisor_count int NOT NULL DEFAULT 0,
  mod_count       int NOT NULL DEFAULT 0,

  supervisor_present boolean NOT NULL DEFAULT false,
  allow_csr_as_pct   boolean NOT NULL DEFAULT false,
  allow_mod_as_pct   boolean NOT NULL DEFAULT false,

  staff_names     jsonb NOT NULL DEFAULT '[]',
  notes           text,
  created_by      text,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_staff_plan_location_date_shift UNIQUE (location_id, plan_date, shift)
);

ALTER TABLE daily_staff_plan ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read daily_staff_plan"
  ON daily_staff_plan FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert daily_staff_plan"
  ON daily_staff_plan FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update daily_staff_plan"
  ON daily_staff_plan FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete daily_staff_plan"
  ON daily_staff_plan FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_staff_plan_location_date
  ON daily_staff_plan(location_id, plan_date);


-- ═══════════════════════════════════════════════════════════════════════
-- 3. rotation_schedules — versioned generated schedules
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS rotation_schedules (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  location_id     text NOT NULL,
  schedule_date   date NOT NULL,
  shift           text NOT NULL CHECK (shift IN ('am', 'pm', 'full')),
  version         int NOT NULL DEFAULT 1,
  status          text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),

  -- Snapshot inputs used for this version
  staff_input     jsonb NOT NULL DEFAULT '{}',
  dog_metrics     jsonb NOT NULL DEFAULT '{}',
  assumptions_snapshot jsonb NOT NULL DEFAULT '{}',

  -- Generated schedule data
  time_slots      jsonb NOT NULL DEFAULT '[]',
  persons         jsonb NOT NULL DEFAULT '[]',
  grid            jsonb NOT NULL DEFAULT '{}',

  -- Quality signals
  warnings        jsonb NOT NULL DEFAULT '[]',
  violations      jsonb NOT NULL DEFAULT '[]',
  overrides       jsonb NOT NULL DEFAULT '[]',
  explanation     jsonb NOT NULL DEFAULT '{}',

  -- Timestamps
  generated_at    timestamptz,
  generated_by    text,
  published_at    timestamptz,
  published_by    text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_rotation_location_date_shift_version
    UNIQUE (location_id, schedule_date, shift, version)
);

ALTER TABLE rotation_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read rotation_schedules"
  ON rotation_schedules FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert rotation_schedules"
  ON rotation_schedules FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update rotation_schedules"
  ON rotation_schedules FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete rotation_schedules"
  ON rotation_schedules FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_rotation_schedules_location_date
  ON rotation_schedules(location_id, schedule_date);

CREATE INDEX IF NOT EXISTS idx_rotation_schedules_status
  ON rotation_schedules(location_id, status)
  WHERE status = 'published';
