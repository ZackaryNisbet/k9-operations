-- Enterprise Checkout TV presence sync
-- - Server-side cadence config
-- - Pre-GINGR sync claim lock
-- - Location-scoped all-staff read policies for canonical presence

CREATE TABLE IF NOT EXISTS public.facility_presence_sync_locks (
  location_id TEXT PRIMARY KEY,
  owner_token TEXT NOT NULL,
  locked_until TIMESTAMPTZ NOT NULL,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB
);

CREATE INDEX IF NOT EXISTS facility_presence_sync_locks_locked_until_idx
  ON public.facility_presence_sync_locks(locked_until);

ALTER TABLE public.facility_presence_sync_locks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS facility_presence_sync_locks_service ON public.facility_presence_sync_locks;
CREATE POLICY facility_presence_sync_locks_service
  ON public.facility_presence_sync_locks
  FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS facility_presence_current_read ON public.facility_presence_current;
CREATE POLICY facility_presence_current_read
  ON public.facility_presence_current
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.lite_profiles lp
      LEFT JOIN public.locations l
        ON l.slug = lp.location_id
        OR l.id::TEXT = lp.location_id
      WHERE lp.user_id = auth.uid()
        AND lp.is_active = TRUE
        AND (
          lp.location_id = facility_presence_current.location_id
          OR l.id::TEXT = facility_presence_current.location_id
          OR l.slug = facility_presence_current.location_id
          OR lp.role = 'enterprise_admin'
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.location_id::TEXT = facility_presence_current.location_id
          OR p.role IN ('owner', 'role_owner', 'enterprise_admin')
        )
    )
  );

DROP POLICY IF EXISTS facility_presence_events_read ON public.facility_presence_events;
CREATE POLICY facility_presence_events_read
  ON public.facility_presence_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.lite_profiles lp
      LEFT JOIN public.locations l
        ON l.slug = lp.location_id
        OR l.id::TEXT = lp.location_id
      WHERE lp.user_id = auth.uid()
        AND lp.is_active = TRUE
        AND (
          lp.location_id = facility_presence_events.location_id
          OR l.id::TEXT = facility_presence_events.location_id
          OR l.slug = facility_presence_events.location_id
          OR lp.role = 'enterprise_admin'
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.location_id::TEXT = facility_presence_events.location_id
          OR p.role IN ('owner', 'role_owner', 'enterprise_admin')
        )
    )
  );

DROP POLICY IF EXISTS facility_presence_sync_runs_read ON public.facility_presence_sync_runs;
CREATE POLICY facility_presence_sync_runs_read
  ON public.facility_presence_sync_runs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.lite_profiles lp
      LEFT JOIN public.locations l
        ON l.slug = lp.location_id
        OR l.id::TEXT = lp.location_id
      WHERE lp.user_id = auth.uid()
        AND lp.is_active = TRUE
        AND (
          lp.location_id = facility_presence_sync_runs.location_id
          OR l.id::TEXT = facility_presence_sync_runs.location_id
          OR l.slug = facility_presence_sync_runs.location_id
          OR lp.role = 'enterprise_admin'
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.location_id::TEXT = facility_presence_sync_runs.location_id
          OR p.role IN ('owner', 'role_owner', 'enterprise_admin')
        )
    )
  );

