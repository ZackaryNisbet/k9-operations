BEGIN;

CREATE TABLE IF NOT EXISTS public.grassroots_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (
    category IN (
      'events',
      'drops',
      'corporate_partnerships',
      'apartments',
      'pet_professional_partnerships'
    )
  ),
  name text NOT NULL DEFAULT '',
  address text,
  organizer text,
  first_name text,
  last_name text,
  contact_source text,
  contact_email text,
  contact_phone text,
  status text NOT NULL DEFAULT 'outreach' CHECK (status IN ('outreach', 'corresponding', 'closing', 'active')),
  is_active boolean NOT NULL DEFAULT true,
  local_employees integer,
  us_employees integer,
  proposal text,
  initial_contact_date date,
  last_contact_date date,
  next_contact_date date,
  event_start_date date,
  event_end_date date,
  event_time text,
  event_type text,
  expected_audience integer,
  leads_captured integer,
  cost numeric(12,2),
  cpl numeric(12,2),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  legacy_source_id text,
  created_by_user_id uuid,
  created_by_name text,
  updated_by_user_id uuid,
  updated_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.grassroots_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  target_id uuid NOT NULL REFERENCES public.grassroots_targets(id) ON DELETE CASCADE,
  activity_type text NOT NULL CHECK (activity_type IN ('development', 'drop', 'event_update', 'note')),
  activity_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text NOT NULL DEFAULT '',
  next_contact_date date,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  legacy_source_id text,
  created_by_user_id uuid,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS grassroots_targets_location_category_idx
  ON public.grassroots_targets (location_id, category, is_active, status, next_contact_date);

CREATE INDEX IF NOT EXISTS grassroots_targets_next_contact_idx
  ON public.grassroots_targets (location_id, next_contact_date)
  WHERE next_contact_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS grassroots_activity_target_idx
  ON public.grassroots_activity (target_id, created_at DESC);

CREATE INDEX IF NOT EXISTS grassroots_activity_location_type_idx
  ON public.grassroots_activity (location_id, activity_type, activity_date DESC);

CREATE UNIQUE INDEX IF NOT EXISTS grassroots_targets_legacy_source_uidx
  ON public.grassroots_targets (location_id, category, legacy_source_id)
  WHERE legacy_source_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS grassroots_activity_legacy_source_uidx
  ON public.grassroots_activity (location_id, legacy_source_id)
  WHERE legacy_source_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.grassroots_updated_at_trigger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_grassroots_targets_updated ON public.grassroots_targets;
CREATE TRIGGER trg_grassroots_targets_updated
  BEFORE UPDATE ON public.grassroots_targets
  FOR EACH ROW EXECUTE FUNCTION public.grassroots_updated_at_trigger();

CREATE OR REPLACE FUNCTION public.grassroots_sync_target_activity_rollup()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_target_id uuid := COALESCE(NEW.target_id, OLD.target_id);
BEGIN
  UPDATE public.grassroots_targets t
  SET
    last_contact_date = COALESCE(
      (
        SELECT max(a.activity_date)
        FROM public.grassroots_activity a
        WHERE a.target_id = v_target_id
      ),
      t.last_contact_date
    ),
    next_contact_date = COALESCE(
      (
        SELECT a.next_contact_date
        FROM public.grassroots_activity a
        WHERE a.target_id = v_target_id
          AND a.next_contact_date IS NOT NULL
        ORDER BY a.created_at DESC, a.activity_date DESC
        LIMIT 1
      ),
      t.next_contact_date
    ),
    updated_at = now()
  WHERE t.id = v_target_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_grassroots_activity_rollup ON public.grassroots_activity;
CREATE TRIGGER trg_grassroots_activity_rollup
  AFTER INSERT OR UPDATE OR DELETE ON public.grassroots_activity
  FOR EACH ROW EXECUTE FUNCTION public.grassroots_sync_target_activity_rollup();

ALTER TABLE public.grassroots_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grassroots_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS grassroots_targets_read ON public.grassroots_targets;
CREATE POLICY grassroots_targets_read ON public.grassroots_targets
  FOR SELECT TO authenticated
  USING (public.labor_has_location_access(location_id));

