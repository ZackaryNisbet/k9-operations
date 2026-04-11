-- Role page fixed sections: Opening, Midday, Closing, As Needed
-- Additive schema — does not modify existing tables

-- role_page_config: per-role, per-section task assignments
-- Each row maps a task to a fixed section on a role's main page
CREATE TABLE IF NOT EXISTS role_page_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  location_id TEXT NOT NULL,
  role TEXT NOT NULL,                       -- pct, csr, supervisor, manager, etc.
  section TEXT NOT NULL CHECK (section IN ('opening', 'midday', 'closing', 'as_needed')),
  task_id TEXT NOT NULL,                    -- unique task identifier
  task_label TEXT NOT NULL,                 -- display label
  task_time TEXT,                           -- optional scheduled time (HH:MM)
  sort_order INT NOT NULL DEFAULT 0,
  source TEXT DEFAULT 'custom',             -- 'legacy_opening', 'legacy_closing', 'legacy_fe', 'legacy_be', 'custom'
  day_of_week INT,                          -- null = every day, 0-6 = specific day
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(location_id, role, section, task_id)
);

-- role_page_task_state: per-day completion state for role page tasks
-- Compatible with historical date viewing
CREATE TABLE IF NOT EXISTS role_page_task_state (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  location_id TEXT NOT NULL,
  role TEXT NOT NULL,
  task_date DATE NOT NULL,
  task_id TEXT NOT NULL,
  completed BOOLEAN DEFAULT false,
  completed_by TEXT,                         -- user name or initials
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(location_id, role, task_date, task_id)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_rpc_location_role ON role_page_config(location_id, role);
CREATE INDEX IF NOT EXISTS idx_rpts_location_date ON role_page_task_state(location_id, task_date);
CREATE INDEX IF NOT EXISTS idx_rpts_location_role_date ON role_page_task_state(location_id, role, task_date);

-- RLS policies (match existing pattern)
ALTER TABLE role_page_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_page_task_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "role_page_config_all" ON role_page_config FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "role_page_task_state_all" ON role_page_task_state FOR ALL USING (true) WITH CHECK (true);
