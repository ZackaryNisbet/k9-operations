BEGIN;

-- K9 Operations Enrichment Portal
-- Canonical event records for staff SOP execution and uploaded customer/employee calendar graphics.

CREATE TABLE IF NOT EXISTS public.enrichment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id text NOT NULL,
  legacy_source_id text,
  event_date date NOT NULL,
  title text NOT NULL,
  subtitle text,
  category text NOT NULL DEFAULT 'Weekly Theme',
  focus_area text NOT NULL DEFAULT 'brainwork',
  visual_theme text NOT NULL DEFAULT 'neutral',
  customer_visible boolean NOT NULL DEFAULT true,
  price_cents integer NOT NULL DEFAULT 1500 CHECK (price_cents >= 0),
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('draft', 'planned', 'in_progress', 'complete', 'cancelled', 'archived')),
  summary text,
  sop_details text,
  staff_notes text,
  setup_locations jsonb NOT NULL DEFAULT '[]'::jsonb,
  products jsonb NOT NULL DEFAULT '[]'::jsonb,
  checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
  calendar_note text,
  source_label text,
  created_by_user_id uuid,
  created_by_name text,
  updated_by_user_id uuid,
  updated_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT enrichment_events_title_not_blank CHECK (length(trim(title)) > 0),
  CONSTRAINT enrichment_events_setup_locations_array CHECK (jsonb_typeof(setup_locations) = 'array'),
  CONSTRAINT enrichment_events_products_array CHECK (jsonb_typeof(products) = 'array'),
  CONSTRAINT enrichment_events_checklist_array CHECK (jsonb_typeof(checklist) = 'array')
);

CREATE UNIQUE INDEX IF NOT EXISTS enrichment_events_location_date_title_uidx
  ON public.enrichment_events (location_id, event_date, lower(trim(title)));

CREATE UNIQUE INDEX IF NOT EXISTS enrichment_events_location_legacy_uidx
  ON public.enrichment_events (location_id, legacy_source_id);

CREATE INDEX IF NOT EXISTS enrichment_events_location_month_idx
  ON public.enrichment_events (location_id, event_date, customer_visible, status);

CREATE INDEX IF NOT EXISTS enrichment_events_focus_idx
  ON public.enrichment_events (location_id, focus_area, event_date);

