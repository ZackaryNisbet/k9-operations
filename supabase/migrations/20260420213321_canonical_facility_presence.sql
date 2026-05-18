-- ============================================================================
-- Canonical Facility Presence
--
-- One server-side checked-in snapshot plus an append-only transition ledger.
-- Checkout TV and live dashboard surfaces should read this model instead of
-- independently diffing Gingr/BOH data in the browser.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.facility_presence_current (
  location_id TEXT NOT NULL,
  animal_gingr_id TEXT NOT NULL,
  reservation_gingr_id TEXT,
  reservation_gingr_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  owner_gingr_id TEXT,
  owner_first_name TEXT,
  owner_last_name TEXT,
  animal_name TEXT,
  animal_breed TEXT,
  reservation_type_name TEXT,
  presence_type TEXT NOT NULL DEFAULT 'other',
  room_name TEXT,
  area_name TEXT,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  check_in_date TIMESTAMPTZ,
  scheduled_check_out_date TIMESTAMPTZ,
  presence_session_key TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'gingr_reservations_checked_in',
  source_hash TEXT NOT NULL DEFAULT '',
  source_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  duplicate_reservation_count INT NOT NULL DEFAULT 1,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (location_id, animal_gingr_id)
);

CREATE INDEX IF NOT EXISTS facility_presence_current_location_type_idx
  ON public.facility_presence_current(location_id, presence_type);

CREATE INDEX IF NOT EXISTS facility_presence_current_location_checkout_idx
  ON public.facility_presence_current(location_id, scheduled_check_out_date);

CREATE TABLE IF NOT EXISTS public.facility_presence_events (
  event_key TEXT PRIMARY KEY,
  location_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('checked_in', 'checked_out')),
  animal_gingr_id TEXT NOT NULL,
  reservation_gingr_id TEXT,
  reservation_gingr_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  owner_gingr_id TEXT,
  owner_first_name TEXT,
  owner_last_name TEXT,
  animal_name TEXT,
  animal_breed TEXT,
  reservation_type_name TEXT,
  presence_type TEXT NOT NULL DEFAULT 'other',
  room_name TEXT,
  area_name TEXT,
  presence_session_key TEXT NOT NULL,
  previous_state JSONB,
  next_state JSONB,
  source TEXT NOT NULL,
  source_run_id UUID,
  source_observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reconciliation_status TEXT NOT NULL DEFAULT 'ok',
  anomaly_reason TEXT,
  raw_data JSONB NOT NULL DEFAULT '{}'::JSONB
);

CREATE INDEX IF NOT EXISTS facility_presence_events_location_time_idx
  ON public.facility_presence_events(location_id, computed_at DESC);

CREATE INDEX IF NOT EXISTS facility_presence_events_location_animal_idx
  ON public.facility_presence_events(location_id, animal_gingr_id, computed_at DESC);

CREATE TABLE IF NOT EXISTS public.facility_presence_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id TEXT NOT NULL,
  sync_type TEXT NOT NULL DEFAULT 'presence-sync',
  status TEXT NOT NULL DEFAULT 'running',
  source TEXT NOT NULL DEFAULT 'gingr-sync',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INT,
  source_checked_in_count INT NOT NULL DEFAULT 0,
  current_count INT NOT NULL DEFAULT 0,
  arrivals_count INT NOT NULL DEFAULT 0,
  departures_count INT NOT NULL DEFAULT 0,
  duplicate_animals_count INT NOT NULL DEFAULT 0,
  anomaly_count INT NOT NULL DEFAULT 0,
  errors JSONB NOT NULL DEFAULT '[]'::JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB
);

CREATE INDEX IF NOT EXISTS facility_presence_sync_runs_location_started_idx
  ON public.facility_presence_sync_runs(location_id, started_at DESC);

