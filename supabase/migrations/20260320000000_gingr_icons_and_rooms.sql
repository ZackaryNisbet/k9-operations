-- ============================================================================
-- Gingr Icons & Rooms — New tables for icon-based classification and
-- authoritative room/occupancy data from get_icons + get_runs_and_reservations
-- ============================================================================

-- 1. gingr_runs — Facility room/run configuration (auto-discovered from Gingr)
CREATE TABLE IF NOT EXISTS gingr_runs (
  id            BIGSERIAL PRIMARY KEY,
  location_id   TEXT NOT NULL,
  gingr_run_id  TEXT NOT NULL,
  run_name      TEXT NOT NULL,
  area_id       TEXT,
  area_name     TEXT,
  run_type      TEXT,
  max_animals   INT,
  max_weight    INT,
  is_private_play BOOLEAN DEFAULT false,
  is_isolation  BOOLEAN DEFAULT false,
  synced_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE(location_id, gingr_run_id)
);

CREATE INDEX IF NOT EXISTS idx_gingr_runs_location ON gingr_runs(location_id);

-- 2. gingr_animal_icons_live — Current icon assignments for checked-in dogs
--    (NOT the same as gingr_animal_icons which stores profile images)
CREATE TABLE IF NOT EXISTS gingr_animal_icons_live (
  id                BIGSERIAL PRIMARY KEY,
  location_id       TEXT NOT NULL,
  animal_gingr_id   TEXT NOT NULL,
  icon_template_id  TEXT NOT NULL,
  icon_title        TEXT,
  icon_group        TEXT,
  icon_color        TEXT,
  icon_class        TEXT,
  icon_comment      TEXT,
  synced_at         TIMESTAMPTZ DEFAULT now(),
  UNIQUE(location_id, animal_gingr_id, icon_template_id)
);

CREATE INDEX IF NOT EXISTS idx_gingr_icons_live_location ON gingr_animal_icons_live(location_id);
CREATE INDEX IF NOT EXISTS idx_gingr_icons_live_animal ON gingr_animal_icons_live(location_id, animal_gingr_id);
CREATE INDEX IF NOT EXISTS idx_gingr_icons_live_playgroup ON gingr_animal_icons_live(location_id, icon_group)
  WHERE icon_group = 'Play';

-- 3. gingr_room_occupancy — Current room occupancy snapshot
CREATE TABLE IF NOT EXISTS gingr_room_occupancy (
  id            BIGSERIAL PRIMARY KEY,
  location_id   TEXT NOT NULL,
  gingr_run_id  TEXT NOT NULL,
  run_name      TEXT NOT NULL,
  area_name     TEXT,
  occupancy_date DATE NOT NULL,
  animal_names  TEXT,
  current_animals INT DEFAULT 0,
  current_weight  INT DEFAULT 0,
  occupied      BOOLEAN DEFAULT false,
  end_date      TIMESTAMPTZ,
  synced_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE(location_id, gingr_run_id, occupancy_date)
);

CREATE INDEX IF NOT EXISTS idx_gingr_room_occ_location_date ON gingr_room_occupancy(location_id, occupancy_date);

-- 4. gingr_occupancy_snapshot — Area-level occupancy aggregates from Gingr
CREATE TABLE IF NOT EXISTS gingr_occupancy_snapshot (
  id              BIGSERIAL PRIMARY KEY,
  location_id     TEXT NOT NULL,
  snapshot_date   DATE NOT NULL,
  area_id         TEXT,
  area_name       TEXT,
  percent_occupied TEXT,
  number_occupied  INT DEFAULT 0,
  number_available INT DEFAULT 0,
  total_runs       INT DEFAULT 0,
  synced_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE(location_id, snapshot_date, area_id)
);

CREATE INDEX IF NOT EXISTS idx_gingr_occ_snap_location ON gingr_occupancy_snapshot(location_id, snapshot_date);

