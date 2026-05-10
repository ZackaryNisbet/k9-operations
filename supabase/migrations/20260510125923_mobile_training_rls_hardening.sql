-- Mobile Training RLS hardening
--
-- Rollback path:
--   1. Recreate the previous permissive policies from
--      20260411214800_training_module_foundation.sql.
--   2. Drop app_private.can_access_training_location(uuid) and
--      app_private.is_lite_training_editor() if no newer policy depends on them.
--
-- This keeps canonical training writes available through the existing RPCs while
-- preventing authenticated users from reading or mutating records outside their
-- active Lite/POS location access. Training edits are limited to Supervisor and
-- above, matching the mobile Training permission surface.

CREATE SCHEMA IF NOT EXISTS app_private;

CREATE OR REPLACE FUNCTION app_private.can_access_training_location(p_location_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, app_private
AS $$
  SELECT COALESCE(
    p_location_id IS NOT NULL
    AND (
      EXISTS (
        SELECT 1
        FROM public.lite_profiles lp
        LEFT JOIN public.locations loc ON loc.id = p_location_id
        WHERE lp.user_id = auth.uid()
          AND lp.is_active = true
          AND (
            lp.role::text IN ('enterprise_admin', 'multi_location_admin')
            OR lp.location_id = p_location_id::text
            OR (loc.slug IS NOT NULL AND lp.location_id = loc.slug)
          )
      )
      OR EXISTS (
        SELECT 1
        FROM public.profile_locations pl
        WHERE pl.profile_id = auth.uid()
          AND pl.location_id = p_location_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND (
            p.role IN ('owner', 'role_owner', 'developer', 'enterprise_admin', 'role_enterprise_admin')
            OR p.location_id = p_location_id
          )
      )
    ),
    false
  );
$$;

CREATE OR REPLACE FUNCTION app_private.is_lite_training_editor()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, app_private
AS $$
  SELECT COALESCE(
    EXISTS (
      SELECT 1
      FROM public.lite_profiles lp
      WHERE lp.user_id = auth.uid()
        AND lp.is_active = true
        AND lp.role::text IN (
          'supervisor',
          'manager',
          'location_admin',
          'multi_location_admin',
          'enterprise_admin'
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('owner', 'role_owner', 'developer', 'enterprise_admin', 'role_enterprise_admin')
    ),
    false
  );
$$;

REVOKE ALL ON FUNCTION app_private.can_access_training_location(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.is_lite_training_editor() FROM PUBLIC;
GRANT USAGE ON SCHEMA app_private TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.can_access_training_location(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.is_lite_training_editor() TO authenticated;

DROP POLICY IF EXISTS training_records_read ON public.training_records;
DROP POLICY IF EXISTS training_records_insert ON public.training_records;
DROP POLICY IF EXISTS training_records_update ON public.training_records;
DROP POLICY IF EXISTS training_rir_read ON public.training_record_item_results;
DROP POLICY IF EXISTS training_rir_insert ON public.training_record_item_results;
DROP POLICY IF EXISTS training_rir_update ON public.training_record_item_results;
DROP POLICY IF EXISTS training_notes_read ON public.training_record_notes;
DROP POLICY IF EXISTS training_notes_insert ON public.training_record_notes;
DROP POLICY IF EXISTS training_events_read ON public.training_record_events;
DROP POLICY IF EXISTS training_events_insert ON public.training_record_events;

CREATE POLICY training_records_read
  ON public.training_records
  FOR SELECT
  TO authenticated
  USING (app_private.can_access_training_location(location_id));

CREATE POLICY training_records_insert
  ON public.training_records
  FOR INSERT
  TO authenticated
  WITH CHECK (
    app_private.is_lite_training_editor()
    AND app_private.can_access_training_location(location_id)
  );

CREATE POLICY training_records_update
  ON public.training_records
  FOR UPDATE
  TO authenticated
  USING (
    app_private.is_lite_training_editor()
    AND app_private.can_access_training_location(location_id)
  )
  WITH CHECK (
    app_private.is_lite_training_editor()
    AND app_private.can_access_training_location(location_id)
  );

CREATE POLICY training_rir_read
  ON public.training_record_item_results
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.training_records record
      WHERE record.id = training_record_item_results.record_id
        AND app_private.can_access_training_location(record.location_id)
    )
  );

CREATE POLICY training_rir_insert
  ON public.training_record_item_results
  FOR INSERT
  TO authenticated
  WITH CHECK (
    app_private.is_lite_training_editor()
    AND EXISTS (
      SELECT 1
      FROM public.training_records record
      WHERE record.id = training_record_item_results.record_id
        AND app_private.can_access_training_location(record.location_id)
    )
  );

CREATE POLICY training_rir_update
  ON public.training_record_item_results
  FOR UPDATE
  TO authenticated
  USING (
    app_private.is_lite_training_editor()
    AND EXISTS (
      SELECT 1
      FROM public.training_records record
      WHERE record.id = training_record_item_results.record_id
        AND app_private.can_access_training_location(record.location_id)
    )
  )
  WITH CHECK (
    app_private.is_lite_training_editor()
    AND EXISTS (
      SELECT 1
      FROM public.training_records record
      WHERE record.id = training_record_item_results.record_id
        AND app_private.can_access_training_location(record.location_id)
    )
  );

CREATE POLICY training_notes_read
  ON public.training_record_notes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.training_records record
      WHERE record.id = training_record_notes.record_id
        AND app_private.can_access_training_location(record.location_id)
    )
  );

CREATE POLICY training_notes_insert
  ON public.training_record_notes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    app_private.is_lite_training_editor()
    AND EXISTS (
      SELECT 1
      FROM public.training_records record
      WHERE record.id = training_record_notes.record_id
        AND app_private.can_access_training_location(record.location_id)
    )
  );

CREATE POLICY training_events_read
  ON public.training_record_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.training_records record
      WHERE record.id = training_record_events.record_id
        AND app_private.can_access_training_location(record.location_id)
    )
  );

CREATE POLICY training_events_insert
  ON public.training_record_events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    app_private.is_lite_training_editor()
    AND EXISTS (
      SELECT 1
      FROM public.training_records record
      WHERE record.id = training_record_events.record_id
        AND app_private.can_access_training_location(record.location_id)
    )
  );