CREATE TABLE IF NOT EXISTS public.enrichment_event_run_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id text NOT NULL,
  event_id uuid REFERENCES public.enrichment_events(id) ON DELETE SET NULL,
  event_date date NOT NULL,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'setup', 'in_progress', 'complete', 'skipped')),
  checklist_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  completed_by_user_id uuid,
  completed_by_name text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT enrichment_run_state_checklist_object CHECK (jsonb_typeof(checklist_state) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS enrichment_event_run_state_event_uidx
  ON public.enrichment_event_run_state (location_id, event_id, event_date)
  WHERE event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS enrichment_event_run_state_location_date_idx
  ON public.enrichment_event_run_state (location_id, event_date, status);

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'enrichment-calendar-graphics',
  'enrichment-calendar-graphics',
  false,
  26214400,
  ARRAY[
    'image/png',
    'image/jpeg',
    'image/webp',
    'application/pdf'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE TABLE IF NOT EXISTS public.enrichment_calendar_graphics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id text NOT NULL,
  month_start date NOT NULL,
  audience text NOT NULL CHECK (audience IN ('customer', 'employee')),
  storage_bucket text NOT NULL DEFAULT 'enrichment-calendar-graphics',
  storage_path text NOT NULL,
  file_name text NOT NULL,
  content_type text NOT NULL,
  file_size_bytes bigint NOT NULL CHECK (file_size_bytes > 0),
  uploaded_by_user_id uuid,
  uploaded_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT enrichment_calendar_graphics_month_start_first CHECK (extract(day from month_start) = 1),
  CONSTRAINT enrichment_calendar_graphics_path_not_blank CHECK (length(trim(storage_path)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS enrichment_calendar_graphics_location_month_audience_uidx
  ON public.enrichment_calendar_graphics (location_id, month_start, audience);

CREATE INDEX IF NOT EXISTS enrichment_calendar_graphics_storage_path_idx
  ON public.enrichment_calendar_graphics (storage_bucket, storage_path);

CREATE OR REPLACE FUNCTION public.update_enrichment_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enrichment_events_updated_at ON public.enrichment_events;
CREATE TRIGGER trg_enrichment_events_updated_at
  BEFORE UPDATE ON public.enrichment_events
  FOR EACH ROW EXECUTE FUNCTION public.update_enrichment_updated_at();

DROP TRIGGER IF EXISTS trg_enrichment_run_state_updated_at ON public.enrichment_event_run_state;
CREATE TRIGGER trg_enrichment_run_state_updated_at
  BEFORE UPDATE ON public.enrichment_event_run_state
  FOR EACH ROW EXECUTE FUNCTION public.update_enrichment_updated_at();

DROP TRIGGER IF EXISTS trg_enrichment_calendar_graphics_updated_at ON public.enrichment_calendar_graphics;
CREATE TRIGGER trg_enrichment_calendar_graphics_updated_at
  BEFORE UPDATE ON public.enrichment_calendar_graphics
  FOR EACH ROW EXECUTE FUNCTION public.update_enrichment_updated_at();

ALTER TABLE public.enrichment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrichment_event_run_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrichment_calendar_graphics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS enrichment_events_select ON public.enrichment_events;
CREATE POLICY enrichment_events_select ON public.enrichment_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.lite_profiles lp
      WHERE lp.user_id = (select auth.uid())
        AND lp.is_active = true
        AND (lp.location_id = enrichment_events.location_id OR lp.role = 'enterprise_admin')
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = (select auth.uid())
        AND p.role IN ('owner', 'role_owner')
    )
  );

DROP POLICY IF EXISTS enrichment_events_insert ON public.enrichment_events;
CREATE POLICY enrichment_events_insert ON public.enrichment_events
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.lite_profiles lp
      WHERE lp.user_id = (select auth.uid())
        AND lp.is_active = true
        AND (lp.location_id = enrichment_events.location_id OR lp.role = 'enterprise_admin')
        AND lp.role IN ('supervisor', 'manager', 'mod', 'location_admin', 'enterprise_admin')
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = (select auth.uid())
        AND p.role IN ('owner', 'role_owner')
    )
  );

DROP POLICY IF EXISTS enrichment_events_update ON public.enrichment_events;
CREATE POLICY enrichment_events_update ON public.enrichment_events
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.lite_profiles lp
      WHERE lp.user_id = (select auth.uid())
        AND lp.is_active = true
        AND (lp.location_id = enrichment_events.location_id OR lp.role = 'enterprise_admin')
        AND lp.role IN ('supervisor', 'manager', 'mod', 'location_admin', 'enterprise_admin')
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = (select auth.uid())
        AND p.role IN ('owner', 'role_owner')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.lite_profiles lp
      WHERE lp.user_id = (select auth.uid())
        AND lp.is_active = true
        AND (lp.location_id = enrichment_events.location_id OR lp.role = 'enterprise_admin')
        AND lp.role IN ('supervisor', 'manager', 'mod', 'location_admin', 'enterprise_admin')
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = (select auth.uid())
        AND p.role IN ('owner', 'role_owner')
    )
  );

DROP POLICY IF EXISTS enrichment_events_delete ON public.enrichment_events;
CREATE POLICY enrichment_events_delete ON public.enrichment_events
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.lite_profiles lp
      WHERE lp.user_id = (select auth.uid())
        AND lp.is_active = true
        AND (lp.location_id = enrichment_events.location_id OR lp.role = 'enterprise_admin')
        AND lp.role IN ('location_admin', 'enterprise_admin')
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = (select auth.uid())
        AND p.role IN ('owner', 'role_owner')
    )
  );

DROP POLICY IF EXISTS enrichment_run_state_select ON public.enrichment_event_run_state;
CREATE POLICY enrichment_run_state_select ON public.enrichment_event_run_state
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.lite_profiles lp
      WHERE lp.user_id = (select auth.uid())
        AND lp.is_active = true
        AND (lp.location_id = enrichment_event_run_state.location_id OR lp.role = 'enterprise_admin')
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = (select auth.uid())
        AND p.role IN ('owner', 'role_owner')
    )
  );