DROP POLICY IF EXISTS grassroots_targets_insert ON public.grassroots_targets;
CREATE POLICY grassroots_targets_insert ON public.grassroots_targets
  FOR INSERT TO authenticated
  WITH CHECK (public.labor_has_management_access(location_id));

DROP POLICY IF EXISTS grassroots_targets_update ON public.grassroots_targets;
CREATE POLICY grassroots_targets_update ON public.grassroots_targets
  FOR UPDATE TO authenticated
  USING (public.labor_has_management_access(location_id))
  WITH CHECK (public.labor_has_management_access(location_id));

DROP POLICY IF EXISTS grassroots_targets_delete ON public.grassroots_targets;
CREATE POLICY grassroots_targets_delete ON public.grassroots_targets
  FOR DELETE TO authenticated
  USING (public.labor_has_management_access(location_id));

DROP POLICY IF EXISTS grassroots_activity_read ON public.grassroots_activity;
CREATE POLICY grassroots_activity_read ON public.grassroots_activity
  FOR SELECT TO authenticated
  USING (public.labor_has_location_access(location_id));

DROP POLICY IF EXISTS grassroots_activity_insert ON public.grassroots_activity;
CREATE POLICY grassroots_activity_insert ON public.grassroots_activity
  FOR INSERT TO authenticated
  WITH CHECK (
    public.labor_has_management_access(location_id)
    AND EXISTS (
      SELECT 1
      FROM public.grassroots_targets t
      WHERE t.id = grassroots_activity.target_id
        AND t.location_id = grassroots_activity.location_id
    )
  );

DROP POLICY IF EXISTS grassroots_activity_update ON public.grassroots_activity;
CREATE POLICY grassroots_activity_update ON public.grassroots_activity
  FOR UPDATE TO authenticated
  USING (public.labor_has_management_access(location_id))
  WITH CHECK (
    public.labor_has_management_access(location_id)
    AND EXISTS (
      SELECT 1
      FROM public.grassroots_targets t
      WHERE t.id = grassroots_activity.target_id
        AND t.location_id = grassroots_activity.location_id
    )
  );

