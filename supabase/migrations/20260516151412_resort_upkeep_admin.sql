BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'resort_upkeep_frequency') THEN
    CREATE TYPE public.resort_upkeep_frequency AS ENUM ('monthly', 'quarterly', 'semi_annual', 'annual');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'resort_upkeep_period_status') THEN
    CREATE TYPE public.resort_upkeep_period_status AS ENUM ('open', 'in_progress', 'submitted', 'amending', 'late_submitted');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'resort_upkeep_compliance_status') THEN
    CREATE TYPE public.resort_upkeep_compliance_status AS ENUM ('compliant', 'non_compliant');
  END IF;
END $$;

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'resort-upkeep-attachments',
  'resort-upkeep-attachments',
  false,
  26214400,
  ARRAY[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/heic',
    'image/heif'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE TABLE IF NOT EXISTS public.resort_upkeep_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid REFERENCES public.locations(id) ON DELETE CASCADE,
  module text NOT NULL DEFAULT 'building_maintenance',
  slug text NOT NULL,
  name text NOT NULL,
  frequency public.resort_upkeep_frequency NOT NULL,
  start_month integer NOT NULL DEFAULT 1 CHECK (start_month BETWEEN 1 AND 12),
  description text,
  is_active boolean NOT NULL DEFAULT true,
  active_version_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid,
  created_by_name text,
  updated_by_user_id uuid,
  updated_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT resort_upkeep_templates_location_slug_uidx UNIQUE NULLS NOT DISTINCT (location_id, slug)
);

CREATE TABLE IF NOT EXISTS public.resort_upkeep_template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.resort_upkeep_templates(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived')),
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_file_name text,
  source_file_hash text,
  changelog text,
  published_at timestamptz,
  created_by_user_id uuid,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT resort_upkeep_template_versions_uidx UNIQUE (template_id, version_number),
  CONSTRAINT resort_upkeep_template_versions_items_array CHECK (jsonb_typeof(items) = 'array')
);

ALTER TABLE public.resort_upkeep_templates
  DROP CONSTRAINT IF EXISTS resort_upkeep_templates_active_version_fk;

ALTER TABLE public.resort_upkeep_templates
  ADD CONSTRAINT resort_upkeep_templates_active_version_fk
  FOREIGN KEY (active_version_id)
  REFERENCES public.resort_upkeep_template_versions(id)
  ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.resort_upkeep_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.resort_upkeep_templates(id) ON DELETE RESTRICT,
  template_version_id uuid NOT NULL REFERENCES public.resort_upkeep_template_versions(id) ON DELETE RESTRICT,
  template_slug text NOT NULL,
  frequency public.resort_upkeep_frequency NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  due_date date NOT NULL,
  status public.resort_upkeep_period_status NOT NULL DEFAULT 'open',
  items_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  first_submitted_at timestamptz,
  last_submitted_at timestamptz,
  submitted_by_user_id uuid,
  submitted_by_name text,
  completed_late boolean NOT NULL DEFAULT false,
  revision_number integer NOT NULL DEFAULT 0,
  lock_version integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT resort_upkeep_period_bounds_chk CHECK (period_start <= period_end AND due_date >= period_start),
  CONSTRAINT resort_upkeep_periods_items_array CHECK (jsonb_typeof(items_snapshot) = 'array'),
  CONSTRAINT resort_upkeep_periods_uidx UNIQUE (location_id, template_slug, period_start)
);

CREATE TABLE IF NOT EXISTS public.resort_upkeep_item_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id uuid NOT NULL REFERENCES public.resort_upkeep_periods(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  item_key text NOT NULL,
  checked boolean NOT NULL DEFAULT false,
  notes text NOT NULL DEFAULT '',
  completed_at timestamptz,
  completed_by_user_id uuid,
  completed_by_name text,
  updated_by_user_id uuid,
  updated_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT resort_upkeep_item_states_uidx UNIQUE (period_id, item_key)
);

CREATE TABLE IF NOT EXISTS public.resort_upkeep_vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  business_name text NOT NULL,
  business_address text,
  address_line_1 text,
  address_line_2 text,
  address_city text,
  address_state text,
  address_postal_code text,
  address_country text DEFAULT 'US',
  google_place_id text,
  website text,
  has_contract boolean NOT NULL DEFAULT false,
  contract_effective_start date,
  contract_effective_end date,
  contact_info jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text NOT NULL DEFAULT '',
  is_archived boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  archived_by_user_id uuid,
  archived_by_name text,
  archive_reason text,
  created_by_user_id uuid,
  created_by_name text,
  updated_by_user_id uuid,
  updated_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT resort_upkeep_vendors_contacts_array CHECK (jsonb_typeof(contact_info) = 'array')
);

CREATE TABLE IF NOT EXISTS public.resort_upkeep_vendor_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES public.resort_upkeep_vendors(id) ON DELETE CASCADE,
  log_date date NOT NULL DEFAULT CURRENT_DATE,
  summary text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_by_user_id uuid,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.resort_upkeep_licenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  requirement_name text NOT NULL,
  issuing_organization text,
  contact_info jsonb NOT NULL DEFAULT '[]'::jsonb,
  website_links jsonb NOT NULL DEFAULT '[]'::jsonb,
  status public.resort_upkeep_compliance_status NOT NULL DEFAULT 'non_compliant',
  expiration_date date,
  cadence_months integer CHECK (cadence_months IS NULL OR cadence_months > 0),
  next_expected_date date,
  notes text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  deactivated_at timestamptz,
  deactivated_by_user_id uuid,
  deactivated_by_name text,
  deactivate_reason text,
  created_by_user_id uuid,
  created_by_name text,
  updated_by_user_id uuid,
  updated_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT resort_upkeep_licenses_contacts_array CHECK (jsonb_typeof(contact_info) = 'array'),
  CONSTRAINT resort_upkeep_licenses_links_array CHECK (jsonb_typeof(website_links) = 'array')
);

CREATE TABLE IF NOT EXISTS public.resort_upkeep_license_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  license_id uuid NOT NULL REFERENCES public.resort_upkeep_licenses(id) ON DELETE CASCADE,
  log_date date NOT NULL DEFAULT CURRENT_DATE,
  summary text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  status_snapshot public.resort_upkeep_compliance_status,
  created_by_user_id uuid,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.resort_upkeep_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  attachment_scope text NOT NULL CHECK (
    attachment_scope IN (
      'maintenance_item_photo',
      'maintenance_item_attachment',
      'vendor_contract',
      'vendor_log_attachment',
      'license_evidence',
      'license_log_attachment'
    )
  ),
  period_id uuid REFERENCES public.resort_upkeep_periods(id) ON DELETE CASCADE,
  item_state_id uuid REFERENCES public.resort_upkeep_item_states(id) ON DELETE CASCADE,
  vendor_id uuid REFERENCES public.resort_upkeep_vendors(id) ON DELETE CASCADE,
  vendor_log_id uuid REFERENCES public.resort_upkeep_vendor_logs(id) ON DELETE CASCADE,
  license_id uuid REFERENCES public.resort_upkeep_licenses(id) ON DELETE CASCADE,
  license_log_id uuid REFERENCES public.resort_upkeep_license_logs(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  storage_bucket text NOT NULL DEFAULT 'resort-upkeep-attachments',
  storage_path text NOT NULL,
  mime_type text NOT NULL,
  file_size_bytes bigint NOT NULL CHECK (file_size_bytes > 0),
  uploaded_by_user_id uuid,
  uploaded_by_name text,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by_user_id uuid,
  deleted_by_name text,
  delete_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT resort_upkeep_attachments_storage_uidx UNIQUE (storage_bucket, storage_path)
);

