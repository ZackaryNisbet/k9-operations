-- ============================================================================
-- Scheduling Projection Snapshots
-- Stores immutable daily projection runs so forecast accuracy can be audited by
-- days-out once the target date becomes actual.
-- ============================================================================

CREATE TABLE IF NOT EXISTS scheduling_projection_snapshots (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  location_id          text NOT NULL,
  target_date          date NOT NULL,
  as_of_date           date NOT NULL,
  lead_days            int NOT NULL DEFAULT 0,
  model_version        text NOT NULL,
  current_display      jsonb NOT NULL DEFAULT '{}'::jsonb,
  projected_display    jsonb NOT NULL DEFAULT '{}'::jsonb,
  projection_json      jsonb NOT NULL DEFAULT '{}'::jsonb,
  capacity_json        jsonb,
  actual_display       jsonb,
  actualized_at        timestamptz,
  computed_at          timestamptz NOT NULL DEFAULT now(),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_scheduling_projection_snapshot_run
    UNIQUE (location_id, target_date, as_of_date, model_version)
);

ALTER TABLE scheduling_projection_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS scheduling_projection_snapshots_select ON scheduling_projection_snapshots;
DROP POLICY IF EXISTS scheduling_projection_snapshots_insert ON scheduling_projection_snapshots;
DROP POLICY IF EXISTS scheduling_projection_snapshots_update ON scheduling_projection_snapshots;
DROP POLICY IF EXISTS scheduling_projection_snapshots_delete ON scheduling_projection_snapshots;

CREATE POLICY scheduling_projection_snapshots_select ON scheduling_projection_snapshots
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM lite_profiles
      WHERE user_id = auth.uid()
        AND is_active = true
        AND (role = 'enterprise_admin' OR location_id = scheduling_projection_snapshots.location_id)
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('owner', 'role_owner')
    )
  );

CREATE POLICY scheduling_projection_snapshots_insert ON scheduling_projection_snapshots
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM lite_profiles
      WHERE user_id = auth.uid()
        AND is_active = true
        AND role IN ('manager', 'location_admin', 'enterprise_admin')
        AND (role = 'enterprise_admin' OR location_id = scheduling_projection_snapshots.location_id)
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('owner', 'role_owner')
    )
  );

CREATE POLICY scheduling_projection_snapshots_update ON scheduling_projection_snapshots
  FOR UPDATE USING (
    EXISTS (
      SELECT 1
      FROM lite_profiles
      WHERE user_id = auth.uid()
        AND is_active = true
        AND role IN ('manager', 'location_admin', 'enterprise_admin')
        AND (role = 'enterprise_admin' OR location_id = scheduling_projection_snapshots.location_id)
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
        AND (role = 'enterprise_admin' OR location_id = scheduling_projection_snapshots.location_id)
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('owner', 'role_owner')
    )
  );

CREATE POLICY scheduling_projection_snapshots_delete ON scheduling_projection_snapshots
  FOR DELETE USING (
    EXISTS (
      SELECT 1
      FROM lite_profiles
      WHERE user_id = auth.uid()
        AND is_active = true
        AND role IN ('location_admin', 'enterprise_admin')
        AND (role = 'enterprise_admin' OR location_id = scheduling_projection_snapshots.location_id)
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('owner', 'role_owner')
    )
  );

CREATE INDEX IF NOT EXISTS idx_scheduling_projection_snapshots_location_target
  ON scheduling_projection_snapshots(location_id, target_date, lead_days);

CREATE INDEX IF NOT EXISTS idx_scheduling_projection_snapshots_location_asof
  ON scheduling_projection_snapshots(location_id, as_of_date);

DROP TRIGGER IF EXISTS trg_scheduling_projection_snapshots_updated_at ON scheduling_projection_snapshots;
CREATE TRIGGER trg_scheduling_projection_snapshots_updated_at
  BEFORE UPDATE ON scheduling_projection_snapshots
  FOR EACH ROW EXECUTE FUNCTION update_scheduling_updated_at();
