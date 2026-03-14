-- ============================================================================
-- K9 Operations Lite — Daily Ops + Audit Log Tables
-- ============================================================================
-- Mirrors the POS tables (k9_daily_ops, audit_log) but scoped to the Lite app.
-- The Lite app uses Gingr as the system of record; these tables store
-- operational checklists, EOD reports, and audit trails that are Lite-specific.
-- ============================================================================

-- ─── lite_daily_ops ─────────────────────────────────────────────────────────
-- Stores all daily operations entries: opening/closing checklists,
-- FE/BE checklists, room cleaning, pictures, private play, and EOD reports.
-- Identical schema to k9_daily_ops so the same React components work.
-- ============================================================================
CREATE TABLE IF NOT EXISTS lite_daily_ops (
  id            TEXT PRIMARY KEY,                    -- e.g. 'ops_opening_2026-03-12'
  location_id   TEXT NOT NULL,                       -- e.g. 'cherry-hill'
  type          TEXT NOT NULL DEFAULT 'checklist',   -- 'checklist', 'room_cleaning', 'pictures', 'pp', 'eod'
  type_sub      TEXT,                                -- 'opening', 'closing', 'fe', 'be', etc.
  date          TEXT NOT NULL,                       -- ISO date string YYYY-MM-DD
  locked        BOOLEAN NOT NULL DEFAULT FALSE,
  completed_by  TEXT,
  items         JSONB NOT NULL DEFAULT '{}'::jsonb,  -- checklist items state
  sections      JSONB,                               -- EOD sections (for eod type)
  mentions      JSONB,                               -- @mentions in EOD
  history       JSONB NOT NULL DEFAULT '[]'::jsonb,  -- change history [{ts, action}]
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_lite_daily_ops_location  ON lite_daily_ops(location_id);
CREATE INDEX IF NOT EXISTS idx_lite_daily_ops_date      ON lite_daily_ops(date);
CREATE INDEX IF NOT EXISTS idx_lite_daily_ops_type      ON lite_daily_ops(type);
CREATE INDEX IF NOT EXISTS idx_lite_daily_ops_loc_date  ON lite_daily_ops(location_id, date);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_lite_daily_ops_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_lite_daily_ops_updated_at ON lite_daily_ops;
CREATE TRIGGER trg_lite_daily_ops_updated_at
  BEFORE UPDATE ON lite_daily_ops
  FOR EACH ROW EXECUTE FUNCTION update_lite_daily_ops_updated_at();


-- ─── lite_audit_log ─────────────────────────────────────────────────────────
-- Tracks employee logins, account switches, checklist completions,
-- setting changes, and other auditable actions in the Lite app.
-- ============================================================================
CREATE TABLE IF NOT EXISTS lite_audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id   TEXT NOT NULL,                       -- e.g. 'cherry-hill'
  timestamp     TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id       UUID REFERENCES auth.users(id),
  user_name     TEXT,                                -- display name at time of action
  action        TEXT NOT NULL,                       -- 'Employee Sign-In', 'Account Switch', 'Checklist Completed', etc.
  resource_type TEXT,                                -- 'checklist', 'setting', 'user', 'attendance', etc.
  resource_id   TEXT,                                -- ID of the affected resource
  details       JSONB DEFAULT '[]'::jsonb,           -- [{field, oldVal, newVal}] for change tracking
  ip_address    TEXT,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_lite_audit_log_location  ON lite_audit_log(location_id);
CREATE INDEX IF NOT EXISTS idx_lite_audit_log_timestamp ON lite_audit_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_lite_audit_log_user      ON lite_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_lite_audit_log_action    ON lite_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_lite_audit_log_loc_ts    ON lite_audit_log(location_id, timestamp DESC);


-- ─── Row Level Security ─────────────────────────────────────────────────────
ALTER TABLE lite_daily_ops ENABLE ROW LEVEL SECURITY;
ALTER TABLE lite_audit_log ENABLE ROW LEVEL SECURITY;

-- lite_daily_ops: location members can read; managers+ can write
DROP POLICY IF EXISTS "lite_daily_ops_select" ON lite_daily_ops;
CREATE POLICY lite_daily_ops_select ON lite_daily_ops
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM lite_profiles
      WHERE user_id = auth.uid() AND (location_id = lite_daily_ops.location_id OR role = 'enterprise_admin')
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'role_owner')
    )
  );

DROP POLICY IF EXISTS "lite_daily_ops_insert" ON lite_daily_ops;
CREATE POLICY lite_daily_ops_insert ON lite_daily_ops
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM lite_profiles
      WHERE user_id = auth.uid() AND (location_id = lite_daily_ops.location_id OR role = 'enterprise_admin') AND is_active = TRUE
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'role_owner')
    )
  );

DROP POLICY IF EXISTS "lite_daily_ops_update" ON lite_daily_ops;
CREATE POLICY lite_daily_ops_update ON lite_daily_ops
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM lite_profiles
      WHERE user_id = auth.uid() AND (location_id = lite_daily_ops.location_id OR role = 'enterprise_admin') AND is_active = TRUE
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'role_owner')
    )
  );

DROP POLICY IF EXISTS "lite_daily_ops_delete" ON lite_daily_ops;
CREATE POLICY lite_daily_ops_delete ON lite_daily_ops
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM lite_profiles
      WHERE user_id = auth.uid() AND role IN ('location_admin', 'enterprise_admin') AND (location_id = lite_daily_ops.location_id OR role = 'enterprise_admin')
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'role_owner')
    )
  );

-- lite_audit_log: location members can read; system and managers+ can write
DROP POLICY IF EXISTS "lite_audit_log_select" ON lite_audit_log;
CREATE POLICY lite_audit_log_select ON lite_audit_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM lite_profiles
      WHERE user_id = auth.uid() AND (location_id = lite_audit_log.location_id OR role = 'enterprise_admin')
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'role_owner')
    )
  );

DROP POLICY IF EXISTS "lite_audit_log_insert" ON lite_audit_log;
CREATE POLICY lite_audit_log_insert ON lite_audit_log
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM lite_profiles
      WHERE user_id = auth.uid() AND (location_id = lite_audit_log.location_id OR role = 'enterprise_admin') AND is_active = TRUE
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'role_owner')
    )
  );

-- Audit logs should generally never be updated or deleted
DROP POLICY IF EXISTS "lite_audit_log_update" ON lite_audit_log;
CREATE POLICY lite_audit_log_update ON lite_audit_log
  FOR UPDATE USING (false);  -- No updates allowed

DROP POLICY IF EXISTS "lite_audit_log_delete" ON lite_audit_log;
CREATE POLICY lite_audit_log_delete ON lite_audit_log
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM lite_profiles
      WHERE user_id = auth.uid() AND role = 'enterprise_admin'
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'role_owner')
    )
  );
