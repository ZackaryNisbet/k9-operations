BEGIN;

ALTER TABLE public.grassroots_targets
  ADD COLUMN IF NOT EXISTS address_line_1 text,
  ADD COLUMN IF NOT EXISTS address_line_2 text,
  ADD COLUMN IF NOT EXISTS address_city text,
  ADD COLUMN IF NOT EXISTS address_state text,
  ADD COLUMN IF NOT EXISTS address_postal_code text,
  ADD COLUMN IF NOT EXISTS address_country text,
  ADD COLUMN IF NOT EXISTS google_place_id text;

ALTER TABLE public.grassroots_targets
  DROP CONSTRAINT IF EXISTS grassroots_targets_status_check;

CREATE SCHEMA IF NOT EXISTS app_private;

CREATE TABLE IF NOT EXISTS app_private.grassroots_targets_status_backup_20260511152604 (
  target_id uuid PRIMARY KEY,
  previous_status text,
  previous_is_active boolean,
  backed_up_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO app_private.grassroots_targets_status_backup_20260511152604 (
  target_id,
  previous_status,
  previous_is_active
)
SELECT
  id,
  status,
  is_active
FROM public.grassroots_targets
WHERE status IS DISTINCT FROM CASE
    WHEN lower(regexp_replace(trim(COALESCE(status, 'identified')), '[^a-z0-9]+', '_', 'g')) IN ('outreach', 'identified', 'new', 'lead') THEN 'identified'
    WHEN lower(regexp_replace(trim(COALESCE(status, 'identified')), '[^a-z0-9]+', '_', 'g')) IN ('corresponding', 'correspondence', 'contacted') THEN 'corresponding'
    WHEN lower(regexp_replace(trim(COALESCE(status, 'identified')), '[^a-z0-9]+', '_', 'g')) IN ('closing', 'active', 'booked', 'officially_booked') THEN 'booked'
    WHEN lower(regexp_replace(trim(COALESCE(status, 'identified')), '[^a-z0-9]+', '_', 'g')) IN ('abandoned', 'archive', 'archived', 'inactive', 'dead', 'dropped') THEN 'abandoned'
    ELSE 'identified'
  END
  OR (
    lower(regexp_replace(trim(COALESCE(status, 'identified')), '[^a-z0-9]+', '_', 'g')) IN ('abandoned', 'archive', 'archived', 'inactive', 'dead', 'dropped')
    AND is_active IS DISTINCT FROM false
  )
ON CONFLICT (target_id) DO NOTHING;

UPDATE public.grassroots_targets
SET
  status = CASE
    WHEN lower(regexp_replace(trim(COALESCE(status, 'identified')), '[^a-z0-9]+', '_', 'g')) IN ('outreach', 'identified', 'new', 'lead') THEN 'identified'
    WHEN lower(regexp_replace(trim(COALESCE(status, 'identified')), '[^a-z0-9]+', '_', 'g')) IN ('corresponding', 'correspondence', 'contacted') THEN 'corresponding'
    WHEN lower(regexp_replace(trim(COALESCE(status, 'identified')), '[^a-z0-9]+', '_', 'g')) IN ('closing', 'active', 'booked', 'officially_booked') THEN 'booked'
    WHEN lower(regexp_replace(trim(COALESCE(status, 'identified')), '[^a-z0-9]+', '_', 'g')) IN ('abandoned', 'archive', 'archived', 'inactive', 'dead', 'dropped') THEN 'abandoned'
    ELSE 'identified'
  END,
  is_active = CASE
    WHEN lower(regexp_replace(trim(COALESCE(status, 'identified')), '[^a-z0-9]+', '_', 'g')) IN ('abandoned', 'archive', 'archived', 'inactive', 'dead', 'dropped') THEN false
    ELSE is_active
  END
WHERE status IS DISTINCT FROM CASE
    WHEN lower(regexp_replace(trim(COALESCE(status, 'identified')), '[^a-z0-9]+', '_', 'g')) IN ('outreach', 'identified', 'new', 'lead') THEN 'identified'
    WHEN lower(regexp_replace(trim(COALESCE(status, 'identified')), '[^a-z0-9]+', '_', 'g')) IN ('corresponding', 'correspondence', 'contacted') THEN 'corresponding'
    WHEN lower(regexp_replace(trim(COALESCE(status, 'identified')), '[^a-z0-9]+', '_', 'g')) IN ('closing', 'active', 'booked', 'officially_booked') THEN 'booked'
    WHEN lower(regexp_replace(trim(COALESCE(status, 'identified')), '[^a-z0-9]+', '_', 'g')) IN ('abandoned', 'archive', 'archived', 'inactive', 'dead', 'dropped') THEN 'abandoned'
    ELSE 'identified'
  END
  OR (
    lower(regexp_replace(trim(COALESCE(status, 'identified')), '[^a-z0-9]+', '_', 'g')) IN ('abandoned', 'archive', 'archived', 'inactive', 'dead', 'dropped')
    AND is_active IS DISTINCT FROM false
  );

ALTER TABLE public.grassroots_targets
  ALTER COLUMN status SET DEFAULT 'identified';

ALTER TABLE public.grassroots_targets
  ADD CONSTRAINT grassroots_targets_status_check
  CHECK (status IN ('identified', 'corresponding', 'booked', 'abandoned'));

CREATE INDEX IF NOT EXISTS grassroots_targets_google_place_id_idx
  ON public.grassroots_targets (location_id, google_place_id)
  WHERE google_place_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.save_grassroots_target_with_event_dates(
  p_target jsonb,
  p_event_dates jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_target_id uuid := NULLIF(p_target->>'id', '')::uuid;
  v_location_id uuid := NULLIF(p_target->>'location_id', '')::uuid;
  v_category text := COALESCE(NULLIF(p_target->>'category', ''), 'events');
  v_status_input text := lower(regexp_replace(trim(COALESCE(p_target->>'status', 'identified')), '[^a-z0-9]+', '_', 'g'));
  v_status text;
  v_is_active boolean;
  v_details jsonb := CASE
    WHEN jsonb_typeof(p_target->'details') = 'object' THEN p_target->'details'
    ELSE '{}'::jsonb
  END;
  v_event_dates jsonb := COALESCE(p_event_dates, '[]'::jsonb);
  v_target public.grassroots_targets%ROWTYPE;
  v_first_event record;
  v_last_event record;
  v_event_time text;
  v_event_date_count integer;
  v_saved_event_dates jsonb;
BEGIN
  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'location_id is required' USING ERRCODE = '22023';
  END IF;

  IF v_category <> 'events' THEN
    RAISE EXCEPTION 'save_grassroots_target_with_event_dates only supports event targets' USING ERRCODE = '22023';
  END IF;

  IF NOT public.labor_has_management_access(v_location_id) THEN
    RAISE EXCEPTION 'Not authorized to save grassroots events for this location' USING ERRCODE = '42501';
  END IF;

  v_status := CASE
    WHEN v_status_input IN ('outreach', 'identified', 'new', 'lead') THEN 'identified'
    WHEN v_status_input IN ('corresponding', 'correspondence', 'contacted') THEN 'corresponding'
    WHEN v_status_input IN ('closing', 'active', 'booked', 'officially_booked') THEN 'booked'
    WHEN v_status_input IN ('abandoned', 'archive', 'archived', 'inactive', 'dead', 'dropped') THEN 'abandoned'
    ELSE 'identified'
  END;
  v_is_active := CASE
    WHEN v_status = 'abandoned' THEN false
    ELSE COALESCE(NULLIF(p_target->>'is_active', '')::boolean, true)
  END;

  IF jsonb_typeof(v_event_dates) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'event dates must be a JSON array' USING ERRCODE = '22023';
  END IF;

  v_event_date_count := jsonb_array_length(v_event_dates);
  IF v_event_date_count = 0 THEN
    RAISE EXCEPTION 'At least one event date is required' USING ERRCODE = '23502';
  END IF;

  WITH parsed AS (
    SELECT
      NULLIF(row_data->>'event_date', '')::date AS event_date,
      NULLIF(row_data->>'start_time', '')::time AS start_time,
      NULLIF(row_data->>'end_time', '')::time AS end_time,
      COALESCE(NULLIF(row_data->>'sequence_order', '')::integer, ordinality::integer) AS sequence_order
    FROM jsonb_array_elements(v_event_dates) WITH ORDINALITY AS rows(row_data, ordinality)
  )
  SELECT event_date, start_time, end_time, sequence_order
  INTO v_first_event
  FROM parsed
  ORDER BY event_date, sequence_order
  LIMIT 1;

  WITH parsed AS (
    SELECT
      NULLIF(row_data->>'event_date', '')::date AS event_date,
      COALESCE(NULLIF(row_data->>'sequence_order', '')::integer, ordinality::integer) AS sequence_order
    FROM jsonb_array_elements(v_event_dates) WITH ORDINALITY AS rows(row_data, ordinality)
  )
  SELECT event_date, sequence_order
  INTO v_last_event
  FROM parsed
  ORDER BY event_date DESC, sequence_order DESC
  LIMIT 1;

  v_event_time := CASE
    WHEN v_first_event.start_time IS NOT NULL AND v_first_event.end_time IS NOT NULL THEN
      to_char(v_first_event.start_time, 'HH24:MI') || '-' || to_char(v_first_event.end_time, 'HH24:MI')
    WHEN v_first_event.start_time IS NOT NULL THEN
      to_char(v_first_event.start_time, 'HH24:MI')
    ELSE NULLIF(p_target->>'event_time', '')
  END;

  IF v_target_id IS NULL THEN
    INSERT INTO public.grassroots_targets (
      location_id,
      category,
      name,
      address,
      address_line_1,
      address_line_2,
      address_city,
      address_state,
      address_postal_code,
      address_country,
      google_place_id,
      organizer,
      first_name,
      last_name,
      contact_source,
      contact_email,
      contact_phone,
      status,
      is_active,
      business_category,
      drop_category,
      local_employees,
      us_employees,
      proposal,
      initial_contact_date,
      last_contact_date,
      next_contact_date,
      event_start_date,
      event_end_date,
      event_time,
      event_type,
      expected_audience,
      leads_captured,
      cost,
      cpl,
      details,
      created_by_user_id,
      created_by_name,
      updated_by_user_id,
      updated_by_name
    )
    VALUES (
      v_location_id,
      'events',
      COALESCE(NULLIF(p_target->>'name', ''), ''),
      NULLIF(p_target->>'address', ''),
      NULLIF(p_target->>'address_line_1', ''),
      NULLIF(p_target->>'address_line_2', ''),
      NULLIF(p_target->>'address_city', ''),
      NULLIF(p_target->>'address_state', ''),
      NULLIF(p_target->>'address_postal_code', ''),
      NULLIF(p_target->>'address_country', ''),
      NULLIF(p_target->>'google_place_id', ''),
      NULLIF(p_target->>'organizer', ''),
      NULLIF(p_target->>'first_name', ''),
      NULLIF(p_target->>'last_name', ''),
      NULLIF(p_target->>'contact_source', ''),
      NULLIF(p_target->>'contact_email', ''),
      NULLIF(p_target->>'contact_phone', ''),
      v_status,
      v_is_active,
      NULLIF(p_target->>'business_category', ''),
      NULLIF(p_target->>'drop_category', ''),
      NULLIF(p_target->>'local_employees', '')::integer,
      NULLIF(p_target->>'us_employees', '')::integer,
      NULLIF(p_target->>'proposal', ''),
      NULLIF(p_target->>'initial_contact_date', '')::date,
      NULLIF(p_target->>'last_contact_date', '')::date,
      NULLIF(p_target->>'next_contact_date', '')::date,
      v_first_event.event_date,
      CASE WHEN v_event_date_count > 1 THEN v_last_event.event_date ELSE NULL END,
      v_event_time,
      NULLIF(p_target->>'event_type', ''),
      NULLIF(p_target->>'expected_audience', '')::integer,
      NULLIF(p_target->>'leads_captured', '')::integer,
      NULLIF(p_target->>'cost', '')::numeric(12,2),
      NULLIF(p_target->>'cpl', '')::numeric(12,2),
      v_details,
      NULLIF(p_target->>'created_by_user_id', '')::uuid,
      NULLIF(p_target->>'created_by_name', ''),
      NULLIF(p_target->>'updated_by_user_id', '')::uuid,
      NULLIF(p_target->>'updated_by_name', '')
    )
    RETURNING * INTO v_target;
  ELSE
    UPDATE public.grassroots_targets
    SET
      name = COALESCE(NULLIF(p_target->>'name', ''), ''),
      address = NULLIF(p_target->>'address', ''),
      address_line_1 = NULLIF(p_target->>'address_line_1', ''),
      address_line_2 = NULLIF(p_target->>'address_line_2', ''),
      address_city = NULLIF(p_target->>'address_city', ''),
      address_state = NULLIF(p_target->>'address_state', ''),
      address_postal_code = NULLIF(p_target->>'address_postal_code', ''),
      address_country = NULLIF(p_target->>'address_country', ''),
      google_place_id = NULLIF(p_target->>'google_place_id', ''),
      organizer = NULLIF(p_target->>'organizer', ''),
      first_name = NULLIF(p_target->>'first_name', ''),
      last_name = NULLIF(p_target->>'last_name', ''),
      contact_source = NULLIF(p_target->>'contact_source', ''),
      contact_email = NULLIF(p_target->>'contact_email', ''),
      contact_phone = NULLIF(p_target->>'contact_phone', ''),
      status = v_status,
      is_active = v_is_active,
      business_category = NULLIF(p_target->>'business_category', ''),
      drop_category = NULLIF(p_target->>'drop_category', ''),
      local_employees = NULLIF(p_target->>'local_employees', '')::integer,
      us_employees = NULLIF(p_target->>'us_employees', '')::integer,
      proposal = NULLIF(p_target->>'proposal', ''),
      initial_contact_date = NULLIF(p_target->>'initial_contact_date', '')::date,
      last_contact_date = NULLIF(p_target->>'last_contact_date', '')::date,
      next_contact_date = NULLIF(p_target->>'next_contact_date', '')::date,
      event_start_date = v_first_event.event_date,
      event_end_date = CASE WHEN v_event_date_count > 1 THEN v_last_event.event_date ELSE NULL END,
      event_time = v_event_time,
      event_type = NULLIF(p_target->>'event_type', ''),
      expected_audience = NULLIF(p_target->>'expected_audience', '')::integer,
      leads_captured = NULLIF(p_target->>'leads_captured', '')::integer,
      cost = NULLIF(p_target->>'cost', '')::numeric(12,2),
      cpl = NULLIF(p_target->>'cpl', '')::numeric(12,2),
      details = v_details,
      updated_by_user_id = NULLIF(p_target->>'updated_by_user_id', '')::uuid,
      updated_by_name = NULLIF(p_target->>'updated_by_name', '')
    WHERE id = v_target_id
      AND location_id = v_location_id
      AND category = 'events'
    RETURNING * INTO v_target;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Grassroots event target was not found or is not writable' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  DELETE FROM public.grassroots_event_dates
  WHERE target_id = v_target.id
    AND location_id = v_location_id;

  INSERT INTO public.grassroots_event_dates (
    location_id,
    target_id,
    event_date,
    start_time,
    end_time,
    sequence_order,
    created_by_user_id,
    created_by_name,
    updated_by_user_id,
    updated_by_name
  )
  SELECT
    v_location_id,
    v_target.id,
    NULLIF(row_data->>'event_date', '')::date,
    NULLIF(row_data->>'start_time', '')::time,
    NULLIF(row_data->>'end_time', '')::time,
    COALESCE(NULLIF(row_data->>'sequence_order', '')::integer, ordinality::integer),
    COALESCE(NULLIF(p_target->>'created_by_user_id', '')::uuid, NULLIF(p_target->>'updated_by_user_id', '')::uuid),
    COALESCE(NULLIF(p_target->>'created_by_name', ''), NULLIF(p_target->>'updated_by_name', '')),
    NULLIF(p_target->>'updated_by_user_id', '')::uuid,
    NULLIF(p_target->>'updated_by_name', '')
  FROM jsonb_array_elements(v_event_dates) WITH ORDINALITY AS rows(row_data, ordinality);

  SELECT COALESCE(jsonb_agg(to_jsonb(d) ORDER BY d.event_date, d.sequence_order), '[]'::jsonb)
  INTO v_saved_event_dates
  FROM public.grassroots_event_dates d
  WHERE d.target_id = v_target.id;

  RETURN jsonb_build_object(
    'target', to_jsonb(v_target),
    'event_dates', v_saved_event_dates
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_grassroots_target_with_event_dates(jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_grassroots_target_with_event_dates(jsonb, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.save_grassroots_target_with_event_dates(jsonb, jsonb) TO authenticated;

COMMIT;