DROP POLICY IF EXISTS enrichment_run_state_insert ON public.enrichment_event_run_state;
CREATE POLICY enrichment_run_state_insert ON public.enrichment_event_run_state
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.lite_profiles lp
      WHERE lp.user_id = (select auth.uid())
        AND lp.is_active = true
        AND (lp.location_id = enrichment_event_run_state.location_id OR lp.role = 'enterprise_admin')
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = (select auth.uid())
        AND p.role IN ('owner', 'role_owner')
    )
  );

DROP POLICY IF EXISTS enrichment_run_state_update ON public.enrichment_event_run_state;
CREATE POLICY enrichment_run_state_update ON public.enrichment_event_run_state
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.lite_profiles lp
      WHERE lp.user_id = (select auth.uid())
        AND lp.is_active = true
        AND (lp.location_id = enrichment_event_run_state.location_id OR lp.role = 'enterprise_admin')
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = (select auth.uid())
        AND p.role IN ('owner', 'role_owner')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.lite_profiles lp
      WHERE lp.user_id = (select auth.uid())
        AND lp.is_active = true
        AND (lp.location_id = enrichment_event_run_state.location_id OR lp.role = 'enterprise_admin')
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = (select auth.uid())
        AND p.role IN ('owner', 'role_owner')
    )
  );

DROP POLICY IF EXISTS enrichment_run_state_delete ON public.enrichment_event_run_state;
CREATE POLICY enrichment_run_state_delete ON public.enrichment_event_run_state
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.lite_profiles lp
      WHERE lp.user_id = (select auth.uid())
        AND lp.is_active = true
        AND (lp.location_id = enrichment_event_run_state.location_id OR lp.role = 'enterprise_admin')
        AND lp.role IN ('manager', 'location_admin', 'enterprise_admin')
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = (select auth.uid())
        AND p.role IN ('owner', 'role_owner')
    )
  );

DROP POLICY IF EXISTS enrichment_calendar_graphics_select ON public.enrichment_calendar_graphics;
CREATE POLICY enrichment_calendar_graphics_select ON public.enrichment_calendar_graphics
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.lite_profiles lp
      WHERE lp.user_id = (select auth.uid())
        AND lp.is_active = true
        AND (lp.location_id = enrichment_calendar_graphics.location_id OR lp.role = 'enterprise_admin')
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = (select auth.uid())
        AND p.role IN ('owner', 'role_owner')
    )
  );

DROP POLICY IF EXISTS enrichment_calendar_graphics_insert ON public.enrichment_calendar_graphics;
CREATE POLICY enrichment_calendar_graphics_insert ON public.enrichment_calendar_graphics
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.lite_profiles lp
      WHERE lp.user_id = (select auth.uid())
        AND lp.is_active = true
        AND (lp.location_id = enrichment_calendar_graphics.location_id OR lp.role = 'enterprise_admin')
        AND lp.role IN ('supervisor', 'manager', 'mod', 'location_admin', 'enterprise_admin')
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = (select auth.uid())
        AND p.role IN ('owner', 'role_owner')
    )
  );

DROP POLICY IF EXISTS enrichment_calendar_graphics_update ON public.enrichment_calendar_graphics;
CREATE POLICY enrichment_calendar_graphics_update ON public.enrichment_calendar_graphics
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.lite_profiles lp
      WHERE lp.user_id = (select auth.uid())
        AND lp.is_active = true
        AND (lp.location_id = enrichment_calendar_graphics.location_id OR lp.role = 'enterprise_admin')
        AND lp.role IN ('supervisor', 'manager', 'mod', 'location_admin', 'enterprise_admin')
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = (select auth.uid())
        AND p.role IN ('owner', 'role_owner')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.lite_profiles lp
      WHERE lp.user_id = (select auth.uid())
        AND lp.is_active = true
        AND (lp.location_id = enrichment_calendar_graphics.location_id OR lp.role = 'enterprise_admin')
        AND lp.role IN ('supervisor', 'manager', 'mod', 'location_admin', 'enterprise_admin')
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = (select auth.uid())
        AND p.role IN ('owner', 'role_owner')
    )
  );