DROP POLICY IF EXISTS grassroots_activity_delete ON public.grassroots_activity;
CREATE POLICY grassroots_activity_delete ON public.grassroots_activity
  FOR DELETE TO authenticated
  USING (public.labor_has_management_access(location_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.grassroots_targets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grassroots_activity TO authenticated;

WITH source_rows AS (
  SELECT
    l.id AS location_uuid,
    'events'::text AS category,
    'events:' || COALESCE(row_data->>'id', ordinality::text) AS legacy_source_id,
    row_data,
    ordinality
  FROM public.lite_settings ls
  JOIN public.locations l
    ON l.id::text = ls.location_id
    OR l.slug = ls.location_id
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(ls.setting_value->'events', '[]'::jsonb)) WITH ORDINALITY AS legacy(row_data, ordinality)
  WHERE ls.setting_key = 'grassroots_tracker'
),
prepared AS (
  SELECT
    location_uuid,
    category,
    legacy_source_id,
    NULLIF(trim(row_data->>'event'), '') AS name,
    NULLIF(trim(row_data->>'organizer'), '') AS organizer,
    CASE WHEN row_data->>'startDate' ~ '^\d{4}-\d{2}-\d{2}$' THEN (row_data->>'startDate')::date END AS event_start_date,
    CASE WHEN row_data->>'endDate' ~ '^\d{4}-\d{2}-\d{2}$' THEN (row_data->>'endDate')::date END AS event_end_date,
    NULLIF(trim(row_data->>'time'), '') AS event_time,
    NULLIF(trim(row_data->>'type'), '') AS event_type,
    CASE WHEN regexp_replace(COALESCE(row_data->>'expectedAudience', ''), '[^0-9-]', '', 'g') ~ '^-?\d+$' THEN regexp_replace(row_data->>'expectedAudience', '[^0-9-]', '', 'g')::integer END AS expected_audience,
    CASE WHEN regexp_replace(COALESCE(row_data->>'leadsCaptured', ''), '[^0-9-]', '', 'g') ~ '^-?\d+$' THEN regexp_replace(row_data->>'leadsCaptured', '[^0-9-]', '', 'g')::integer END AS leads_captured,
    CASE WHEN regexp_replace(COALESCE(row_data->>'cost', ''), '[^0-9.-]', '', 'g') ~ '^-?\d+(\.\d+)?$' THEN regexp_replace(row_data->>'cost', '[^0-9.-]', '', 'g')::numeric(12,2) END AS cost,
    CASE WHEN regexp_replace(COALESCE(row_data->>'cpl', ''), '[^0-9.-]', '', 'g') ~ '^-?\d+(\.\d+)?$' THEN regexp_replace(row_data->>'cpl', '[^0-9.-]', '', 'g')::numeric(12,2) END AS cpl,
    NULLIF(trim(row_data->>'contact'), '') AS contact_source,
    CASE
      WHEN lower(trim(COALESCE(row_data->>'officiallyBooked', ''))) IN ('yes', 'y', 'true', 'booked', 'active') THEN 'active'
      ELSE 'outreach'
    END AS status,
    jsonb_build_object('legacy_row', row_data) AS details
  FROM source_rows
)
INSERT INTO public.grassroots_targets (
  location_id,
  category,
  legacy_source_id,
  name,
  organizer,
  event_start_date,
  event_end_date,
  event_time,
  event_type,
  expected_audience,
  leads_captured,
  cost,
  cpl,
  contact_source,
  status,
  details
)
SELECT
  location_uuid,
  category,
  legacy_source_id,
  COALESCE(name, ''),
  organizer,
  event_start_date,
  event_end_date,
  event_time,
  event_type,
  expected_audience,
  leads_captured,
  cost,
  cpl,
  contact_source,
  status,
  details
FROM prepared
ON CONFLICT DO NOTHING;

WITH source_rows AS (
  SELECT
    l.id AS location_uuid,
    'corporate_partnerships'::text AS category,
    'corporate_partnerships:' || COALESCE(row_data->>'id', ordinality::text) AS legacy_source_id,
    row_data
  FROM public.lite_settings ls
  JOIN public.locations l
    ON l.id::text = ls.location_id
    OR l.slug = ls.location_id
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(ls.setting_value->'corporatePartnerships', '[]'::jsonb)) WITH ORDINALITY AS legacy(row_data, ordinality)
  WHERE ls.setting_key = 'grassroots_tracker'
),
prepared AS (
  SELECT
    location_uuid,
    category,
    legacy_source_id,
    NULLIF(trim(row_data->>'corporation'), '') AS name,
    NULLIF(trim(row_data->>'firstName'), '') AS first_name,
    NULLIF(trim(row_data->>'lastName'), '') AS last_name,
    CASE WHEN regexp_replace(COALESCE(row_data->>'usEmployees', ''), '[^0-9-]', '', 'g') ~ '^-?\d+$' THEN regexp_replace(row_data->>'usEmployees', '[^0-9-]', '', 'g')::integer END AS us_employees,
    CASE WHEN regexp_replace(COALESCE(row_data->>'localEmployees', row_data->>'deerfieldEmployees', ''), '[^0-9-]', '', 'g') ~ '^-?\d+$' THEN regexp_replace(COALESCE(row_data->>'localEmployees', row_data->>'deerfieldEmployees'), '[^0-9-]', '', 'g')::integer END AS local_employees,
    NULLIF(trim(row_data->>'contactSource'), '') AS contact_source,
    NULLIF(trim(row_data->>'proposal'), '') AS proposal,
    CASE WHEN row_data->>'initialContactDate' ~ '^\d{4}-\d{2}-\d{2}$' THEN (row_data->>'initialContactDate')::date END AS initial_contact_date,
    CASE WHEN row_data->>'lastContactDate' ~ '^\d{4}-\d{2}-\d{2}$' THEN (row_data->>'lastContactDate')::date END AS last_contact_date,
    jsonb_build_object('legacy_row', row_data) AS details
  FROM source_rows
)
INSERT INTO public.grassroots_targets (
  location_id,
  category,
  legacy_source_id,
  name,
  first_name,
  last_name,
  us_employees,
  local_employees,
  contact_source,
  proposal,
  initial_contact_date,
  last_contact_date,
  details
)
SELECT
  location_uuid,
  category,
  legacy_source_id,
  COALESCE(name, ''),
  first_name,
  last_name,
  us_employees,
  local_employees,
  contact_source,
  proposal,
  initial_contact_date,
  last_contact_date,
  details
