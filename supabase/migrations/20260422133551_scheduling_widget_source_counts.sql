-- ============================================================================
-- Scheduling GINGR widget source counts
-- Stores the raw daily Calendar Details/widget totals used as the count
-- authority for the scheduling demand matrix.
-- ============================================================================

CREATE TABLE IF NOT EXISTS gingr_reservation_widget_daily (
  id                       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  location_id              text NOT NULL,
  widget_date              date NOT NULL,
  check_in_total           int NOT NULL DEFAULT 0,
  check_out_total          int NOT NULL DEFAULT 0,
  overnight_total          int NOT NULL DEFAULT 0,
  total_reservation_volume int NOT NULL DEFAULT 0,
  per_type                 jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw_data                 jsonb NOT NULL DEFAULT '{}'::jsonb,
  synced_at                timestamptz NOT NULL DEFAULT now(),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_gingr_reservation_widget_daily_location_date UNIQUE (location_id, widget_date)
);

ALTER TABLE gingr_reservation_widget_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gingr_reservation_widget_daily_select ON gingr_reservation_widget_daily;
DROP POLICY IF EXISTS gingr_reservation_widget_daily_insert ON gingr_reservation_widget_daily;
DROP POLICY IF EXISTS gingr_reservation_widget_daily_update ON gingr_reservation_widget_daily;
DROP POLICY IF EXISTS gingr_reservation_widget_daily_delete ON gingr_reservation_widget_daily;

CREATE POLICY gingr_reservation_widget_daily_select ON gingr_reservation_widget_daily
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM lite_profiles
      WHERE user_id = auth.uid()
        AND is_active = true
        AND (role = 'enterprise_admin' OR location_id = gingr_reservation_widget_daily.location_id)
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('owner', 'role_owner')
    )
  );

CREATE POLICY gingr_reservation_widget_daily_insert ON gingr_reservation_widget_daily
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM lite_profiles
      WHERE user_id = auth.uid()
        AND is_active = true
        AND role IN ('manager', 'location_admin', 'enterprise_admin')
        AND (role = 'enterprise_admin' OR location_id = gingr_reservation_widget_daily.location_id)
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('owner', 'role_owner')
    )
  );

CREATE POLICY gingr_reservation_widget_daily_update ON gingr_reservation_widget_daily
  FOR UPDATE USING (
    EXISTS (
      SELECT 1
      FROM lite_profiles
      WHERE user_id = auth.uid()
        AND is_active = true
        AND role IN ('manager', 'location_admin', 'enterprise_admin')
        AND (role = 'enterprise_admin' OR location_id = gingr_reservation_widget_daily.location_id)
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
        AND (role = 'enterprise_admin' OR location_id = gingr_reservation_widget_daily.location_id)
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('owner', 'role_owner')
    )
  );

CREATE POLICY gingr_reservation_widget_daily_delete ON gingr_reservation_widget_daily
  FOR DELETE USING (
    EXISTS (
      SELECT 1
      FROM lite_profiles
      WHERE user_id = auth.uid()
        AND is_active = true
        AND role IN ('location_admin', 'enterprise_admin')
        AND (role = 'enterprise_admin' OR location_id = gingr_reservation_widget_daily.location_id)
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('owner', 'role_owner')
    )
  );

CREATE INDEX IF NOT EXISTS idx_gingr_reservation_widget_daily_location_date
  ON gingr_reservation_widget_daily(location_id, widget_date);

DROP TRIGGER IF EXISTS trg_gingr_reservation_widget_daily_updated_at ON gingr_reservation_widget_daily;
CREATE TRIGGER trg_gingr_reservation_widget_daily_updated_at
  BEFORE UPDATE ON gingr_reservation_widget_daily
  FOR EACH ROW
  EXECUTE FUNCTION update_scheduling_updated_at();