-- 5. View for quick playgroup lookup (title-based matching for multi-location resilience)
CREATE OR REPLACE VIEW v_dog_playgroups AS
SELECT
  location_id,
  animal_gingr_id,
  CASE
    WHEN LOWER(icon_title) LIKE '%large%' AND LOWER(icon_title) LIKE '%playgroup%' THEN 'large'
    WHEN LOWER(icon_title) LIKE '%small%' AND LOWER(icon_title) LIKE '%playgroup%' THEN 'small'
    WHEN LOWER(icon_title) LIKE '%private%play%' THEN 'private_play'
    WHEN LOWER(icon_title) LIKE '%evaluation%' THEN 'evaluation'
  END AS playgroup,
  icon_title,
  icon_color,
  icon_template_id,
  icon_comment
FROM gingr_animal_icons_live
WHERE icon_group = 'Play';

-- 6. RLS policies — match existing gingr_* table patterns
ALTER TABLE gingr_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE gingr_animal_icons_live ENABLE ROW LEVEL SECURITY;
ALTER TABLE gingr_room_occupancy ENABLE ROW LEVEL SECURITY;
ALTER TABLE gingr_occupancy_snapshot ENABLE ROW LEVEL SECURITY;

-- Read access for authenticated users
CREATE POLICY "Authenticated users can read gingr_runs"
  ON gingr_runs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read gingr_animal_icons_live"
  ON gingr_animal_icons_live FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read gingr_room_occupancy"
  ON gingr_room_occupancy FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read gingr_occupancy_snapshot"
  ON gingr_occupancy_snapshot FOR SELECT TO authenticated USING (true);

-- Full access for service_role (edge functions)
CREATE POLICY "Service role full access gingr_runs"
  ON gingr_runs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access gingr_animal_icons_live"
  ON gingr_animal_icons_live FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access gingr_room_occupancy"
  ON gingr_room_occupancy FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access gingr_occupancy_snapshot"
  ON gingr_occupancy_snapshot FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 7. Update snapshot_live RPC to use authoritative room count from gingr_runs
CREATE OR REPLACE FUNCTION snapshot_live(p_location_id TEXT)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  d DATE := CURRENT_DATE;
  v_total_rooms INT;
  v_gingr_occupied INT;
  v_gingr_available INT;
  v_new_leads INT;
  v_first_time_spenders INT;
  result JSON;