FROM prepared
ON CONFLICT DO NOTHING;

WITH source_rows AS (
  SELECT
    l.id AS location_uuid,
    'apartments'::text AS category,
    'apartments:' || COALESCE(row_data->>'id', ordinality::text) AS legacy_source_id,
    row_data
  FROM public.lite_settings ls
  JOIN public.locations l
    ON l.id::text = ls.location_id
    OR l.slug = ls.location_id
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(ls.setting_value->'apartments', '[]'::jsonb)) WITH ORDINALITY AS legacy(row_data, ordinality)
  WHERE ls.setting_key = 'grassroots_tracker'
)
INSERT INTO public.grassroots_targets (
  location_id,
  category,
  legacy_source_id,
  name,
  status,
  details
)
SELECT
  location_uuid,
  category,
  legacy_source_id,
  COALESCE(NULLIF(trim(row_data->>'apartmentComplex'), ''), ''),
  CASE lower(trim(COALESCE(row_data->>'status', '')))
    WHEN 'corresponding' THEN 'corresponding'
    WHEN 'closing' THEN 'closing'
    WHEN 'active' THEN 'active'
    ELSE 'outreach'
  END,
  jsonb_build_object('legacy_row', row_data)
FROM source_rows
ON CONFLICT DO NOTHING;

WITH source_rows AS (
  SELECT
    l.id AS location_uuid,
    'pet_professional_partnerships'::text AS category,
    'pet_professional_partnerships:' || COALESCE(row_data->>'id', ordinality::text) AS legacy_source_id,
    row_data
  FROM public.lite_settings ls
  JOIN public.locations l
    ON l.id::text = ls.location_id
    OR l.slug = ls.location_id
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(ls.setting_value->'petProfessionalPartnerships', '[]'::jsonb)) WITH ORDINALITY AS legacy(row_data, ordinality)
  WHERE ls.setting_key = 'grassroots_tracker'
)
INSERT INTO public.grassroots_targets (
  location_id,
  category,
  legacy_source_id,
  name,
  first_name,
  last_name,
  proposal,
  initial_contact_date,
  last_contact_date,
  details
)
SELECT
  location_uuid,
  category,
  legacy_source_id,
  COALESCE(NULLIF(trim(row_data->>'business'), ''), ''),
  NULLIF(trim(row_data->>'firstName'), ''),
  NULLIF(trim(row_data->>'lastName'), ''),
  NULLIF(trim(row_data->>'proposal'), ''),
  CASE WHEN row_data->>'initialContactDate' ~ '^\d{4}-\d{2}-\d{2}$' THEN (row_data->>'initialContactDate')::date END,
  CASE WHEN row_data->>'lastContactDate' ~ '^\d{4}-\d{2}-\d{2}$' THEN (row_data->>'lastContactDate')::date END,
  jsonb_build_object('legacy_row', row_data)
FROM source_rows
ON CONFLICT DO NOTHING;

WITH source_rows AS (
  SELECT
    l.id AS location_uuid,
    row_data,
    ordinality,
    lower(regexp_replace(trim(COALESCE(row_data->>'business', '')), '\s+', ' ', 'g')) AS business_key,
    lower(regexp_replace(trim(COALESCE(row_data->>'address', '')), '\s+', ' ', 'g')) AS address_key
  FROM public.lite_settings ls
  JOIN public.locations l
    ON l.id::text = ls.location_id
    OR l.slug = ls.location_id
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(ls.setting_value->'drops', '[]'::jsonb)) WITH ORDINALITY AS legacy(row_data, ordinality)
  WHERE ls.setting_key = 'grassroots_tracker'
),
drop_groups AS (
  SELECT
    location_uuid,
    md5(business_key || '|' || address_key) AS group_key,
    min(NULLIF(trim(row_data->>'business'), '')) AS business,
    min(NULLIF(trim(row_data->>'address'), '')) AS address,
    jsonb_build_object('legacy_drop_group_key', business_key || '|' || address_key) AS details
  FROM source_rows
  GROUP BY location_uuid, business_key, address_key
)
INSERT INTO public.grassroots_targets (
  location_id,
  category,
  legacy_source_id,
  name,
  address,
  details
)
SELECT
  location_uuid,
  'drops',
  'drop_group:' || group_key,
  COALESCE(business, ''),
  address,
  details