CREATE OR REPLACE FUNCTION public.claim_facility_presence_sync(
  p_location_id TEXT,
  p_owner_token TEXT,
  p_lock_ttl_seconds INT DEFAULT 20,
  p_min_interval_ms INT DEFAULT 5000,
  p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_latest_completed_at TIMESTAMPTZ;
  v_latest_age_ms NUMERIC;
  v_lock public.facility_presence_sync_locks%ROWTYPE;
  v_ttl_seconds INT := GREATEST(5, LEAST(120, COALESCE(p_lock_ttl_seconds, 20)));
  v_min_interval_ms INT := GREATEST(1000, LEAST(60000, COALESCE(p_min_interval_ms, 5000)));
BEGIN
  IF p_location_id IS NULL OR btrim(p_location_id) = '' THEN
    RETURN jsonb_build_object('claimed', FALSE, 'reason', 'missing_location');
  END IF;

  IF p_owner_token IS NULL OR btrim(p_owner_token) = '' THEN
    RETURN jsonb_build_object('claimed', FALSE, 'reason', 'missing_owner');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('facility_presence_claim:' || p_location_id));

  SELECT completed_at
  INTO v_latest_completed_at
  FROM public.facility_presence_sync_runs
  WHERE location_id = p_location_id
    AND status = 'completed'
    AND completed_at IS NOT NULL
  ORDER BY completed_at DESC
  LIMIT 1;

  IF v_latest_completed_at IS NOT NULL THEN
    v_latest_age_ms := EXTRACT(EPOCH FROM (v_now - v_latest_completed_at)) * 1000;
    IF v_latest_age_ms < v_min_interval_ms THEN
      RETURN jsonb_build_object(
        'claimed', FALSE,
        'reason', 'fresh',
        'latest_completed_at', v_latest_completed_at,
        'latest_age_ms', v_latest_age_ms,
        'min_interval_ms', v_min_interval_ms
      );
    END IF;
  END IF;

  SELECT *
  INTO v_lock
  FROM public.facility_presence_sync_locks
  WHERE location_id = p_location_id
  FOR UPDATE;

  IF FOUND AND v_lock.locked_until > v_now AND v_lock.owner_token <> p_owner_token THEN
    RETURN jsonb_build_object(
      'claimed', FALSE,
      'reason', 'locked',
      'locked_until', v_lock.locked_until,
      'owner_token', v_lock.owner_token
    );
  END IF;

  INSERT INTO public.facility_presence_sync_locks (
    location_id,
    owner_token,
    locked_until,
    claimed_at,
    updated_at,
    metadata
  )
  VALUES (
    p_location_id,
    p_owner_token,
    v_now + make_interval(secs => v_ttl_seconds),
    v_now,
    v_now,
    COALESCE(p_metadata, '{}'::JSONB)
  )
  ON CONFLICT (location_id) DO UPDATE SET
    owner_token = EXCLUDED.owner_token,
    locked_until = EXCLUDED.locked_until,
    claimed_at = EXCLUDED.claimed_at,
    updated_at = EXCLUDED.updated_at,
    metadata = EXCLUDED.metadata;

  RETURN jsonb_build_object(
    'claimed', TRUE,
    'reason', 'claimed',
    'locked_until', v_now + make_interval(secs => v_ttl_seconds),
    'latest_completed_at', v_latest_completed_at,
    'min_interval_ms', v_min_interval_ms
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.release_facility_presence_sync(
  p_location_id TEXT,
  p_owner_token TEXT,
  p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_updated INT := 0;
BEGIN
  UPDATE public.facility_presence_sync_locks
  SET locked_until = v_now,
      updated_at = v_now,
      metadata = COALESCE(p_metadata, metadata)
  WHERE location_id = p_location_id
    AND owner_token = p_owner_token;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_facility_presence_sync(TEXT, TEXT, INT, INT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_facility_presence_sync(TEXT, TEXT, INT, INT, JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.claim_facility_presence_sync(TEXT, TEXT, INT, INT, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_facility_presence_sync(TEXT, TEXT, INT, INT, JSONB) TO service_role;

REVOKE ALL ON FUNCTION public.release_facility_presence_sync(TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_facility_presence_sync(TEXT, TEXT, JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.release_facility_presence_sync(TEXT, TEXT, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.release_facility_presence_sync(TEXT, TEXT, JSONB) TO service_role;

INSERT INTO public.lite_settings (location_id, setting_key, setting_value)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  'presence_sync_config_v1',
  jsonb_build_object(
    'enabled', TRUE,
    'normalIntervalSeconds', 5,
    'offHoursIntervalSeconds', 30,
    'businessHoursEnabled', TRUE,
    'businessHoursStart', '06:30',
    'businessHoursEnd', '19:30',
    'peakEnabled', FALSE,
    'peakIntervalSeconds', 3,
    'peakWindows', jsonb_build_array(
      jsonb_build_object('start', '07:00', 'end', '09:30'),
      jsonb_build_object('start', '16:00', 'end', '18:30')
    )
  )
)
ON CONFLICT (location_id, setting_key) DO NOTHING;