BEGIN
  -- Room count: prefer gingr_runs (authoritative), fall back to lite_settings
  SELECT COUNT(*) INTO v_total_rooms
  FROM gingr_runs
  WHERE location_id = p_location_id;

  IF v_total_rooms IS NULL OR v_total_rooms = 0 THEN
    BEGIN
      SELECT COALESCE(
        (SELECT SUM(jsonb_array_length(value))
         FROM lite_settings s, jsonb_each(s.setting_value)
         WHERE s.location_id = p_location_id AND s.setting_key = 'room_names'),
        0
      ) INTO v_total_rooms;
    EXCEPTION WHEN OTHERS THEN
      v_total_rooms := 0;
    END;
  END IF;
  IF v_total_rooms IS NULL OR v_total_rooms = 0 THEN v_total_rooms := 1; END IF;

  -- Authoritative occupancy from gingr_occupancy_snapshot (if available)
  SELECT COALESCE(SUM(number_occupied), -1), COALESCE(SUM(number_available), 0)
  INTO v_gingr_occupied, v_gingr_available
  FROM gingr_occupancy_snapshot
  WHERE location_id = p_location_id AND snapshot_date = d;

  -- New leads: owners whose FIRST reservation at this location starts today
  SELECT COUNT(DISTINCT r.owner_gingr_id) INTO v_new_leads
  FROM gingr_reservations r
  WHERE r.location_id = p_location_id
    AND r.cancelled_date IS NULL
    AND r.start_date::DATE = d
    AND NOT EXISTS (
      SELECT 1 FROM gingr_reservations prev
      WHERE prev.location_id = p_location_id
        AND prev.owner_gingr_id = r.owner_gingr_id
        AND prev.cancelled_date IS NULL
        AND prev.start_date::DATE < d
    );

  -- First-time spenders: dogs with their first-ever non-tour reservation starting today
  SELECT COUNT(DISTINCT r.animal_gingr_id) INTO v_first_time_spenders
  FROM gingr_reservations r
  WHERE r.location_id = p_location_id
    AND r.cancelled_date IS NULL
    AND r.start_date::DATE = d
    AND LOWER(r.reservation_type_name) NOT LIKE '%tour%'
    AND NOT EXISTS (
      SELECT 1 FROM gingr_reservations prev
      WHERE prev.location_id = p_location_id
        AND prev.animal_gingr_id = r.animal_gingr_id
        AND prev.cancelled_date IS NULL
        AND LOWER(prev.reservation_type_name) NOT LIKE '%tour%'
        AND prev.start_date::DATE < d
    );

  SELECT json_build_object(
    'expected', COUNT(*) FILTER (WHERE
      r.start_date::DATE = d AND r.cancelled_date IS NULL
      AND r.check_in_date IS NULL
      AND LOWER(r.reservation_type_name) NOT LIKE '%tour%'
    ),
    'in_house', COUNT(*) FILTER (WHERE
      r.check_in_date IS NOT NULL AND r.check_out_date IS NULL
      AND r.start_date::DATE <= d AND r.end_date::DATE >= d
      AND LOWER(r.reservation_type_name) NOT LIKE '%tour%'
    ),
    'boarding', COUNT(*) FILTER (WHERE
      r.check_in_date IS NOT NULL AND r.check_out_date IS NULL
      AND r.start_date::DATE <= d AND r.end_date::DATE >= d
      AND (LOWER(r.reservation_type_name) LIKE '%boarding%' OR LOWER(r.reservation_type_name) LIKE '%lodging%'
           OR LOWER(r.reservation_type_name) LIKE '%overnight%' OR LOWER(r.reservation_type_name) LIKE '%suite%')
    ),
    'daycare', COUNT(*) FILTER (WHERE
      r.check_in_date IS NOT NULL AND r.check_out_date IS NULL
      AND r.start_date::DATE <= d AND r.end_date::DATE >= d
      AND (LOWER(r.reservation_type_name) LIKE '%daycare%' OR LOWER(r.reservation_type_name) LIKE '%day care%'
           OR LOWER(r.reservation_type_name) LIKE '%day boarding%')
    ),
    'going_home', COUNT(*) FILTER (WHERE
      r.check_in_date IS NOT NULL AND r.check_out_date IS NULL
      AND r.end_date::DATE = d
    ),
    'occupancy_pct', CASE
      WHEN v_gingr_occupied >= 0 THEN
        ROUND(v_gingr_occupied::NUMERIC / GREATEST(v_gingr_occupied + v_gingr_available, 1) * 100)::INT
      WHEN v_total_rooms > 0 THEN ROUND(
        COUNT(*) FILTER (WHERE
          r.check_in_date IS NOT NULL AND r.check_out_date IS NULL
          AND r.start_date::DATE <= d AND r.end_date::DATE > d
          AND (LOWER(r.reservation_type_name) LIKE '%boarding%' OR LOWER(r.reservation_type_name) LIKE '%lodging%'
               OR LOWER(r.reservation_type_name) LIKE '%overnight%' OR LOWER(r.reservation_type_name) LIKE '%suite%')
        )::NUMERIC / v_total_rooms * 100
      )::INT ELSE 0 END,
    'total_rooms', v_total_rooms,
    'new_bookings', COUNT(*) FILTER (WHERE
      r.created_date::DATE = d AND r.cancelled_date IS NULL
      AND LOWER(r.reservation_type_name) NOT LIKE '%tour%'
    ),
    'tours', COUNT(*) FILTER (WHERE
      r.start_date::DATE = d
      AND LOWER(r.reservation_type_name) LIKE '%tour%'
    ),
    'evals', COUNT(*) FILTER (WHERE
      r.start_date::DATE = d
      AND (LOWER(r.reservation_type_name) LIKE '%eval%' OR LOWER(r.reservation_type_name) LIKE '%assessment%')
    ),
    'new_leads', v_new_leads,
    'first_time_spenders', v_first_time_spenders
  ) INTO result
  FROM gingr_reservations r
  WHERE r.location_id = p_location_id
    AND r.cancelled_date IS NULL;

  RETURN result;
END;
$$;