-- This table is already used by gingr-boh-poll in production. Keep the
-- migration self-contained for clean environments and for the pending-arrival
-- side of the canonical presence snapshot.
CREATE TABLE IF NOT EXISTS public.gingr_back_of_house (
  id BIGSERIAL PRIMARY KEY,
  location_id TEXT NOT NULL,
  gingr_reservation_id BIGINT,
  animal_name TEXT,
  animal_id BIGINT,
  owner_name TEXT,
  owner_id BIGINT,
  reservation_type_name TEXT,
  status TEXT,
  check_in_time TIMESTAMPTZ,
  check_out_time TIMESTAMPTZ,
  room_name TEXT,
  area_name TEXT,
  raw_data JSONB NOT NULL DEFAULT '{}'::JSONB,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS gingr_back_of_house_location_reservation_idx
  ON public.gingr_back_of_house(location_id, gingr_reservation_id);

CREATE INDEX IF NOT EXISTS gingr_back_of_house_location_status_synced_idx
  ON public.gingr_back_of_house(location_id, status, synced_at DESC);

ALTER TABLE public.facility_presence_current ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facility_presence_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facility_presence_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gingr_back_of_house ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS facility_presence_current_read ON public.facility_presence_current;
CREATE POLICY facility_presence_current_read
  ON public.facility_presence_current
  FOR SELECT
  TO authenticated
  USING (TRUE);

DROP POLICY IF EXISTS facility_presence_current_service ON public.facility_presence_current;
CREATE POLICY facility_presence_current_service
  ON public.facility_presence_current
  FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS facility_presence_events_read ON public.facility_presence_events;
CREATE POLICY facility_presence_events_read
  ON public.facility_presence_events
  FOR SELECT
  TO authenticated
  USING (TRUE);

DROP POLICY IF EXISTS facility_presence_events_service ON public.facility_presence_events;
CREATE POLICY facility_presence_events_service
  ON public.facility_presence_events
  FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS facility_presence_sync_runs_read ON public.facility_presence_sync_runs;
CREATE POLICY facility_presence_sync_runs_read
  ON public.facility_presence_sync_runs
  FOR SELECT
  TO authenticated
  USING (TRUE);

DROP POLICY IF EXISTS facility_presence_sync_runs_service ON public.facility_presence_sync_runs;
CREATE POLICY facility_presence_sync_runs_service
  ON public.facility_presence_sync_runs
  FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS gingr_back_of_house_read ON public.gingr_back_of_house;
CREATE POLICY gingr_back_of_house_read
  ON public.gingr_back_of_house
  FOR SELECT
  TO authenticated
  USING (TRUE);

DROP POLICY IF EXISTS gingr_back_of_house_service ON public.gingr_back_of_house;
CREATE POLICY gingr_back_of_house_service
  ON public.gingr_back_of_house
  FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

CREATE OR REPLACE FUNCTION public.reconcile_facility_presence(
  p_location_id TEXT,
  p_current_rows JSONB,
  p_source TEXT DEFAULT 'gingr-sync:presence-sync',
  p_source_checked_in_count INT DEFAULT 0,
  p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_started_at TIMESTAMPTZ := clock_timestamp();
  v_run_id UUID := gen_random_uuid();
  v_arrivals_count INT := 0;
  v_departures_count INT := 0;
  v_current_count INT := 0;
  v_duplicate_animals_count INT := 0;
  v_anomaly_count INT := 0;
  v_result JSONB;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('facility_presence:' || p_location_id));

  INSERT INTO public.facility_presence_sync_runs (
    id,
    location_id,
    sync_type,
    status,
    source,
    started_at,
    source_checked_in_count,
    metadata
  )
  VALUES (
    v_run_id,
    p_location_id,
    'presence-sync',
    'running',
    p_source,
    v_started_at,
    COALESCE(p_source_checked_in_count, 0),
    COALESCE(p_metadata, '{}'::JSONB)
  );

  CREATE TEMP TABLE IF NOT EXISTS tmp_facility_presence_input (
    location_id TEXT,
    animal_gingr_id TEXT,
    reservation_gingr_id TEXT,
    reservation_gingr_ids TEXT[],
    owner_gingr_id TEXT,
    owner_first_name TEXT,
    owner_last_name TEXT,
    animal_name TEXT,
    animal_breed TEXT,
    reservation_type_name TEXT,
    presence_type TEXT,
    room_name TEXT,
    area_name TEXT,
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    check_in_date TIMESTAMPTZ,
    scheduled_check_out_date TIMESTAMPTZ,
    presence_session_key TEXT,
    source TEXT,
    source_hash TEXT,
    source_payload JSONB,
    duplicate_reservation_count INT
  ) ON COMMIT DROP;

  TRUNCATE tmp_facility_presence_input;

  INSERT INTO tmp_facility_presence_input (
    location_id,
    animal_gingr_id,
    reservation_gingr_id,
    reservation_gingr_ids,
    owner_gingr_id,
    owner_first_name,
    owner_last_name,
    animal_name,
    animal_breed,
    reservation_type_name,
    presence_type,
    room_name,
    area_name,
    start_date,
    end_date,
    check_in_date,
    scheduled_check_out_date,
    presence_session_key,
    source,
    source_hash,
    source_payload,
    duplicate_reservation_count
  )
  SELECT
    p_location_id,
    NULLIF(x.animal_gingr_id, ''),
    NULLIF(x.reservation_gingr_id, ''),
    COALESCE(x.reservation_gingr_ids, ARRAY[]::TEXT[]),
    NULLIF(x.owner_gingr_id, ''),
    NULLIF(x.owner_first_name, ''),
    NULLIF(x.owner_last_name, ''),
    NULLIF(x.animal_name, ''),
    NULLIF(x.animal_breed, ''),
    NULLIF(x.reservation_type_name, ''),
    COALESCE(NULLIF(x.presence_type, ''), 'other'),
    NULLIF(x.room_name, ''),
    NULLIF(x.area_name, ''),
    x.start_date,
    x.end_date,
    x.check_in_date,
    x.scheduled_check_out_date,
    COALESCE(NULLIF(x.presence_session_key, ''), md5(p_location_id || ':' || COALESCE(x.animal_gingr_id, '') || ':' || COALESCE(x.reservation_gingr_id, ''))),
    COALESCE(NULLIF(x.source, ''), p_source),
    COALESCE(NULLIF(x.source_hash, ''), md5(COALESCE(x.source_payload, '{}'::JSONB)::TEXT)),
    COALESCE(x.source_payload, '{}'::JSONB),
    GREATEST(COALESCE(x.duplicate_reservation_count, 1), 1)
  FROM jsonb_to_recordset(COALESCE(p_current_rows, '[]'::JSONB)) AS x(
    animal_gingr_id TEXT,
    reservation_gingr_id TEXT,
    reservation_gingr_ids TEXT[],
    owner_gingr_id TEXT,
    owner_first_name TEXT,
    owner_last_name TEXT,
    animal_name TEXT,
    animal_breed TEXT,
    reservation_type_name TEXT,
    presence_type TEXT,
    room_name TEXT,
    area_name TEXT,
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    check_in_date TIMESTAMPTZ,
    scheduled_check_out_date TIMESTAMPTZ,
    presence_session_key TEXT,
    source TEXT,
    source_hash TEXT,
    source_payload JSONB,
    duplicate_reservation_count INT
  )
  WHERE NULLIF(x.animal_gingr_id, '') IS NOT NULL;

  SELECT COUNT(*) INTO v_current_count FROM tmp_facility_presence_input;
  SELECT COUNT(*) INTO v_duplicate_animals_count
  FROM tmp_facility_presence_input
  WHERE duplicate_reservation_count > 1;

  WITH arrivals AS (
    SELECT i.*
    FROM tmp_facility_presence_input i
    LEFT JOIN public.facility_presence_current c
      ON c.location_id = i.location_id
     AND c.animal_gingr_id = i.animal_gingr_id
    WHERE c.animal_gingr_id IS NULL
  ),
  inserted AS (
    INSERT INTO public.facility_presence_events (
      event_key,
      location_id,
      event_type,
      animal_gingr_id,
      reservation_gingr_id,
      reservation_gingr_ids,
      owner_gingr_id,
      owner_first_name,
      owner_last_name,
      animal_name,
      animal_breed,
      reservation_type_name,
      presence_type,
      room_name,
      area_name,
      presence_session_key,
      previous_state,
      next_state,
      source,
      source_run_id,
      source_observed_at,
      reconciliation_status,
      anomaly_reason,
      raw_data
    )
    SELECT
      md5(i.location_id || ':checked_in:' || i.presence_session_key),
      i.location_id,
      'checked_in',
      i.animal_gingr_id,
      i.reservation_gingr_id,
      i.reservation_gingr_ids,
      i.owner_gingr_id,
      i.owner_first_name,
      i.owner_last_name,
      i.animal_name,
      i.animal_breed,
      i.reservation_type_name,
      i.presence_type,
      i.room_name,
      i.area_name,
      i.presence_session_key,
      NULL,
      to_jsonb(i),
      p_source,
      v_run_id,
      clock_timestamp(),
      CASE WHEN i.duplicate_reservation_count > 1 THEN 'warning' ELSE 'ok' END,
      CASE WHEN i.duplicate_reservation_count > 1 THEN 'duplicate-active-reservations-for-animal' ELSE NULL END,
      i.source_payload
    FROM arrivals i
    ON CONFLICT (event_key) DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_arrivals_count FROM inserted;

  WITH departures AS (
    SELECT c.*
    FROM public.facility_presence_current c
    LEFT JOIN tmp_facility_presence_input i
      ON i.location_id = c.location_id
     AND i.animal_gingr_id = c.animal_gingr_id
    WHERE c.location_id = p_location_id
      AND i.animal_gingr_id IS NULL
  ),
  inserted AS (
    INSERT INTO public.facility_presence_events (
      event_key,
      location_id,
      event_type,
      animal_gingr_id,
      reservation_gingr_id,
      reservation_gingr_ids,
      owner_gingr_id,
      owner_first_name,
      owner_last_name,
      animal_name,
      animal_breed,
      reservation_type_name,
      presence_type,
      room_name,
      area_name,
      presence_session_key,
      previous_state,
      next_state,
      source,
      source_run_id,
      source_observed_at,
      reconciliation_status,
      anomaly_reason,
      raw_data
    )
    SELECT
      md5(d.location_id || ':checked_out:' || d.presence_session_key),
      d.location_id,
      'checked_out',
      d.animal_gingr_id,
      d.reservation_gingr_id,
      d.reservation_gingr_ids,
      d.owner_gingr_id,
      d.owner_first_name,
      d.owner_last_name,
      d.animal_name,
      d.animal_breed,
      d.reservation_type_name,
      d.presence_type,
      d.room_name,
      d.area_name,
      d.presence_session_key,
      to_jsonb(d),
      NULL,
      p_source,
      v_run_id,
      clock_timestamp(),
      'ok',
      NULL,
      d.source_payload
    FROM departures d
    ON CONFLICT (event_key) DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_departures_count FROM inserted;

  INSERT INTO public.facility_presence_current (
    location_id,
    animal_gingr_id,
    reservation_gingr_id,
    reservation_gingr_ids,
    owner_gingr_id,
    owner_first_name,
    owner_last_name,
    animal_name,
    animal_breed,
    reservation_type_name,
    presence_type,
    room_name,
    area_name,
    start_date,
    end_date,
    check_in_date,
    scheduled_check_out_date,
    presence_session_key,
    source,
    source_hash,
    source_payload,
    duplicate_reservation_count,
    first_seen_at,
    last_seen_at,
    updated_at
  )
  SELECT
    location_id,
    animal_gingr_id,
    reservation_gingr_id,
    reservation_gingr_ids,
    owner_gingr_id,
    owner_first_name,
    owner_last_name,
    animal_name,
    animal_breed,
    reservation_type_name,
    presence_type,
    room_name,
    area_name,
    start_date,
    end_date,
    check_in_date,
    scheduled_check_out_date,
    presence_session_key,
    source,
    source_hash,
    source_payload,
    duplicate_reservation_count,
    clock_timestamp(),
    clock_timestamp(),
    clock_timestamp()
  FROM tmp_facility_presence_input
  ON CONFLICT (location_id, animal_gingr_id) DO UPDATE SET
    reservation_gingr_id = EXCLUDED.reservation_gingr_id,
    reservation_gingr_ids = EXCLUDED.reservation_gingr_ids,
    owner_gingr_id = EXCLUDED.owner_gingr_id,
    owner_first_name = EXCLUDED.owner_first_name,
    owner_last_name = EXCLUDED.owner_last_name,
    animal_name = EXCLUDED.animal_name,
    animal_breed = EXCLUDED.animal_breed,
    reservation_type_name = EXCLUDED.reservation_type_name,
    presence_type = EXCLUDED.presence_type,
    room_name = EXCLUDED.room_name,
    area_name = EXCLUDED.area_name,
    start_date = EXCLUDED.start_date,
    end_date = EXCLUDED.end_date,
    check_in_date = EXCLUDED.check_in_date,
    scheduled_check_out_date = EXCLUDED.scheduled_check_out_date,
    source = EXCLUDED.source,
    source_hash = EXCLUDED.source_hash,
    source_payload = EXCLUDED.source_payload,
    duplicate_reservation_count = EXCLUDED.duplicate_reservation_count,
    last_seen_at = clock_timestamp(),
    updated_at = clock_timestamp();

  DELETE FROM public.facility_presence_current c
  WHERE c.location_id = p_location_id
    AND NOT EXISTS (
      SELECT 1
      FROM tmp_facility_presence_input i
      WHERE i.location_id = c.location_id
        AND i.animal_gingr_id = c.animal_gingr_id
    );

  SELECT COUNT(*) INTO v_anomaly_count
  FROM public.facility_presence_events
  WHERE source_run_id = v_run_id
    AND reconciliation_status <> 'ok';

  UPDATE public.facility_presence_sync_runs
  SET
    status = 'completed',
    completed_at = clock_timestamp(),
    duration_ms = FLOOR(EXTRACT(EPOCH FROM (clock_timestamp() - v_started_at)) * 1000)::INT,
    current_count = v_current_count,
    arrivals_count = v_arrivals_count,
    departures_count = v_departures_count,
    duplicate_animals_count = v_duplicate_animals_count,
    anomaly_count = v_anomaly_count
  WHERE id = v_run_id;

  SELECT jsonb_build_object(
    'run_id', v_run_id,
    'location_id', p_location_id,
    'current_count', v_current_count,
    'arrivals_count', v_arrivals_count,
    'departures_count', v_departures_count,
    'duplicate_animals_count', v_duplicate_animals_count,
    'anomaly_count', v_anomaly_count,
    'duration_ms', FLOOR(EXTRACT(EPOCH FROM (clock_timestamp() - v_started_at)) * 1000)::INT
  )
  INTO v_result;

  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  UPDATE public.facility_presence_sync_runs
  SET
    status = 'failed',
    completed_at = clock_timestamp(),
    duration_ms = FLOOR(EXTRACT(EPOCH FROM (clock_timestamp() - v_started_at)) * 1000)::INT,
    errors = jsonb_build_array(jsonb_build_object('message', SQLERRM, 'state', SQLSTATE))
  WHERE id = v_run_id;

  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_facility_presence(TEXT, JSONB, TEXT, INT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_facility_presence(TEXT, JSONB, TEXT, INT, JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.reconcile_facility_presence(TEXT, JSONB, TEXT, INT, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_facility_presence(TEXT, JSONB, TEXT, INT, JSONB) TO service_role;

CREATE OR REPLACE FUNCTION public.facility_presence_snapshot(p_location_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  d DATE := CURRENT_DATE;
  v_total_rooms INT := 0;
  v_pending_arrivals INT := 0;
  v_latest_sync JSONB;
  v_counts JSONB;
  v_current JSONB;
  v_events JSONB;
BEGIN
  BEGIN
    SELECT COALESCE(
      (SELECT SUM(jsonb_array_length(value))
       FROM public.lite_settings s, jsonb_each(s.setting_value)
       WHERE s.location_id = p_location_id AND s.setting_key = 'room_names'),
      0
    ) INTO v_total_rooms;
  EXCEPTION WHEN OTHERS THEN
    v_total_rooms := 0;
  END;

  IF v_total_rooms IS NULL OR v_total_rooms = 0 THEN
    v_total_rooms := 1;
  END IF;

  SELECT COUNT(*) INTO v_pending_arrivals
  FROM public.gingr_back_of_house b
  WHERE b.location_id = p_location_id
    AND b.status = 'checking_in'
    AND b.synced_at > NOW() - INTERVAL '8 minutes';

  SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.animal_name), '[]'::JSONB)
  INTO v_current
  FROM public.facility_presence_current c
  WHERE c.location_id = p_location_id;

  SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.computed_at DESC), '[]'::JSONB)
  INTO v_events
  FROM (
    SELECT *
    FROM public.facility_presence_events
    WHERE location_id = p_location_id
      AND computed_at > NOW() - INTERVAL '15 minutes'
    ORDER BY computed_at DESC
    LIMIT 50
  ) e;

  SELECT to_jsonb(r)
  INTO v_latest_sync
  FROM (
    SELECT *
    FROM public.facility_presence_sync_runs
    WHERE location_id = p_location_id
    ORDER BY started_at DESC
    LIMIT 1
  ) r;

  SELECT jsonb_build_object(
    'in_house', COUNT(*),
    'boarding', COUNT(*) FILTER (WHERE presence_type = 'boarding'),
    'daycare', COUNT(*) FILTER (WHERE presence_type IN ('daycare', 'dayboarding', 'evaluation')),
    'dayboarding', COUNT(*) FILTER (WHERE presence_type = 'dayboarding'),
    'evaluation', COUNT(*) FILTER (WHERE presence_type = 'evaluation'),
    'going_home', COUNT(*) FILTER (WHERE scheduled_check_out_date::DATE = d),
    'pending_arrivals', v_pending_arrivals,
    'occupancy_pct', ROUND(
      COUNT(*) FILTER (
        WHERE presence_type = 'boarding'
          AND (scheduled_check_out_date IS NULL OR scheduled_check_out_date::DATE > d)
      )::NUMERIC / v_total_rooms * 100
    )::INT,
    'duplicate_animals', COUNT(*) FILTER (WHERE duplicate_reservation_count > 1)
  )
  INTO v_counts
  FROM public.facility_presence_current
  WHERE location_id = p_location_id;

  RETURN jsonb_build_object(
    'counts', COALESCE(v_counts, '{}'::JSONB),
    'current', COALESCE(v_current, '[]'::JSONB),
    'recent_events', COALESCE(v_events, '[]'::JSONB),
    'latest_sync', v_latest_sync,
    'generated_at', NOW()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.facility_presence_snapshot(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.facility_presence_snapshot(TEXT) TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'facility_presence_current'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.facility_presence_current;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'facility_presence_events'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.facility_presence_events;
    END IF;
  END IF;
END $$;