DROP POLICY IF EXISTS enrichment_calendar_graphics_delete ON public.enrichment_calendar_graphics;
CREATE POLICY enrichment_calendar_graphics_delete ON public.enrichment_calendar_graphics
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.lite_profiles lp
      WHERE lp.user_id = (select auth.uid())
        AND lp.is_active = true
        AND (lp.location_id = enrichment_calendar_graphics.location_id OR lp.role = 'enterprise_admin')
        AND lp.role IN ('location_admin', 'enterprise_admin')
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = (select auth.uid())
        AND p.role IN ('owner', 'role_owner')
    )
  );

DROP POLICY IF EXISTS enrichment_calendar_graphics_storage_select ON storage.objects;
CREATE POLICY enrichment_calendar_graphics_storage_select
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'enrichment-calendar-graphics'
    AND array_length(storage.foldername(name), 1) >= 1
    AND (
      EXISTS (
        SELECT 1
        FROM public.lite_profiles lp
        WHERE lp.user_id = (select auth.uid())
          AND lp.is_active = true
          AND ((storage.foldername(name))[1] = lp.location_id OR lp.role = 'enterprise_admin')
      )
      OR EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = (select auth.uid())
          AND p.role IN ('owner', 'role_owner')
      )
    )
  );

DROP POLICY IF EXISTS enrichment_calendar_graphics_storage_insert ON storage.objects;
CREATE POLICY enrichment_calendar_graphics_storage_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'enrichment-calendar-graphics'
    AND array_length(storage.foldername(name), 1) >= 3
    AND (
      EXISTS (
        SELECT 1
        FROM public.lite_profiles lp
        WHERE lp.user_id = (select auth.uid())
          AND lp.is_active = true
          AND ((storage.foldername(name))[1] = lp.location_id OR lp.role = 'enterprise_admin')
          AND lp.role IN ('supervisor', 'manager', 'mod', 'location_admin', 'enterprise_admin')
      )
      OR EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = (select auth.uid())
          AND p.role IN ('owner', 'role_owner')
      )
    )
  );

DROP POLICY IF EXISTS enrichment_calendar_graphics_storage_update ON storage.objects;
CREATE POLICY enrichment_calendar_graphics_storage_update
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'enrichment-calendar-graphics'
    AND array_length(storage.foldername(name), 1) >= 3
    AND (
      EXISTS (
        SELECT 1
        FROM public.lite_profiles lp
        WHERE lp.user_id = (select auth.uid())
          AND lp.is_active = true
          AND ((storage.foldername(name))[1] = lp.location_id OR lp.role = 'enterprise_admin')
          AND lp.role IN ('supervisor', 'manager', 'mod', 'location_admin', 'enterprise_admin')
      )
      OR EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = (select auth.uid())
          AND p.role IN ('owner', 'role_owner')
      )
    )
  )
  WITH CHECK (
    bucket_id = 'enrichment-calendar-graphics'
    AND array_length(storage.foldername(name), 1) >= 3
    AND (
      EXISTS (
        SELECT 1
        FROM public.lite_profiles lp
        WHERE lp.user_id = (select auth.uid())
          AND lp.is_active = true
          AND ((storage.foldername(name))[1] = lp.location_id OR lp.role = 'enterprise_admin')
          AND lp.role IN ('supervisor', 'manager', 'mod', 'location_admin', 'enterprise_admin')
      )
      OR EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = (select auth.uid())
          AND p.role IN ('owner', 'role_owner')
      )
    )
  );

DROP POLICY IF EXISTS enrichment_calendar_graphics_storage_delete ON storage.objects;
CREATE POLICY enrichment_calendar_graphics_storage_delete
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'enrichment-calendar-graphics'
    AND array_length(storage.foldername(name), 1) >= 3
    AND (
      EXISTS (
        SELECT 1
        FROM public.lite_profiles lp
        WHERE lp.user_id = (select auth.uid())
          AND lp.is_active = true
          AND ((storage.foldername(name))[1] = lp.location_id OR lp.role = 'enterprise_admin')
          AND lp.role IN ('location_admin', 'enterprise_admin')
      )
      OR EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = (select auth.uid())
          AND p.role IN ('owner', 'role_owner')
      )
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.enrichment_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.enrichment_event_run_state TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.enrichment_calendar_graphics TO authenticated;

COMMIT;
