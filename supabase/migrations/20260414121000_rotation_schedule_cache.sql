-- ============================================================================
-- Rotation Schedule Cache
-- Server-side cache for on-demand BE rotation payloads keyed by matrix/staff/config freshness.
-- ============================================================================

CREATE TABLE IF NOT EXISTS rotation_schedule_cache (
  id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  location_id           text NOT NULL,
  schedule_date         date NOT NULL,
  mode                  text NOT NULL CHECK (mode IN ('optimal', 'actual_staffing')),
  matrix_computed_at    timestamptz,
  staff_plan_updated_at timestamptz,
  config_updated_at     timestamptz,
  freshness_signature   text NOT NULL,
  response_payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_rotation_schedule_cache UNIQUE (location_id, schedule_date, mode)
);

ALTER TABLE rotation_schedule_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rotation_schedule_cache_select ON rotation_schedule_cache;
DROP POLICY IF EXISTS rotation_schedule_cache_insert ON rotation_schedule_cache;
DROP POLICY IF EXISTS rotation_schedule_cache_update ON rotation_schedule_cache;
DROP POLICY IF EXISTS rotation_schedule_cache_delete ON rotation_schedule_cache;

CREATE POLICY rotation_schedule_cache_select ON rotation_schedule_cache
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM lite_profiles
      WHERE user_id = auth.uid()
        AND is_active = true
        AND (role = 'enterprise_admin' OR location_id = rotation_schedule_cache.location_id)
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('owner', 'role_owner')
    )
  );

CREATE POLICY rotation_schedule_cache_insert ON rotation_schedule_cache
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM lite_profiles
      WHERE user_id = auth.uid()
        AND is_active = true
        AND role IN ('manager', 'location_admin', 'enterprise_admin')
        AND (role = 'enterprise_admin' OR location_id = rotation_schedule_cache.location_id)
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('owner', 'role_owner')
    )
  );

CREATE POLICY rotation_schedule_cache_update ON rotation_schedule_cache
  FOR UPDATE USING (
    EXISTS (
      SELECT 1
      FROM lite_profiles
      WHERE user_id = auth.uid()
        AND is_active = true
        AND role IN ('manager', 'location_admin', 'enterprise_admin')
        AND (role = 'enterprise_admin' OR location_id = rotation_schedule_cache.location_id)
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
        AND (role = 'enterprise_admin' OR location_id = rotation_schedule_cache.location_id)
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('owner', 'role_owner')
    )
  );

CREATE POLICY rotation_schedule_cache_delete ON rotation_schedule_cache
  FOR DELETE USING (
    EXISTS (
      SELECT 1
      FROM lite_profiles
      WHERE user_id = auth.uid()
        AND is_active = true
        AND role IN ('location_admin', 'enterprise_admin')
        AND (role = 'enterprise_admin' OR location_id = rotation_schedule_cache.location_id)
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('owner', 'role_owner')
    )
  );

CREATE INDEX IF NOT EXISTS idx_rotation_schedule_cache_lookup
  ON rotation_schedule_cache(location_id, schedule_date, mode);

DROP TRIGGER IF EXISTS trg_rotation_schedule_cache_updated_at ON rotation_schedule_cache;
CREATE TRIGGER trg_rotation_schedule_cache_updated_at
  BEFORE UPDATE ON rotation_schedule_cache
  FOR EACH ROW
  EXECUTE FUNCTION update_scheduling_updated_at();