CREATE TABLE IF NOT EXISTS public.resort_upkeep_troubleshooting_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  category text NOT NULL,
  body text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  source_file_name text,
  source_file_hash text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.resort_upkeep_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid REFERENCES public.locations(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid,
  event_type text NOT NULL,
  summary text NOT NULL DEFAULT '',
  actor_user_id uuid,
  actor_name text,
  before_snapshot jsonb,
  after_snapshot jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  event_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS resort_upkeep_periods_location_due_idx
  ON public.resort_upkeep_periods (location_id, due_date, status);

CREATE INDEX IF NOT EXISTS resort_upkeep_item_states_period_idx
  ON public.resort_upkeep_item_states (period_id, item_key);

CREATE INDEX IF NOT EXISTS resort_upkeep_vendors_location_idx
  ON public.resort_upkeep_vendors (location_id, is_archived, business_name);

CREATE INDEX IF NOT EXISTS resort_upkeep_licenses_location_idx
  ON public.resort_upkeep_licenses (location_id, is_active, status, expiration_date);

CREATE INDEX IF NOT EXISTS resort_upkeep_attachments_location_idx
  ON public.resort_upkeep_attachments (location_id, uploaded_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS resort_upkeep_audit_location_idx
  ON public.resort_upkeep_audit_events (location_id, event_at DESC);

CREATE OR REPLACE FUNCTION public.resort_upkeep_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_resort_upkeep_templates_touch ON public.resort_upkeep_templates;
CREATE TRIGGER trg_resort_upkeep_templates_touch
  BEFORE UPDATE ON public.resort_upkeep_templates
  FOR EACH ROW EXECUTE FUNCTION public.resort_upkeep_touch_updated_at();

DROP TRIGGER IF EXISTS trg_resort_upkeep_periods_touch ON public.resort_upkeep_periods;
CREATE TRIGGER trg_resort_upkeep_periods_touch
  BEFORE UPDATE ON public.resort_upkeep_periods
  FOR EACH ROW EXECUTE FUNCTION public.resort_upkeep_touch_updated_at();

DROP TRIGGER IF EXISTS trg_resort_upkeep_item_states_touch ON public.resort_upkeep_item_states;
CREATE TRIGGER trg_resort_upkeep_item_states_touch
  BEFORE UPDATE ON public.resort_upkeep_item_states
  FOR EACH ROW EXECUTE FUNCTION public.resort_upkeep_touch_updated_at();

DROP TRIGGER IF EXISTS trg_resort_upkeep_vendors_touch ON public.resort_upkeep_vendors;
CREATE TRIGGER trg_resort_upkeep_vendors_touch
  BEFORE UPDATE ON public.resort_upkeep_vendors
  FOR EACH ROW EXECUTE FUNCTION public.resort_upkeep_touch_updated_at();

DROP TRIGGER IF EXISTS trg_resort_upkeep_licenses_touch ON public.resort_upkeep_licenses;
CREATE TRIGGER trg_resort_upkeep_licenses_touch
  BEFORE UPDATE ON public.resort_upkeep_licenses
  FOR EACH ROW EXECUTE FUNCTION public.resort_upkeep_touch_updated_at();

DROP TRIGGER IF EXISTS trg_resort_upkeep_articles_touch ON public.resort_upkeep_troubleshooting_articles;
CREATE TRIGGER trg_resort_upkeep_articles_touch
  BEFORE UPDATE ON public.resort_upkeep_troubleshooting_articles
  FOR EACH ROW EXECUTE FUNCTION public.resort_upkeep_touch_updated_at();

CREATE OR REPLACE FUNCTION public.resort_upkeep_audit_row_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_row jsonb := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  v_location_id uuid := NULLIF(v_row->>'location_id', '')::uuid;
  v_actor_name text := COALESCE(NULLIF(v_row->>'updated_by_name', ''), NULLIF(v_row->>'created_by_name', ''), auth.jwt() ->> 'email');
  v_event_type text := lower(TG_OP);
BEGIN
  IF TG_TABLE_NAME = 'resort_upkeep_item_states' AND TG_OP = 'UPDATE' THEN
    IF COALESCE(to_jsonb(OLD), '{}'::jsonb) - 'updated_at' IS NOT DISTINCT FROM COALESCE(to_jsonb(NEW), '{}'::jsonb) - 'updated_at' THEN
      RETURN NEW;
    END IF;
  END IF;

  INSERT INTO public.resort_upkeep_audit_events (
    location_id,
    entity_type,
    entity_id,
    event_type,
    summary,
    actor_user_id,
    actor_name,
    before_snapshot,
    after_snapshot
  )
  VALUES (
    v_location_id,
    TG_TABLE_NAME,
    NULLIF(v_row->>'id', '')::uuid,
    v_event_type,
    TG_TABLE_NAME || ' ' || v_event_type,
    auth.uid(),
    v_actor_name,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_resort_upkeep_vendors_audit ON public.resort_upkeep_vendors;
CREATE TRIGGER trg_resort_upkeep_vendors_audit
  AFTER INSERT OR UPDATE ON public.resort_upkeep_vendors
  FOR EACH ROW EXECUTE FUNCTION public.resort_upkeep_audit_row_change();

DROP TRIGGER IF EXISTS trg_resort_upkeep_vendor_logs_audit ON public.resort_upkeep_vendor_logs;
CREATE TRIGGER trg_resort_upkeep_vendor_logs_audit
  AFTER INSERT OR UPDATE ON public.resort_upkeep_vendor_logs
  FOR EACH ROW EXECUTE FUNCTION public.resort_upkeep_audit_row_change();

DROP TRIGGER IF EXISTS trg_resort_upkeep_licenses_audit ON public.resort_upkeep_licenses;
CREATE TRIGGER trg_resort_upkeep_licenses_audit
  AFTER INSERT OR UPDATE ON public.resort_upkeep_licenses
  FOR EACH ROW EXECUTE FUNCTION public.resort_upkeep_audit_row_change();

DROP TRIGGER IF EXISTS trg_resort_upkeep_license_logs_audit ON public.resort_upkeep_license_logs;
CREATE TRIGGER trg_resort_upkeep_license_logs_audit
  AFTER INSERT OR UPDATE ON public.resort_upkeep_license_logs
  FOR EACH ROW EXECUTE FUNCTION public.resort_upkeep_audit_row_change();

CREATE OR REPLACE FUNCTION public.resort_upkeep_period_bounds(
  p_frequency public.resort_upkeep_frequency,
  p_start_month integer DEFAULT 1,
  p_anchor_date date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  period_start date,
  period_end date,
  due_date date
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_start_month integer := COALESCE(NULLIF(p_start_month, 0), 1);
  v_period_months integer;
  v_cycle_start date;
  v_months_since integer;
BEGIN
  IF v_start_month < 1 OR v_start_month > 12 THEN
    v_start_month := 1;
  END IF;

  v_period_months := CASE p_frequency
    WHEN 'monthly' THEN 1
    WHEN 'quarterly' THEN 3
    WHEN 'semi_annual' THEN 6
    WHEN 'annual' THEN 12
    ELSE 1
  END;

  v_cycle_start := make_date(EXTRACT(YEAR FROM p_anchor_date)::integer, v_start_month, 1);
  IF p_anchor_date < v_cycle_start THEN
    v_cycle_start := make_date((EXTRACT(YEAR FROM p_anchor_date)::integer - 1), v_start_month, 1);
  END IF;

  v_months_since := (
    EXTRACT(YEAR FROM p_anchor_date)::integer * 12 + EXTRACT(MONTH FROM p_anchor_date)::integer
  ) - (
    EXTRACT(YEAR FROM v_cycle_start)::integer * 12 + EXTRACT(MONTH FROM v_cycle_start)::integer
  );

  period_start := (v_cycle_start + ((v_months_since / v_period_months) * v_period_months || ' months')::interval)::date;
  period_end := (period_start + (v_period_months || ' months')::interval - interval '1 day')::date;
  due_date := period_end;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.resort_upkeep_ensure_period(
  p_location_id uuid,
  p_template_slug text,
  p_anchor_date date DEFAULT CURRENT_DATE
)
RETURNS public.resort_upkeep_periods
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_template public.resort_upkeep_templates%ROWTYPE;
  v_version public.resort_upkeep_template_versions%ROWTYPE;
  v_bounds record;
  v_period public.resort_upkeep_periods%ROWTYPE;
BEGIN
  IF p_location_id IS NULL THEN
    RAISE EXCEPTION 'location_id is required' USING ERRCODE = '22023';
  END IF;

  IF NOT public.labor_has_location_access(p_location_id) THEN
    RAISE EXCEPTION 'Not authorized for this location' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_template
  FROM public.resort_upkeep_templates
  WHERE slug = p_template_slug
    AND is_active = true
    AND (location_id = p_location_id OR location_id IS NULL)
  ORDER BY location_id NULLS LAST
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Resort upkeep template % was not found', p_template_slug USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_version
  FROM public.resort_upkeep_template_versions
  WHERE id = v_template.active_version_id
    AND status = 'published';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active template version is missing for %', p_template_slug USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_bounds
  FROM public.resort_upkeep_period_bounds(v_template.frequency, v_template.start_month, COALESCE(p_anchor_date, CURRENT_DATE));

  INSERT INTO public.resort_upkeep_periods (
    location_id,
    template_id,
    template_version_id,
    template_slug,
    frequency,
    period_start,
    period_end,
    due_date,
    items_snapshot
  )
  VALUES (
    p_location_id,
    v_template.id,
    v_version.id,
    v_template.slug,
    v_template.frequency,
    v_bounds.period_start,
    v_bounds.period_end,
    v_bounds.due_date,
    v_version.items
  )
  ON CONFLICT (location_id, template_slug, period_start) DO UPDATE
  SET updated_at = public.resort_upkeep_periods.updated_at
  RETURNING * INTO v_period;

  RETURN v_period;
END;
$$;

CREATE OR REPLACE FUNCTION public.resort_upkeep_period_progress(p_period_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
WITH period_row AS (
  SELECT *
  FROM public.resort_upkeep_periods
  WHERE id = p_period_id
),
items AS (
  SELECT item
  FROM period_row p
  CROSS JOIN LATERAL jsonb_array_elements(p.items_snapshot) item
  WHERE COALESCE((item->>'is_required')::boolean, true) = true
),
states AS (
  SELECT s.*
  FROM public.resort_upkeep_item_states s
  WHERE s.period_id = p_period_id
),
counts AS (
  SELECT
    (SELECT count(*) FROM items)::integer AS total_required,
    (
      SELECT count(*)
      FROM items i
      JOIN states s ON s.item_key = i.item->>'key'
      WHERE s.checked = true
    )::integer AS completed_required
)
SELECT jsonb_build_object(
  'totalRequired', counts.total_required,
  'completedRequired', counts.completed_required,
  'percentComplete', CASE WHEN counts.total_required = 0 THEN 0 ELSE round((counts.completed_required::numeric / counts.total_required::numeric) * 100)::integer END,
  'isComplete', counts.total_required > 0 AND counts.completed_required = counts.total_required
)
FROM counts;
$$;

CREATE OR REPLACE FUNCTION public.resort_upkeep_computed_status(
  p_status public.resort_upkeep_period_status,
  p_due_date date,
  p_period_end date,
  p_progress jsonb,
  p_as_of_date date DEFAULT CURRENT_DATE
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT CASE
  WHEN p_status = 'late_submitted' THEN 'submitted_late'
  WHEN p_status = 'submitted' THEN 'submitted'
  WHEN p_status = 'amending' THEN 'amending'
  WHEN COALESCE((p_progress->>'isComplete')::boolean, false) THEN 'ready_to_submit'
  WHEN COALESCE(p_as_of_date, CURRENT_DATE) > p_due_date THEN 'overdue'
  ELSE 'open'
END;
$$;

CREATE OR REPLACE FUNCTION public.resort_upkeep_save_item_state(
  p_period_id uuid,
  p_item_key text,
  p_checked boolean,
  p_notes text DEFAULT '',
  p_actor_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_period public.resort_upkeep_periods%ROWTYPE;
  v_before public.resort_upkeep_item_states%ROWTYPE;
  v_after public.resort_upkeep_item_states%ROWTYPE;
  v_progress jsonb;
BEGIN
  SELECT *
  INTO v_period
  FROM public.resort_upkeep_periods
  WHERE id = p_period_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Checklist period was not found' USING ERRCODE = '22023';
  END IF;

  IF NOT public.labor_has_location_access(v_period.location_id) THEN
    RAISE EXCEPTION 'Not authorized for this location' USING ERRCODE = '42501';
  END IF;

  IF v_period.status IN ('submitted', 'late_submitted')
    AND CURRENT_DATE > v_period.period_end
  THEN
    RAISE EXCEPTION 'Submitted prior checklist periods are immutable' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_period.items_snapshot) item
    WHERE item->>'key' = p_item_key
  ) THEN
    RAISE EXCEPTION 'Checklist item % is not part of this period', p_item_key USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_before
  FROM public.resort_upkeep_item_states
  WHERE period_id = p_period_id
    AND item_key = p_item_key;

  INSERT INTO public.resort_upkeep_item_states (
    period_id,
    location_id,
    item_key,
    checked,
    notes,
    completed_at,
    completed_by_user_id,
    completed_by_name,
    updated_by_user_id,
    updated_by_name
  )
  VALUES (
    p_period_id,
    v_period.location_id,
    p_item_key,
    COALESCE(p_checked, false),
    COALESCE(p_notes, ''),
    CASE WHEN COALESCE(p_checked, false) THEN now() ELSE NULL END,
    CASE WHEN COALESCE(p_checked, false) THEN auth.uid() ELSE NULL END,
    CASE WHEN COALESCE(p_checked, false) THEN COALESCE(NULLIF(p_actor_name, ''), auth.jwt() ->> 'email') ELSE NULL END,
    auth.uid(),
    COALESCE(NULLIF(p_actor_name, ''), auth.jwt() ->> 'email')
  )
  ON CONFLICT (period_id, item_key) DO UPDATE
  SET
    checked = EXCLUDED.checked,
    notes = EXCLUDED.notes,
    completed_at = CASE WHEN EXCLUDED.checked THEN COALESCE(public.resort_upkeep_item_states.completed_at, EXCLUDED.completed_at, now()) ELSE NULL END,
    completed_by_user_id = CASE WHEN EXCLUDED.checked THEN COALESCE(public.resort_upkeep_item_states.completed_by_user_id, auth.uid()) ELSE NULL END,
    completed_by_name = CASE WHEN EXCLUDED.checked THEN COALESCE(public.resort_upkeep_item_states.completed_by_name, COALESCE(NULLIF(p_actor_name, ''), auth.jwt() ->> 'email')) ELSE NULL END,
    updated_by_user_id = auth.uid(),
    updated_by_name = COALESCE(NULLIF(p_actor_name, ''), auth.jwt() ->> 'email'),
    updated_at = now()
  RETURNING * INTO v_after;

  UPDATE public.resort_upkeep_periods
  SET
    status = CASE
      WHEN status IN ('submitted', 'late_submitted') THEN 'amending'::public.resort_upkeep_period_status
      WHEN status = 'open' THEN 'in_progress'::public.resort_upkeep_period_status
      ELSE status
    END,
    lock_version = lock_version + 1
  WHERE id = p_period_id
  RETURNING * INTO v_period;

  v_progress := public.resort_upkeep_period_progress(p_period_id);

  INSERT INTO public.resort_upkeep_audit_events (
    location_id,
    entity_type,
    entity_id,
    event_type,
    summary,
    actor_user_id,
    actor_name,
    before_snapshot,
    after_snapshot,
    metadata
  )
  VALUES (
    v_period.location_id,
    'resort_upkeep_item_state',
    v_after.id,
    CASE WHEN v_period.status = 'amending' THEN 'post_submit_item_changed' ELSE 'item_changed' END,
    'Checklist item updated',
    auth.uid(),
    COALESCE(NULLIF(p_actor_name, ''), auth.jwt() ->> 'email'),
    CASE WHEN v_before.id IS NULL THEN NULL ELSE to_jsonb(v_before) END,
    to_jsonb(v_after),
    jsonb_build_object('period_id', p_period_id, 'item_key', p_item_key, 'progress', v_progress)
  );

  RETURN jsonb_build_object(
    'period', to_jsonb(v_period),
    'itemState', to_jsonb(v_after),
    'progress', v_progress,
    'computedStatus', public.resort_upkeep_computed_status(v_period.status, v_period.due_date, v_period.period_end, v_progress, CURRENT_DATE)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.resort_upkeep_submit_period(
  p_period_id uuid,
  p_actor_name text DEFAULT NULL,
  p_note text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_period public.resort_upkeep_periods%ROWTYPE;
  v_before public.resort_upkeep_periods%ROWTYPE;
  v_progress jsonb;
  v_status public.resort_upkeep_period_status;
BEGIN
  SELECT *
  INTO v_period
  FROM public.resort_upkeep_periods
  WHERE id = p_period_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Checklist period was not found' USING ERRCODE = '22023';
  END IF;

  IF NOT public.labor_has_location_access(v_period.location_id) THEN
    RAISE EXCEPTION 'Not authorized for this location' USING ERRCODE = '42501';
  END IF;

  v_progress := public.resort_upkeep_period_progress(p_period_id);
  IF NOT COALESCE((v_progress->>'isComplete')::boolean, false) THEN
    RAISE EXCEPTION 'Checklist cannot be submitted until all required items are complete' USING ERRCODE = '22023';
  END IF;

  v_before := v_period;
  v_status := CASE WHEN CURRENT_DATE > v_period.due_date THEN 'late_submitted'::public.resort_upkeep_period_status ELSE 'submitted'::public.resort_upkeep_period_status END;

  UPDATE public.resort_upkeep_periods
  SET
    status = v_status,
    first_submitted_at = COALESCE(first_submitted_at, now()),
    last_submitted_at = now(),
    submitted_by_user_id = auth.uid(),
    submitted_by_name = COALESCE(NULLIF(p_actor_name, ''), auth.jwt() ->> 'email'),
    completed_late = completed_late OR CURRENT_DATE > due_date,
    revision_number = revision_number + 1,
    lock_version = lock_version + 1,
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('last_submit_note', COALESCE(p_note, ''))
  WHERE id = p_period_id
  RETURNING * INTO v_period;

  INSERT INTO public.resort_upkeep_audit_events (
    location_id,
    entity_type,
    entity_id,
    event_type,
    summary,
    actor_user_id,
    actor_name,
    before_snapshot,
    after_snapshot,
    metadata
  )
  VALUES (
    v_period.location_id,
    'resort_upkeep_period',
    v_period.id,
    CASE WHEN v_period.revision_number > 1 THEN 'period_resubmitted' ELSE 'period_submitted' END,
    CASE WHEN v_status = 'late_submitted' THEN 'Checklist submitted late' ELSE 'Checklist submitted' END,
    auth.uid(),
    COALESCE(NULLIF(p_actor_name, ''), auth.jwt() ->> 'email'),
    to_jsonb(v_before),
    to_jsonb(v_period),
    jsonb_build_object('progress', v_progress, 'note', COALESCE(p_note, ''))
  );

  RETURN jsonb_build_object(
    'period', to_jsonb(v_period),
    'progress', v_progress,
    'computedStatus', public.resort_upkeep_computed_status(v_period.status, v_period.due_date, v_period.period_end, v_progress, CURRENT_DATE)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.resort_upkeep_reopen_period(
  p_period_id uuid,
  p_reason text,
  p_actor_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_before public.resort_upkeep_periods%ROWTYPE;
  v_after public.resort_upkeep_periods%ROWTYPE;
  v_progress jsonb;
BEGIN
  SELECT *
  INTO v_before
  FROM public.resort_upkeep_periods
  WHERE id = p_period_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Checklist period was not found' USING ERRCODE = '22023';
  END IF;

  IF NOT public.labor_has_management_access(v_before.location_id) THEN
    RAISE EXCEPTION 'Not authorized to reopen this checklist' USING ERRCODE = '42501';
  END IF;

  IF trim(COALESCE(p_reason, '')) = '' THEN
    RAISE EXCEPTION 'A reopen reason is required' USING ERRCODE = '22023';
  END IF;

  IF v_before.status NOT IN ('submitted', 'late_submitted') THEN
    RAISE EXCEPTION 'Only submitted checklist periods can be reopened' USING ERRCODE = '22023';
  END IF;

  IF CURRENT_DATE > v_before.period_end THEN
    RAISE EXCEPTION 'Submitted prior checklist periods are immutable' USING ERRCODE = '42501';
  END IF;

  UPDATE public.resort_upkeep_periods
  SET
    status = 'amending',
    lock_version = lock_version + 1,
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('last_reopen_reason', trim(p_reason))
  WHERE id = p_period_id
  RETURNING * INTO v_after;

  v_progress := public.resort_upkeep_period_progress(p_period_id);

  INSERT INTO public.resort_upkeep_audit_events (
    location_id,
    entity_type,
    entity_id,
    event_type,
    summary,
    actor_user_id,
    actor_name,
    before_snapshot,
    after_snapshot,
    metadata
  )
  VALUES (
    v_after.location_id,
    'resort_upkeep_period',
    v_after.id,
    'period_reopened',
    'Checklist reopened for edits',
    auth.uid(),
    COALESCE(NULLIF(p_actor_name, ''), auth.jwt() ->> 'email'),
    to_jsonb(v_before),
    to_jsonb(v_after),
    jsonb_build_object('reason', trim(p_reason), 'progress', v_progress)
  );

  RETURN jsonb_build_object(
    'period', to_jsonb(v_after),
    'progress', v_progress,
    'computedStatus', public.resort_upkeep_computed_status(v_after.status, v_after.due_date, v_after.period_end, v_progress, CURRENT_DATE)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.resort_upkeep_get_period_snapshot(p_period_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
WITH period_row AS (
  SELECT p.*, t.name AS template_name
  FROM public.resort_upkeep_periods p
  JOIN public.resort_upkeep_templates t ON t.id = p.template_id
  WHERE p.id = p_period_id
    AND public.labor_has_location_access(p.location_id)
),
progress AS (
  SELECT public.resort_upkeep_period_progress(p_period_id) AS value
)
SELECT jsonb_build_object(
  'period', to_jsonb(p),
  'progress', pr.value,
  'computedStatus', public.resort_upkeep_computed_status(p.status, p.due_date, p.period_end, pr.value, CURRENT_DATE),
  'items', COALESCE((
    SELECT jsonb_agg(
      item
      || jsonb_build_object(
        'state', CASE WHEN s.id IS NULL THEN NULL ELSE to_jsonb(s) END,
        'attachments', COALESCE((
          SELECT jsonb_agg(to_jsonb(a) ORDER BY a.uploaded_at DESC)
          FROM public.resort_upkeep_attachments a
          WHERE a.item_state_id = s.id
            AND a.deleted_at IS NULL
        ), '[]'::jsonb)
      )
      ORDER BY COALESCE((item->>'sort_order')::integer, 0)
    )
    FROM jsonb_array_elements(p.items_snapshot) item
    LEFT JOIN public.resort_upkeep_item_states s
      ON s.period_id = p.id
     AND s.item_key = item->>'key'
  ), '[]'::jsonb)
)
FROM period_row p
CROSS JOIN progress pr;
$$;

CREATE OR REPLACE FUNCTION public.resort_upkeep_get_dashboard(
  p_location_id uuid,
  p_as_of_date date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_template record;
  v_dashboard jsonb;
BEGIN
  IF p_location_id IS NULL THEN
    RAISE EXCEPTION 'location_id is required' USING ERRCODE = '22023';
  END IF;

  IF NOT public.labor_has_location_access(p_location_id) THEN
    RAISE EXCEPTION 'Not authorized for this location' USING ERRCODE = '42501';
  END IF;

  FOR v_template IN
    SELECT slug
    FROM public.resort_upkeep_templates
    WHERE module = 'building_maintenance'
      AND is_active = true
      AND (location_id = p_location_id OR location_id IS NULL)
    ORDER BY location_id NULLS LAST, slug
  LOOP
    PERFORM public.resort_upkeep_ensure_period(p_location_id, v_template.slug, COALESCE(p_as_of_date, CURRENT_DATE));
  END LOOP;

  WITH maintenance AS (
    SELECT
      p.*,
      t.name AS template_name,
      public.resort_upkeep_period_progress(p.id) AS progress
    FROM public.resort_upkeep_periods p
    JOIN public.resort_upkeep_templates t ON t.id = p.template_id
    WHERE p.location_id = p_location_id
      AND p.period_start <= COALESCE(p_as_of_date, CURRENT_DATE)
      AND p.period_end >= COALESCE(p_as_of_date, CURRENT_DATE)
    ORDER BY p.due_date, p.template_slug
  ),
  vendor_counts AS (
    SELECT
      count(*) FILTER (WHERE is_archived = false)::integer AS active,
      count(*) FILTER (WHERE is_archived = true)::integer AS archived
    FROM public.resort_upkeep_vendors
    WHERE location_id = p_location_id
  ),
  license_counts AS (
    SELECT
      count(*) FILTER (WHERE is_active = true)::integer AS active,
      count(*) FILTER (WHERE is_active = true AND status = 'non_compliant')::integer AS non_compliant,
      count(*) FILTER (WHERE is_active = true AND expiration_date IS NOT NULL AND expiration_date <= COALESCE(p_as_of_date, CURRENT_DATE) + 45)::integer AS expiring_soon
    FROM public.resort_upkeep_licenses
    WHERE location_id = p_location_id
  )
  SELECT jsonb_build_object(
    'maintenance', COALESCE((
      SELECT jsonb_agg(
        to_jsonb(maintenance)
        || jsonb_build_object(
          'computed_status',
          public.resort_upkeep_computed_status(maintenance.status, maintenance.due_date, maintenance.period_end, maintenance.progress, COALESCE(p_as_of_date, CURRENT_DATE))
        )
      )
      FROM maintenance
    ), '[]'::jsonb),
    'vendors', to_jsonb((SELECT vendor_counts FROM vendor_counts)),
    'licenses', to_jsonb((SELECT license_counts FROM license_counts)),
    'troubleshooting', COALESCE((
      SELECT jsonb_agg(to_jsonb(a) ORDER BY a.sort_order, a.title)
      FROM public.resort_upkeep_troubleshooting_articles a
      WHERE a.is_active = true
    ), '[]'::jsonb)
  )
  INTO v_dashboard;

  RETURN v_dashboard;
END;
$$;

CREATE OR REPLACE FUNCTION public.resort_upkeep_publish_template_version(
  p_template_id uuid,
  p_location_id uuid,
  p_items jsonb,
  p_changelog text DEFAULT '',
  p_actor_name text DEFAULT NULL
)
RETURNS public.resort_upkeep_template_versions
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_source_template public.resort_upkeep_templates%ROWTYPE;
  v_target_template public.resort_upkeep_templates%ROWTYPE;
  v_new_version public.resort_upkeep_template_versions%ROWTYPE;
  v_next_version integer;
BEGIN
  IF p_location_id IS NULL THEN
    RAISE EXCEPTION 'location_id is required' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(COALESCE(p_items, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'items must be a JSON array' USING ERRCODE = '22023';
  END IF;

  IF NOT public.labor_has_management_access(p_location_id) THEN
    RAISE EXCEPTION 'Not authorized to publish this template' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_source_template
  FROM public.resort_upkeep_templates
  WHERE id = p_template_id
    AND module = 'building_maintenance'
    AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template was not found' USING ERRCODE = '22023';
  END IF;

  IF v_source_template.location_id IS NOT NULL AND v_source_template.location_id <> p_location_id THEN
    RAISE EXCEPTION 'Template belongs to a different location' USING ERRCODE = '42501';
  END IF;

  IF v_source_template.location_id IS NULL THEN
    INSERT INTO public.resort_upkeep_templates (
      location_id,
      module,
      slug,
      name,
      frequency,
      start_month,
      description,
      metadata,
      is_active
    )
    VALUES (
      p_location_id,
      v_source_template.module,
      v_source_template.slug,
      v_source_template.name,
      v_source_template.frequency,
      v_source_template.start_month,
      v_source_template.description,
      v_source_template.metadata || jsonb_build_object('derived_from_template_id', v_source_template.id),
      true
    )
    ON CONFLICT (location_id, slug) DO UPDATE
    SET
      name = EXCLUDED.name,
      frequency = EXCLUDED.frequency,
      start_month = EXCLUDED.start_month,
      description = EXCLUDED.description,
      metadata = EXCLUDED.metadata,
      is_active = true,
      updated_at = now()
    RETURNING * INTO v_target_template;
  ELSE
    v_target_template := v_source_template;
  END IF;

  SELECT COALESCE(max(version_number), 0) + 1
  INTO v_next_version
  FROM public.resort_upkeep_template_versions
  WHERE template_id = v_target_template.id;

  INSERT INTO public.resort_upkeep_template_versions (
    template_id,
    version_number,
    status,
    items,
    changelog,
    created_by_user_id,
    created_by_name,
    published_at
  )
  VALUES (
    v_target_template.id,
    v_next_version,
    'published',
    p_items,
    COALESCE(p_changelog, ''),
    auth.uid(),
    COALESCE(NULLIF(p_actor_name, ''), auth.jwt() ->> 'email'),
    now()
  )
  RETURNING * INTO v_new_version;

  UPDATE public.resort_upkeep_templates
  SET active_version_id = v_new_version.id,
      updated_at = now()
  WHERE id = v_target_template.id
  RETURNING * INTO v_target_template;

  UPDATE public.resort_upkeep_periods
  SET
    template_id = v_target_template.id,
    template_version_id = v_new_version.id,
    items_snapshot = p_items,
    updated_at = now()
  WHERE location_id = p_location_id
    AND template_slug = v_target_template.slug
    AND status IN ('open', 'in_progress', 'amending')
    AND first_submitted_at IS NULL;

  INSERT INTO public.resort_upkeep_audit_events (
    location_id,
    entity_type,
    entity_id,
    event_type,
    summary,
    actor_user_id,
    actor_name,
    after_snapshot
  )
  VALUES (
    p_location_id,
    'resort_upkeep_template_versions',
    v_new_version.id,
    'template_published',
    'Building maintenance template version published',
    auth.uid(),
    COALESCE(NULLIF(p_actor_name, ''), auth.jwt() ->> 'email'),
    to_jsonb(v_new_version)
  );

  RETURN v_new_version;
END;
$$;

CREATE OR REPLACE FUNCTION public.resort_upkeep_archive_vendor(
  p_vendor_id uuid,
  p_reason text DEFAULT '',
  p_actor_name text DEFAULT NULL
)
RETURNS public.resort_upkeep_vendors
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_vendor public.resort_upkeep_vendors%ROWTYPE;
BEGIN
  SELECT *
  INTO v_vendor
  FROM public.resort_upkeep_vendors
  WHERE id = p_vendor_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vendor was not found' USING ERRCODE = '22023';
  END IF;

  IF NOT public.labor_has_management_access(v_vendor.location_id) THEN
    RAISE EXCEPTION 'Not authorized to archive this vendor' USING ERRCODE = '42501';
  END IF;

  UPDATE public.resort_upkeep_vendors
  SET
    is_archived = true,
    archived_at = now(),
    archived_by_user_id = auth.uid(),
    archived_by_name = COALESCE(NULLIF(p_actor_name, ''), auth.jwt() ->> 'email'),
    archive_reason = COALESCE(p_reason, ''),
    updated_by_user_id = auth.uid(),
    updated_by_name = COALESCE(NULLIF(p_actor_name, ''), auth.jwt() ->> 'email')
  WHERE id = p_vendor_id
  RETURNING * INTO v_vendor;

  RETURN v_vendor;
END;
$$;

CREATE OR REPLACE FUNCTION public.resort_upkeep_deactivate_license(
  p_license_id uuid,
  p_reason text DEFAULT '',
  p_actor_name text DEFAULT NULL
)
RETURNS public.resort_upkeep_licenses
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_license public.resort_upkeep_licenses%ROWTYPE;
BEGIN
  SELECT *
  INTO v_license
  FROM public.resort_upkeep_licenses
  WHERE id = p_license_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'License was not found' USING ERRCODE = '22023';
  END IF;

  IF NOT public.labor_has_management_access(v_license.location_id) THEN
    RAISE EXCEPTION 'Not authorized to deactivate this license' USING ERRCODE = '42501';
  END IF;

  UPDATE public.resort_upkeep_licenses
  SET
    is_active = false,
    deactivated_at = now(),
    deactivated_by_user_id = auth.uid(),
    deactivated_by_name = COALESCE(NULLIF(p_actor_name, ''), auth.jwt() ->> 'email'),
    deactivate_reason = COALESCE(p_reason, ''),
    updated_by_user_id = auth.uid(),
    updated_by_name = COALESCE(NULLIF(p_actor_name, ''), auth.jwt() ->> 'email')
  WHERE id = p_license_id
  RETURNING * INTO v_license;

  RETURN v_license;
END;
$$;

ALTER TABLE public.resort_upkeep_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resort_upkeep_template_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resort_upkeep_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resort_upkeep_item_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resort_upkeep_vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resort_upkeep_vendor_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resort_upkeep_licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resort_upkeep_license_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resort_upkeep_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resort_upkeep_troubleshooting_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resort_upkeep_audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS resort_upkeep_templates_read ON public.resort_upkeep_templates;
CREATE POLICY resort_upkeep_templates_read ON public.resort_upkeep_templates
  FOR SELECT TO authenticated
  USING (location_id IS NULL OR public.labor_has_location_access(location_id));

DROP POLICY IF EXISTS resort_upkeep_templates_write ON public.resort_upkeep_templates;
CREATE POLICY resort_upkeep_templates_write ON public.resort_upkeep_templates
  FOR ALL TO authenticated
  USING (
    (location_id IS NOT NULL AND public.labor_has_management_access(location_id))
    OR EXISTS (SELECT 1 FROM public.lite_profiles lp WHERE lp.user_id = auth.uid() AND lp.role::text IN ('owner', 'enterprise_admin', 'developer', 'multi_location_admin'))
  )
  WITH CHECK (
    (location_id IS NOT NULL AND public.labor_has_management_access(location_id))
    OR EXISTS (SELECT 1 FROM public.lite_profiles lp WHERE lp.user_id = auth.uid() AND lp.role::text IN ('owner', 'enterprise_admin', 'developer', 'multi_location_admin'))
  );

DROP POLICY IF EXISTS resort_upkeep_template_versions_read ON public.resort_upkeep_template_versions;
CREATE POLICY resort_upkeep_template_versions_read ON public.resort_upkeep_template_versions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.resort_upkeep_templates t
      WHERE t.id = template_id
        AND (t.location_id IS NULL OR public.labor_has_location_access(t.location_id))
    )
  );

DROP POLICY IF EXISTS resort_upkeep_template_versions_write ON public.resort_upkeep_template_versions;
CREATE POLICY resort_upkeep_template_versions_write ON public.resort_upkeep_template_versions
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.resort_upkeep_templates t
      WHERE t.id = template_id
        AND (
          (t.location_id IS NOT NULL AND public.labor_has_management_access(t.location_id))
          OR EXISTS (SELECT 1 FROM public.lite_profiles lp WHERE lp.user_id = auth.uid() AND lp.role::text IN ('owner', 'enterprise_admin', 'developer', 'multi_location_admin'))
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.resort_upkeep_templates t
      WHERE t.id = template_id
        AND (
          (t.location_id IS NOT NULL AND public.labor_has_management_access(t.location_id))
          OR EXISTS (SELECT 1 FROM public.lite_profiles lp WHERE lp.user_id = auth.uid() AND lp.role::text IN ('owner', 'enterprise_admin', 'developer', 'multi_location_admin'))
        )
    )
  );

DROP POLICY IF EXISTS resort_upkeep_periods_read ON public.resort_upkeep_periods;
CREATE POLICY resort_upkeep_periods_read ON public.resort_upkeep_periods
  FOR SELECT TO authenticated
  USING (public.labor_has_location_access(location_id));

DROP POLICY IF EXISTS resort_upkeep_periods_insert ON public.resort_upkeep_periods;
CREATE POLICY resort_upkeep_periods_insert ON public.resort_upkeep_periods
  FOR INSERT TO authenticated
  WITH CHECK (public.labor_has_location_access(location_id));

DROP POLICY IF EXISTS resort_upkeep_periods_update ON public.resort_upkeep_periods;
CREATE POLICY resort_upkeep_periods_update ON public.resort_upkeep_periods
  FOR UPDATE TO authenticated
  USING (public.labor_has_location_access(location_id))
  WITH CHECK (public.labor_has_location_access(location_id));

DROP POLICY IF EXISTS resort_upkeep_item_states_read ON public.resort_upkeep_item_states;
CREATE POLICY resort_upkeep_item_states_read ON public.resort_upkeep_item_states
  FOR SELECT TO authenticated
  USING (public.labor_has_location_access(location_id));

DROP POLICY IF EXISTS resort_upkeep_item_states_write ON public.resort_upkeep_item_states;
CREATE POLICY resort_upkeep_item_states_write ON public.resort_upkeep_item_states
  FOR INSERT TO authenticated
  WITH CHECK (
    public.labor_has_location_access(location_id)
    AND EXISTS (
      SELECT 1
      FROM public.resort_upkeep_periods p
      WHERE p.id = period_id
        AND p.location_id = location_id
    )
  );

DROP POLICY IF EXISTS resort_upkeep_item_states_update ON public.resort_upkeep_item_states;
CREATE POLICY resort_upkeep_item_states_update ON public.resort_upkeep_item_states
  FOR UPDATE TO authenticated
  USING (public.labor_has_location_access(location_id))
  WITH CHECK (public.labor_has_location_access(location_id));

DROP POLICY IF EXISTS resort_upkeep_vendors_read ON public.resort_upkeep_vendors;
CREATE POLICY resort_upkeep_vendors_read ON public.resort_upkeep_vendors
  FOR SELECT TO authenticated
  USING (public.labor_has_location_access(location_id));

DROP POLICY IF EXISTS resort_upkeep_vendors_write ON public.resort_upkeep_vendors;
CREATE POLICY resort_upkeep_vendors_write ON public.resort_upkeep_vendors
  FOR INSERT TO authenticated
  WITH CHECK (public.labor_has_management_access(location_id));

DROP POLICY IF EXISTS resort_upkeep_vendors_update ON public.resort_upkeep_vendors;
CREATE POLICY resort_upkeep_vendors_update ON public.resort_upkeep_vendors
  FOR UPDATE TO authenticated
  USING (public.labor_has_management_access(location_id))
  WITH CHECK (public.labor_has_management_access(location_id));

DROP POLICY IF EXISTS resort_upkeep_vendor_logs_read ON public.resort_upkeep_vendor_logs;
CREATE POLICY resort_upkeep_vendor_logs_read ON public.resort_upkeep_vendor_logs
  FOR SELECT TO authenticated
  USING (public.labor_has_location_access(location_id));

DROP POLICY IF EXISTS resort_upkeep_vendor_logs_write ON public.resort_upkeep_vendor_logs;
CREATE POLICY resort_upkeep_vendor_logs_write ON public.resort_upkeep_vendor_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    public.labor_has_management_access(location_id)
    AND EXISTS (
      SELECT 1
      FROM public.resort_upkeep_vendors v
      WHERE v.id = vendor_id
        AND v.location_id = location_id
    )
  );

DROP POLICY IF EXISTS resort_upkeep_licenses_read ON public.resort_upkeep_licenses;
CREATE POLICY resort_upkeep_licenses_read ON public.resort_upkeep_licenses
  FOR SELECT TO authenticated
  USING (public.labor_has_location_access(location_id));

DROP POLICY IF EXISTS resort_upkeep_licenses_write ON public.resort_upkeep_licenses;
CREATE POLICY resort_upkeep_licenses_write ON public.resort_upkeep_licenses
  FOR INSERT TO authenticated
  WITH CHECK (public.labor_has_management_access(location_id));

DROP POLICY IF EXISTS resort_upkeep_licenses_update ON public.resort_upkeep_licenses;
CREATE POLICY resort_upkeep_licenses_update ON public.resort_upkeep_licenses
  FOR UPDATE TO authenticated
  USING (public.labor_has_management_access(location_id))
  WITH CHECK (public.labor_has_management_access(location_id));

DROP POLICY IF EXISTS resort_upkeep_license_logs_read ON public.resort_upkeep_license_logs;
CREATE POLICY resort_upkeep_license_logs_read ON public.resort_upkeep_license_logs
  FOR SELECT TO authenticated
  USING (public.labor_has_location_access(location_id));

DROP POLICY IF EXISTS resort_upkeep_license_logs_write ON public.resort_upkeep_license_logs;
CREATE POLICY resort_upkeep_license_logs_write ON public.resort_upkeep_license_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    public.labor_has_management_access(location_id)
    AND EXISTS (
      SELECT 1
      FROM public.resort_upkeep_licenses l
      WHERE l.id = license_id
        AND l.location_id = location_id
    )
  );

DROP POLICY IF EXISTS resort_upkeep_attachments_read ON public.resort_upkeep_attachments;
CREATE POLICY resort_upkeep_attachments_read ON public.resort_upkeep_attachments
  FOR SELECT TO authenticated
  USING (public.labor_has_location_access(location_id));

DROP POLICY IF EXISTS resort_upkeep_attachments_insert ON public.resort_upkeep_attachments;
CREATE POLICY resort_upkeep_attachments_insert ON public.resort_upkeep_attachments
  FOR INSERT TO authenticated
  WITH CHECK (public.labor_has_location_access(location_id));

DROP POLICY IF EXISTS resort_upkeep_attachments_update ON public.resort_upkeep_attachments;
CREATE POLICY resort_upkeep_attachments_update ON public.resort_upkeep_attachments
  FOR UPDATE TO authenticated
  USING (public.labor_has_management_access(location_id))
  WITH CHECK (public.labor_has_management_access(location_id));

DROP POLICY IF EXISTS resort_upkeep_articles_read ON public.resort_upkeep_troubleshooting_articles;
CREATE POLICY resort_upkeep_articles_read ON public.resort_upkeep_troubleshooting_articles
  FOR SELECT TO authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS resort_upkeep_articles_write ON public.resort_upkeep_troubleshooting_articles;
CREATE POLICY resort_upkeep_articles_write ON public.resort_upkeep_troubleshooting_articles
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.lite_profiles lp WHERE lp.user_id = auth.uid() AND lp.role::text IN ('owner', 'enterprise_admin', 'developer', 'multi_location_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.lite_profiles lp WHERE lp.user_id = auth.uid() AND lp.role::text IN ('owner', 'enterprise_admin', 'developer', 'multi_location_admin')));

DROP POLICY IF EXISTS resort_upkeep_audit_events_read ON public.resort_upkeep_audit_events;
CREATE POLICY resort_upkeep_audit_events_read ON public.resort_upkeep_audit_events
  FOR SELECT TO authenticated
  USING (location_id IS NULL OR public.labor_has_location_access(location_id));

DROP POLICY IF EXISTS resort_upkeep_audit_events_insert ON public.resort_upkeep_audit_events;
CREATE POLICY resort_upkeep_audit_events_insert ON public.resort_upkeep_audit_events
  FOR INSERT TO authenticated
  WITH CHECK (location_id IS NULL OR public.labor_has_location_access(location_id));

GRANT SELECT, INSERT, UPDATE ON public.resort_upkeep_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.resort_upkeep_template_versions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.resort_upkeep_periods TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.resort_upkeep_item_states TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.resort_upkeep_vendors TO authenticated;
GRANT SELECT, INSERT ON public.resort_upkeep_vendor_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.resort_upkeep_licenses TO authenticated;
GRANT SELECT, INSERT ON public.resort_upkeep_license_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.resort_upkeep_attachments TO authenticated;
GRANT SELECT ON public.resort_upkeep_troubleshooting_articles TO authenticated;
GRANT SELECT, INSERT ON public.resort_upkeep_audit_events TO authenticated;

GRANT EXECUTE ON FUNCTION public.resort_upkeep_period_bounds(public.resort_upkeep_frequency, integer, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resort_upkeep_ensure_period(uuid, text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resort_upkeep_period_progress(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resort_upkeep_computed_status(public.resort_upkeep_period_status, date, date, jsonb, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resort_upkeep_save_item_state(uuid, text, boolean, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resort_upkeep_submit_period(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resort_upkeep_reopen_period(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resort_upkeep_get_period_snapshot(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resort_upkeep_get_dashboard(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resort_upkeep_publish_template_version(uuid, uuid, jsonb, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resort_upkeep_archive_vendor(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resort_upkeep_deactivate_license(uuid, text, text) TO authenticated;

DROP POLICY IF EXISTS resort_upkeep_storage_select ON storage.objects;
CREATE POLICY resort_upkeep_storage_select
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'resort-upkeep-attachments'
    AND array_length(storage.foldername(name), 1) >= 2
    AND CASE
      WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN public.labor_has_location_access(((storage.foldername(name))[1])::uuid)
      ELSE false
    END
  );

DROP POLICY IF EXISTS resort_upkeep_storage_insert ON storage.objects;
CREATE POLICY resort_upkeep_storage_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'resort-upkeep-attachments'
    AND array_length(storage.foldername(name), 1) >= 2
    AND CASE
      WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN public.labor_has_location_access(((storage.foldername(name))[1])::uuid)
      ELSE false
    END
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'resort_upkeep_periods'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.resort_upkeep_periods;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'resort_upkeep_item_states'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.resort_upkeep_item_states;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'resort_upkeep_attachments'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.resort_upkeep_attachments;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'resort_upkeep_vendors'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.resort_upkeep_vendors;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'resort_upkeep_vendor_logs'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.resort_upkeep_vendor_logs;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'resort_upkeep_licenses'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.resort_upkeep_licenses;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'resort_upkeep_license_logs'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.resort_upkeep_license_logs;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'resort_upkeep_audit_events'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.resort_upkeep_audit_events;
    END IF;
  END IF;
END $$;

WITH source_templates AS (
  SELECT *
  FROM (
    VALUES
      (
        'building-maintenance-monthly',
        'Monthly Building Maintenance Checklist',
        'monthly'::public.resort_upkeep_frequency,
        1,
        'Monthly checklist due by the end of each month.',
        'Monthly Building Maintenance Checklist.xlsx',
        '[
          {"key":"monthly-hair-trap","label":"Hair Trap inspection (if applicable) - refer to manufacturer''s suggested maintenance plan. Utilize pump-out service as needed.","sort_order":1,"is_required":true},
          {"key":"monthly-fence-inspection","label":"Fence Inspection: Looking for cracks, structure damage, or weakness in posts. Check close functionality of door hinges and gate closures. Inspect both sides of the fence.","sort_order":2,"is_required":true},
          {"key":"monthly-k9-grass","label":"K9 Grass inspection: look for small pulls or tears that may become a bigger issue.","sort_order":3,"is_required":true},
          {"key":"monthly-light-bulbs","label":"Light bulb inspection - check all interior and exterior lighting for proper functionality.","sort_order":4,"is_required":true},
          {"key":"monthly-room-safety","label":"Inspect each room including daycare for loose screws, loose locks, and sharp materials, corners, etc. This is best performed after closing.","sort_order":5,"is_required":true},
          {"key":"monthly-washer-dryer-vents","label":"Inspect and clean out any clothes washer and dryer vents or filters. The lint filter should be cleaned out with each use. Follow maintenance protocol outlined in owner''s manual.","sort_order":6,"is_required":true},
          {"key":"monthly-ceiling-tiles","label":"Inspect ceiling tiles for dust, sagging, water spots, and misalignment with ceiling grid.","sort_order":7,"is_required":true},
          {"key":"monthly-grout-lines","label":"Inspect grout lines for wear and tear. Repair as needed.","sort_order":8,"is_required":true},
          {"key":"monthly-doors","label":"Inspect all doors in the lobby, manager''s office, tour hall doors, luxury suite, executive rooms, compartments, vestibule, emergency exits, large daycare, small daycare, and private play entrance doors, entrance gates, and fence gates are functioning properly. Inspect door handles. Inspect that all push bars, if applicable, are not locked in the open position. Inspect door closures for the right amount of tension required to open the door. Inspect locks. Inspect doors, trim, and other areas for wear and tear, including rusting, rotting, warping, mold, etc.","sort_order":9,"is_required":true},
          {"key":"monthly-fire-extinguishers-visual","label":"Visually inspect fire extinguishers.","sort_order":10,"is_required":true},
          {"key":"monthly-emergency-lighting","label":"Test emergency lighting.","sort_order":11,"is_required":true},
          {"key":"monthly-scent-air","label":"Confirm Scent Air is functional.","sort_order":12,"is_required":true}
        ]'::jsonb
      ),
      (
        'building-maintenance-quarterly',
        'Quarterly Building Maintenance Checklist',
        'quarterly'::public.resort_upkeep_frequency,
        1,
        'Quarterly checklist due by the end of each quarter.',
        'Quarterly Building Maintenance Checklist.xlsx',
        '[
          {"key":"quarterly-hvac-service","label":"Service RTUs, ERVs, dehumidifiers, and other HVAC components. This should include basics such as filter changes, belt changes, and adjustments to the system. It should also include any manufacturer-suggested maintenance protocols found in the owner''s manual for your particular model units.","sort_order":1,"is_required":true},
          {"key":"quarterly-filter-return-grills","label":"Change filter-backed return grills (if applicable).","sort_order":2,"is_required":true},
          {"key":"quarterly-water-filtration","label":"Water filtration system inspection (if applicable) - change filter according to manufacturer''s requirements.","sort_order":3,"is_required":true},
          {"key":"quarterly-seasonal-contracts","label":"Renew and schedule service for any seasonal service contracts. Landscaping: trim bushes, trim trees, cut grass, replace plants or shrubbery as needed. Snow removal: contract with a local service provider that can plow the parking lot during snowstorms if this service is not included in CAM. Trash removal: confirm the size dumpster you have is appropriate for your trash needs.","sort_order":4,"is_required":true},
          {"key":"quarterly-roof-inspection","label":"Perform roof inspection for any signs of wear and tear. Proactively repair as needed.","sort_order":5,"is_required":true}
        ]'::jsonb
      ),
      (
        'building-maintenance-semi-annual',
        'Semi-Annual Building Maintenance Checklist',
        'semi_annual'::public.resort_upkeep_frequency,
        1,
        'Semi-annual checklist defaulting to January-June and July-December. Start month is configurable by template.',
        'Semi-Annual Building Maintenance Checklist.xlsx',
        '[
          {"key":"semiannual-gutters","label":"Clean gutters (Spring and Fall).","sort_order":1,"is_required":true},
          {"key":"semiannual-paint-touchups","label":"Paint touch-ups (Spring and Fall) - this could include spackling deep scratches, painting marked or chipped areas, and replacing trim pieces.","sort_order":2,"is_required":true},
          {"key":"semiannual-caulk","label":"Inspect caulk in dog rooms and daycare. Replace as needed. (Pecora Dynaflex SC)","sort_order":3,"is_required":true}
        ]'::jsonb
      ),
      (
        'building-maintenance-annual',
        'Annual Building Maintenance Checklist',
        'annual'::public.resort_upkeep_frequency,
        1,
        'Annual checklist due by the end of the year by default.',
        'Annual Building Maintenance Checklist.xlsx',
        '[
          {"key":"annual-ductwork-uv-lights","label":"Replacement of UV lights in ductwork or at RTU unit. This is either PetAirapy or Renewaire.","sort_order":1,"is_required":true},
          {"key":"annual-ceiling-uv-lights","label":"Replacement of UV lights in ceiling mounted PetAirapy units.","sort_order":2,"is_required":true},
          {"key":"annual-hvac-ducts","label":"Inspect HVAC ducts for dust build-up and have cleaned/sanitized as needed by an ASCS certified company.","sort_order":3,"is_required":true},
          {"key":"annual-power-wash","label":"Power wash exterior (Spring).","sort_order":4,"is_required":true},
          {"key":"annual-alarm-inspection","label":"ADT or other alarm inspection. Call service provider and ask them to place in test mode. Test alarm, panic buttons, cameras, and anything else tied to the security system.","sort_order":5,"is_required":true},
          {"key":"annual-fire-alarms","label":"Inspect all fire alarms and fire monitoring equipment, including pull stations, fire panel, fire panel battery, smoke detectors, heat detectors, strobes, horns, and tamper valve.","sort_order":6,"is_required":true},
          {"key":"annual-sprinkler-system","label":"Inspect sprinkler system.","sort_order":7,"is_required":true},
          {"key":"annual-fire-extinguishers-professional","label":"Professionally inspect fire extinguishers according to local requirements.","sort_order":8,"is_required":true},
          {"key":"annual-parking-sidewalk","label":"Parking lot and sidewalk inspection (if applicable): look for cracks, holes, and quality of parking lines. Seal as needed. Typically, seal coating is recommended every 3 years to provide adequate pavement protection as well as attractive curb appeal for your commercial property.","sort_order":9,"is_required":true},
          {"key":"annual-masonry-pavers","label":"Inspect exterior masonry/pavers (if applicable) - Spring.","sort_order":10,"is_required":true},
          {"key":"annual-stucco","label":"Inspect exterior surfaces such as stucco and repair as needed with a manufacturer-certified stucco installer. This is also critical to maintaining the manufacturer''s warranty of your stucco.","sort_order":11,"is_required":true},
          {"key":"annual-front-door","label":"Thoroughly inspect front door for scratches, rust, and hinge challenges. Have professionally repainted/restored as needed.","sort_order":12,"is_required":true},
          {"key":"annual-water-heater","label":"Water heater inspection and maintenance/service.","sort_order":13,"is_required":true},
          {"key":"annual-ir-electrical","label":"You may want to consider regular infrared (IR) electrical inspection of your electrical system including panels, switches, disconnects, and motors. This could help identify electrical challenges before an active problem is seen or safety hazard emerges.","sort_order":14,"is_required":true}
        ]'::jsonb
      )
  ) AS rows(slug, name, frequency, start_month, description, source_file_name, items)
),
inserted_templates AS (
  INSERT INTO public.resort_upkeep_templates (
    location_id,
    module,
    slug,
    name,
    frequency,
    start_month,
    description,
    metadata
  )
  SELECT
    NULL::uuid,
    'building_maintenance',
    slug,
    name,
    frequency,
    start_month,
    description,
    jsonb_build_object('source_file_name', source_file_name)
  FROM source_templates
  ON CONFLICT (location_id, slug) DO UPDATE
  SET
    name = EXCLUDED.name,
    frequency = EXCLUDED.frequency,
    start_month = EXCLUDED.start_month,
    description = EXCLUDED.description,
    metadata = EXCLUDED.metadata,
    is_active = true
  RETURNING *
),
source_versions AS (
  SELECT
    t.id AS template_id,
    st.items,
    st.source_file_name
  FROM inserted_templates t
  JOIN source_templates st ON st.slug = t.slug
),
inserted_versions AS (
  INSERT INTO public.resort_upkeep_template_versions (
    template_id,
    version_number,
    status,
    items,
    source_file_name,
    changelog,
    published_at
  )
  SELECT
    template_id,
    1,
    'published',
    items,
    source_file_name,
    'Initial template seeded from attached building maintenance checklist.',
    now()
  FROM source_versions
  ON CONFLICT (template_id, version_number) DO UPDATE
  SET
    status = 'published',
    items = EXCLUDED.items,
    source_file_name = EXCLUDED.source_file_name,
    changelog = EXCLUDED.changelog,
    published_at = COALESCE(public.resort_upkeep_template_versions.published_at, now())
  RETURNING *
)
UPDATE public.resort_upkeep_templates t
SET active_version_id = v.id
FROM inserted_versions v
WHERE t.id = v.template_id;

INSERT INTO public.resort_upkeep_troubleshooting_articles (
  slug,
  title,
  category,
  body,
  sort_order,
  source_file_name,
  metadata
)
VALUES
  (
    'repair-maintenance-contact',
    'Repair and Maintenance Contact',
    'Contact',
    'If additional guidance is needed, reach out to Mike Williams (CDO). In an emergency or same-day service situation call Mike at 623-261-3294. If it is not an emergency, email Mike at mike.williams@k9resorts.com.',
    1,
    'Trouble Shooting.docx',
    '{"source_paragraphs":[0,1]}'::jsonb
  ),
  (
    'electrical-troubleshooting',
    'Electrical',
    'Electrical',
    'Check whether a GFI outlet has tripped, especially around water. Check the electric panel for a tripped breaker. If an outlet is not working, plug something else into that outlet to test it. If a light fixture is not working, replace bulbs and confirm the switch is on. If lights inside or outside are not turning on, check the set schedule; exterior lights may be on a timer that needs adjustment. For a full power outage, check whether neighboring spaces have power and call the power company for awareness and ETA. If neighbors have power, call the power company to verify the account/status because there may be an invoice issue.',
    2,
    'Trouble Shooting.docx',
    '{"source_paragraphs":[3,4,5,6,7,8,9,10,11]}'::jsonb
  ),
  (
    'plumbing-troubleshooting',
    'Plumbing',
    'Plumbing',
    'For a toilet not flushing, use a plunger multiple times. Confirm water is turned on to the fixture. For a water hose not working, ensure the spigot is turned on. If water is not on to the entire building, confirm the main water line is on using the Resort Emergency Information sheet for valve location. If the valve is on, check with neighboring spaces. If neighbors have water and the valve is on, call the water company using the vendor list phone/account number. Also call the water department to see what they show, including possible invoice issues.',
    3,
    'Trouble Shooting.docx',
    '{"source_paragraphs":[13,14,15,16,17,18,19,20]}'::jsonb
  ),
  (
    'roof-leaks-troubleshooting',
    'Roof Leaks',
    'Roof Leaks',
    'Refer to the Vendor List for the roofer noted. Many times the landlord is responsible for roof repairs. If the landlord is responsible and K9 uses another vendor outside of the landlord vendor, LPHI may face serious financial implications. If landlord-responsible roof leaks damage ceiling tiles, inform the landlord that K9 is requesting replacement of the damaged ceiling tiles.',
    4,
    'Trouble Shooting.docx',
    '{"source_paragraphs":[21,22,23]}'::jsonb
  ),
  (
    'dispatch-guidance',
    'Other Recommendations',
    'Dispatch Guidance',
    'When possible, the GM should hold off requesting a work order for one-off non-urgent issues and wait until a few items can be addressed in one visit. Use this only when the issue is not urgent, will not hinder daily resort activity if delayed, does not pose a health or injury risk to staff or customers, is not temperature related, and is not likely to become larger or more expensive if not corrected soon.',
    5,
    'Trouble Shooting.docx',
    '{"source_paragraphs":[24,25,26,27,28,29]}'::jsonb
  )
ON CONFLICT (slug) DO UPDATE
SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  body = EXCLUDED.body,
  sort_order = EXCLUDED.sort_order,
  source_file_name = EXCLUDED.source_file_name,
  metadata = EXCLUDED.metadata,
  is_active = true,
  updated_at = now();

COMMIT;