FROM drop_groups
ON CONFLICT DO NOTHING;

WITH source_rows AS (
  SELECT
    l.id AS location_uuid,
    row_data,
    ordinality,
    lower(regexp_replace(trim(COALESCE(row_data->>'business', '')), '\s+', ' ', 'g')) AS business_key,
    lower(regexp_replace(trim(COALESCE(row_data->>'address', '')), '\s+', ' ', 'g')) AS address_key
  FROM public.lite_settings ls
  JOIN public.locations l
    ON l.id::text = ls.location_id
    OR l.slug = ls.location_id
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(ls.setting_value->'drops', '[]'::jsonb)) WITH ORDINALITY AS legacy(row_data, ordinality)
  WHERE ls.setting_key = 'grassroots_tracker'
),
prepared AS (
  SELECT
    sr.location_uuid,
    t.id AS target_id,
    'drops:' || COALESCE(sr.row_data->>'id', sr.ordinality::text) AS legacy_source_id,
    CASE WHEN sr.row_data->>'date' ~ '^\d{4}-\d{2}-\d{2}$' THEN (sr.row_data->>'date')::date ELSE CURRENT_DATE END AS activity_date,
    NULLIF(trim(sr.row_data->>'notes'), '') AS notes,
    NULLIF(trim(sr.row_data->>'whoDidIt'), '') AS created_by_name,
    jsonb_build_object(
      'person_interacted_with', NULLIF(trim(sr.row_data->>'personInteractedWith'), ''),
      'legacy_row', sr.row_data
    ) AS metadata
  FROM source_rows sr
  JOIN public.grassroots_targets t
    ON t.location_id = sr.location_uuid
    AND t.category = 'drops'
    AND t.legacy_source_id = 'drop_group:' || md5(sr.business_key || '|' || sr.address_key)
)
INSERT INTO public.grassroots_activity (
  location_id,
  target_id,
  activity_type,
  activity_date,
  notes,
  created_by_name,
  metadata,
  legacy_source_id
)
SELECT
  location_uuid,
  target_id,
  'drop',
  activity_date,
  COALESCE(notes, ''),
  created_by_name,
  metadata,
  legacy_source_id
FROM prepared
ON CONFLICT DO NOTHING;

WITH legacy_activity AS (
  SELECT
    t.location_id,
    t.id AS target_id,
    t.category,
    t.legacy_source_id || ':activity' AS legacy_source_id,
    COALESCE(t.last_contact_date, t.initial_contact_date, t.event_start_date, CURRENT_DATE) AS activity_date,
    concat_ws(
      E'\n',
      NULLIF('Notes: ' || NULLIF(trim(t.details->'legacy_row'->>'notes'), ''), 'Notes: '),
      NULLIF('Next step: ' || NULLIF(trim(t.details->'legacy_row'->>'nextStep'), ''), 'Next step: ')
    ) AS notes
  FROM public.grassroots_targets t
  WHERE t.legacy_source_id IS NOT NULL
    AND t.category IN ('events', 'corporate_partnerships', 'apartments', 'pet_professional_partnerships')
)
INSERT INTO public.grassroots_activity (
  location_id,
  target_id,
  activity_type,
  activity_date,
  notes,
  metadata,
  legacy_source_id
)
SELECT
  location_id,
  target_id,
  'development',
  activity_date,
  notes,
  jsonb_build_object('backfilled_from_legacy_notes', true),
  legacy_source_id
FROM legacy_activity
WHERE trim(COALESCE(notes, '')) <> ''
ON CONFLICT DO NOTHING;

COMMIT;
