-- ============================================================================
-- K9 Operations Lite — Cash Tips Tracker
-- ============================================================================
-- Stores cash tip entries per employee per day, with optional notes.
-- Used by the Lite app's Cash Tips page for tracking and reporting.
-- ============================================================================

CREATE TABLE IF NOT EXISTS cash_tips (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id   TEXT NOT NULL,                       -- e.g. '8ea382b0-63f7-44ac-b6f8-83243c03d946'
  employee_name TEXT NOT NULL,
  amount        NUMERIC NOT NULL,
  tip_date      DATE NOT NULL,
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_cash_tips_location  ON cash_tips(location_id);
CREATE INDEX IF NOT EXISTS idx_cash_tips_tip_date  ON cash_tips(tip_date);
CREATE INDEX IF NOT EXISTS idx_cash_tips_loc_date  ON cash_tips(location_id, tip_date);

-- ─── Row Level Security ─────────────────────────────────────────────────────
ALTER TABLE cash_tips ENABLE ROW LEVEL SECURITY;

-- SELECT: location members can read
DROP POLICY IF EXISTS "cash_tips_select" ON cash_tips;
CREATE POLICY cash_tips_select ON cash_tips
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM lite_profiles
      WHERE user_id = auth.uid() AND (location_id = cash_tips.location_id OR role = 'enterprise_admin')
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'role_owner')
    )
  );

-- INSERT: active location members can add tips
DROP POLICY IF EXISTS "cash_tips_insert" ON cash_tips;
CREATE POLICY cash_tips_insert ON cash_tips
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM lite_profiles
      WHERE user_id = auth.uid() AND (location_id = cash_tips.location_id OR role = 'enterprise_admin') AND is_active = TRUE
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'role_owner')
    )
  );

-- UPDATE: active location members can update tips
DROP POLICY IF EXISTS "cash_tips_update" ON cash_tips;
CREATE POLICY cash_tips_update ON cash_tips
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM lite_profiles
      WHERE user_id = auth.uid() AND (location_id = cash_tips.location_id OR role = 'enterprise_admin') AND is_active = TRUE
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'role_owner')
    )
  );

-- DELETE: admins only
DROP POLICY IF EXISTS "cash_tips_delete" ON cash_tips;
CREATE POLICY cash_tips_delete ON cash_tips
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM lite_profiles
      WHERE user_id = auth.uid() AND role IN ('location_admin', 'enterprise_admin') AND (location_id = cash_tips.location_id OR role = 'enterprise_admin')
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'role_owner')
    )
  );
