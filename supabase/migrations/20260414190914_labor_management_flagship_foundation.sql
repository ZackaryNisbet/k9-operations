-- Labor Management Flagship Foundation
-- Canonical employee domain, roster status rollups, certifications,
-- performance reviews, attendance incidents, and training RPC hardening.

-- ─── Enums ──────────────────────────────────────────────────────────────────

DO $$
BEGIN
  CREATE TYPE labor_employment_status AS ENUM (
    'candidate',
    'active',
    'on_leave',
    'terminated',
    'quit',
    'archived'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE labor_note_type AS ENUM (
    'general',
    'personal',
    'performance',
    'attendance',
    'training',
    'hr'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE labor_visibility_scope AS ENUM (
    'manager_only',
    'location_leadership',
    'training_team',
    'location_all'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE certification_frequency AS ENUM (
    'annual',
    'one_time',
    'custom_days'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE review_cycle AS ENUM (
    '30_day',
    '60_day',
    '90_day',
    'ad_hoc'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE review_instance_status AS ENUM (
    'scheduled',
    'in_progress',
    'completed',
    'cancelled',
    'overdue'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE review_item_type AS ENUM (
    'rating',
    'long_text',
    'short_text'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE attendance_incident_type AS ENUM (
    'tardy',
    'early_release',
    'call_out_2_plus_hours',
    'late_call_out_under_2_hours',
    'no_call_no_show'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE attendance_policy_action_type AS ENUM (
    'verbal_warning',
    'written_warning',
    'final_written_warning',
    'termination',
    'coaching_note'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ─── Helper functions ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.labor_initials(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    NULLIF(
      UPPER(
        array_to_string(
          ARRAY(
            SELECT LEFT(part, 1)
            FROM regexp_split_to_table(trim(COALESCE(p_name, '')), '\s+') AS part
            WHERE part <> ''
            LIMIT 3
          ),
          ''
        )
      ),
      ''
    ),
    'SYS'
  );
$$;

CREATE OR REPLACE FUNCTION public.resolve_labor_location_id(
  p_location_ref text,
  p_actor_user_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_location_ref text := trim(COALESCE(p_location_ref, ''));
  v_location_id uuid;
BEGIN
  IF v_location_ref = '' THEN
    RETURN NULL;
  END IF;

  IF v_location_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN v_location_ref::uuid;
  END IF;

  SELECT id
  INTO v_location_id
  FROM public.locations
  WHERE slug = v_location_ref
  LIMIT 1;

  IF v_location_id IS NULL AND p_actor_user_id IS NOT NULL THEN
    SELECT pl.location_id
    INTO v_location_id
    FROM public.profile_locations pl
    WHERE pl.profile_id = p_actor_user_id
    LIMIT 1;
  END IF;

  RETURN v_location_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.labor_has_location_access(p_location_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.lite_profiles lp
    LEFT JOIN public.locations l
      ON l.slug = lp.location_id
    WHERE lp.user_id = auth.uid()
      AND lp.is_active = true
      AND (
        lp.role = 'enterprise_admin'
        OR l.id = p_location_id
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.labor_has_management_access(p_location_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.lite_profiles lp
    LEFT JOIN public.locations l
      ON l.slug = lp.location_id
    WHERE lp.user_id = auth.uid()
      AND lp.is_active = true
      AND lp.role IN ('supervisor', 'manager', 'location_admin', 'enterprise_admin')
      AND (
        lp.role = 'enterprise_admin'
        OR l.id = p_location_id
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.build_training_template_published_snapshot(
  p_version_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  WITH version_data AS (
    SELECT
      tv.id AS version_id,
      tv.source_seed_key,
      tv.source_packet,
      tv.metadata,
      t.name AS template_name,
      t.template_class,
      t.role_scopes,
      t.slug
    FROM public.training_template_versions tv
    JOIN public.training_templates t
      ON t.id = tv.template_id
    WHERE tv.id = p_version_id
  )
  SELECT jsonb_build_object(
    'template_key', vd.source_seed_key,
    'template_name', vd.template_name,
    'template_class', vd.template_class::text,
    'role_scopes', to_jsonb(vd.role_scopes),
    'source_packet', vd.source_packet,
    'metadata', COALESCE(vd.metadata, '{}'::jsonb),
    'sections', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'section_key', s.section_key,
          'title', s.title,
          'section_type', s.section_type::text,
          'sequence_order', s.sequence_order,
          'day_number', s.day_number,
          'time_block_start', s.time_block_start::text,
          'time_block_end', s.time_block_end::text,
          'time_block_note', s.time_block_note,
          'completion_mode', s.completion_mode::text,
          'instructions', s.instructions,
          'children', COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object(
                'id', cs.id,
                'section_key', cs.section_key,
                'title', cs.title,
                'section_type', cs.section_type::text,
                'sequence_order', cs.sequence_order,
                'instructions', cs.instructions,
                'items', COALESCE((
                  SELECT jsonb_agg(
                    jsonb_build_object(
                      'id', ci.id,
                      'item_key', ci.item_key,
                      'label', ci.label,
                      'description', ci.description,
                      'item_type', ci.item_type::text,
                      'sequence_order', ci.sequence_order,
                      'required', ci.required,
                      'completion_mode', ci.completion_mode::text,
                      'policy_reference', ci.policy_reference
                    )
                    ORDER BY ci.sequence_order
                  )
                  FROM public.training_template_items ci
                  WHERE ci.template_section_id = cs.id
                ), '[]'::jsonb)
              )
              ORDER BY cs.sequence_order
            )
            FROM public.training_template_sections cs
            WHERE cs.parent_section_id = s.id
              AND cs.template_version_id = vd.version_id
          ), '[]'::jsonb),
          'items', COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object(
                'id', di.id,
                'item_key', di.item_key,
                'label', di.label,
                'description', di.description,
                'item_type', di.item_type::text,
                'sequence_order', di.sequence_order,
                'required', di.required,
                'completion_mode', di.completion_mode::text,
                'policy_reference', di.policy_reference
              )
              ORDER BY di.sequence_order
            )
            FROM public.training_template_items di
            WHERE di.template_section_id = s.id
          ), '[]'::jsonb)
        )
        ORDER BY s.sequence_order
      )
      FROM public.training_template_sections s
      WHERE s.template_version_id = vd.version_id
        AND s.parent_section_id IS NULL
    ), '[]'::jsonb)
  )
  FROM version_data vd;
$$;

-- ─── Canonical labor domain ─────────────────────────────────────────────────

CREATE TABLE public.labor_employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
  linked_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  linked_lite_profile_id uuid REFERENCES public.lite_profiles(id) ON DELETE SET NULL,
  full_name text NOT NULL,
  position_title text NOT NULL,
  employment_status labor_employment_status NOT NULL DEFAULT 'active',
  start_date date,
  first_shift_date date,
  end_date date,
  assigned_trainer_user_id uuid,
  assigned_trainer_name text,
  assigned_manager_user_id uuid,
  assigned_manager_name text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid,
  updated_by_user_id uuid
);

CREATE UNIQUE INDEX labor_employees_linked_user_location_unique
  ON public.labor_employees (location_id, linked_user_id)
  WHERE linked_user_id IS NOT NULL;

CREATE INDEX labor_employees_location_status_idx
  ON public.labor_employees (location_id, employment_status, full_name);

CREATE TABLE public.labor_employee_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  labor_employee_id uuid NOT NULL REFERENCES public.labor_employees(id) ON DELETE RESTRICT,
  note_type labor_note_type NOT NULL DEFAULT 'general',
  visibility_scope labor_visibility_scope NOT NULL DEFAULT 'manager_only',
  source_module text NOT NULL DEFAULT 'labor',
  note_text text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX labor_employee_notes_employee_idx
  ON public.labor_employee_notes (labor_employee_id, created_at DESC);

CREATE TABLE public.labor_employee_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  labor_employee_id uuid NOT NULL REFERENCES public.labor_employees(id) ON DELETE RESTRICT,
  document_type text NOT NULL,
  file_name text NOT NULL,
  storage_bucket text,
  storage_path text,
  external_url text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  uploaded_by_user_id uuid,
  uploaded_by_name text,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX labor_employee_documents_employee_idx
  ON public.labor_employee_documents (labor_employee_id, uploaded_at DESC);

-- ─── Certifications ────────────────────────────────────────────────────────

CREATE TABLE public.certification_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  frequency certification_frequency NOT NULL DEFAULT 'annual',
  renewal_interval_days integer,
  reminder_window_days integer NOT NULL DEFAULT 30,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid,
  updated_by_user_id uuid
);

CREATE TABLE public.employee_certifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  labor_employee_id uuid NOT NULL REFERENCES public.labor_employees(id) ON DELETE RESTRICT,
  requirement_id uuid NOT NULL REFERENCES public.certification_requirements(id) ON DELETE RESTRICT,
  completed_on date NOT NULL,
  expires_on date,
  labor_employee_document_id uuid REFERENCES public.labor_employee_documents(id) ON DELETE SET NULL,
  external_document_url text,
  source_note text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid,
  updated_by_user_id uuid
);

CREATE INDEX employee_certifications_employee_idx
  ON public.employee_certifications (labor_employee_id, completed_on DESC);

CREATE INDEX employee_certifications_requirement_idx
  ON public.employee_certifications (requirement_id, expires_on);

-- ─── Reviews ───────────────────────────────────────────────────────────────

CREATE TABLE public.review_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  role_scopes text[] NOT NULL DEFAULT '{}'::text[],
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid,
  updated_by_user_id uuid
);

CREATE TABLE public.review_template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.review_templates(id) ON DELETE RESTRICT,
  version_no integer NOT NULL,
  status training_template_status NOT NULL DEFAULT 'draft',
  is_current boolean NOT NULL DEFAULT false,
  source_document_name text,
  changelog text,
  published_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid,
  published_at timestamptz,
  archived_at timestamptz,
  CONSTRAINT review_template_versions_template_version_unique UNIQUE (template_id, version_no)
);

CREATE UNIQUE INDEX review_template_versions_current_idx
  ON public.review_template_versions (template_id)
  WHERE is_current = true;

CREATE TABLE public.review_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_version_id uuid NOT NULL REFERENCES public.review_template_versions(id) ON DELETE RESTRICT,
  section_key text NOT NULL,
  title text NOT NULL,
  sequence_order integer NOT NULL,
  instructions text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT review_sections_version_key_unique UNIQUE (template_version_id, section_key)
);

CREATE TABLE public.review_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_version_id uuid NOT NULL REFERENCES public.review_template_versions(id) ON DELETE RESTRICT,
  review_section_id uuid NOT NULL REFERENCES public.review_sections(id) ON DELETE RESTRICT,
  item_key text NOT NULL,
  prompt text NOT NULL,
  item_type review_item_type NOT NULL,
  sequence_order integer NOT NULL,
  options jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT review_items_version_key_unique UNIQUE (template_version_id, item_key)
);

CREATE TABLE public.employee_review_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  labor_employee_id uuid NOT NULL REFERENCES public.labor_employees(id) ON DELETE RESTRICT,
  template_id uuid NOT NULL REFERENCES public.review_templates(id) ON DELETE RESTRICT,
  template_version_id uuid NOT NULL REFERENCES public.review_template_versions(id) ON DELETE RESTRICT,
  review_cycle review_cycle NOT NULL DEFAULT 'ad_hoc',
  due_date date,
  completed_at timestamptz,
  status review_instance_status NOT NULL DEFAULT 'scheduled',
  reviewer_user_id uuid,
  reviewer_name text,
  responses_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid,
  updated_by_user_id uuid
);

CREATE INDEX employee_review_instances_employee_idx
  ON public.employee_review_instances (labor_employee_id, review_cycle, due_date);

CREATE TABLE public.employee_review_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_instance_id uuid NOT NULL REFERENCES public.employee_review_instances(id) ON DELETE CASCADE,
  review_item_id uuid NOT NULL REFERENCES public.review_items(id) ON DELETE RESTRICT,
  rating_value text,
  response_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid,
  updated_by_user_id uuid,
  CONSTRAINT employee_review_responses_instance_item_unique UNIQUE (review_instance_id, review_item_id)
);

-- ─── Attendance ────────────────────────────────────────────────────────────

CREATE TABLE public.attendance_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  labor_employee_id uuid NOT NULL REFERENCES public.labor_employees(id) ON DELETE RESTRICT,
  incident_date date NOT NULL,
  incident_type attendance_incident_type NOT NULL,
  detail text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid,
  created_by_name text
);

CREATE INDEX attendance_incidents_employee_idx
  ON public.attendance_incidents (labor_employee_id, incident_date DESC);

CREATE TABLE public.attendance_policy_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  labor_employee_id uuid NOT NULL REFERENCES public.labor_employees(id) ON DELETE RESTRICT,
  incident_id uuid REFERENCES public.attendance_incidents(id) ON DELETE SET NULL,
  action_type attendance_policy_action_type NOT NULL,
  action_date date NOT NULL DEFAULT CURRENT_DATE,
  note_text text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid,
  created_by_name text
);

CREATE INDEX attendance_policy_actions_employee_idx
  ON public.attendance_policy_actions (labor_employee_id, action_date DESC);

-- ─── Source-material catalog ───────────────────────────────────────────────

CREATE TABLE public.labor_source_document_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_file_name text NOT NULL,
  source_path text,
  page_range text,
  document_family text NOT NULL,
  document_class text NOT NULL,
  role_scope text,
  extraction_status text NOT NULL,
  normalized_target text,
  qa_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX labor_source_document_catalog_family_idx
  ON public.labor_source_document_catalog (document_family, role_scope);

-- ─── Training record links to canonical employees ──────────────────────────

ALTER TABLE public.training_records
  ADD COLUMN IF NOT EXISTS labor_employee_id uuid REFERENCES public.labor_employees(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS training_records_labor_employee_idx
  ON public.training_records (labor_employee_id, updated_at DESC);

-- ─── Shared updated_at trigger reuse ───────────────────────────────────────

CREATE TRIGGER trg_labor_employees_updated
  BEFORE UPDATE ON public.labor_employees
  FOR EACH ROW EXECUTE FUNCTION public.training_updated_at_trigger();

CREATE TRIGGER trg_labor_documents_updated
  BEFORE UPDATE ON public.labor_employee_documents
  FOR EACH ROW EXECUTE FUNCTION public.training_updated_at_trigger();

CREATE TRIGGER trg_certification_requirements_updated
  BEFORE UPDATE ON public.certification_requirements
  FOR EACH ROW EXECUTE FUNCTION public.training_updated_at_trigger();

CREATE TRIGGER trg_employee_certifications_updated
  BEFORE UPDATE ON public.employee_certifications
  FOR EACH ROW EXECUTE FUNCTION public.training_updated_at_trigger();

CREATE TRIGGER trg_review_templates_updated
  BEFORE UPDATE ON public.review_templates
  FOR EACH ROW EXECUTE FUNCTION public.training_updated_at_trigger();

CREATE TRIGGER trg_review_instances_updated
  BEFORE UPDATE ON public.employee_review_instances
  FOR EACH ROW EXECUTE FUNCTION public.training_updated_at_trigger();

CREATE TRIGGER trg_review_responses_updated
  BEFORE UPDATE ON public.employee_review_responses
  FOR EACH ROW EXECUTE FUNCTION public.training_updated_at_trigger();

CREATE TRIGGER trg_source_document_catalog_updated
  BEFORE UPDATE ON public.labor_source_document_catalog
  FOR EACH ROW EXECUTE FUNCTION public.training_updated_at_trigger();

-- ─── RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE public.labor_employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labor_employee_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labor_employee_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certification_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_certifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_template_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_review_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_review_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_policy_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labor_source_document_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY labor_employees_read ON public.labor_employees
  FOR SELECT TO authenticated
  USING (public.labor_has_location_access(location_id));

CREATE POLICY labor_employees_write ON public.labor_employees
  FOR ALL TO authenticated
  USING (public.labor_has_management_access(location_id))
  WITH CHECK (public.labor_has_management_access(location_id));

CREATE POLICY labor_employee_notes_read ON public.labor_employee_notes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.labor_employees e
      WHERE e.id = labor_employee_notes.labor_employee_id
        AND public.labor_has_location_access(e.location_id)
        AND (
          labor_employee_notes.visibility_scope <> 'manager_only'
          OR public.labor_has_management_access(e.location_id)
          OR labor_employee_notes.created_by_user_id = auth.uid()
        )
    )
  );

CREATE POLICY labor_employee_notes_write ON public.labor_employee_notes
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.labor_employees e
      WHERE e.id = labor_employee_notes.labor_employee_id
        AND public.labor_has_management_access(e.location_id)
    )
  );

CREATE POLICY labor_employee_documents_read ON public.labor_employee_documents
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.labor_employees e
      WHERE e.id = labor_employee_documents.labor_employee_id
        AND public.labor_has_management_access(e.location_id)
    )
  );

CREATE POLICY labor_employee_documents_write ON public.labor_employee_documents
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.labor_employees e
      WHERE e.id = labor_employee_documents.labor_employee_id
        AND public.labor_has_management_access(e.location_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.labor_employees e
      WHERE e.id = labor_employee_documents.labor_employee_id
        AND public.labor_has_management_access(e.location_id)
    )
  );

CREATE POLICY certification_requirements_read ON public.certification_requirements
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY certification_requirements_write ON public.certification_requirements
  FOR ALL TO authenticated
  USING (
    location_id IS NULL OR public.labor_has_management_access(location_id)
  )
  WITH CHECK (
    location_id IS NULL OR public.labor_has_management_access(location_id)
  );

CREATE POLICY employee_certifications_read ON public.employee_certifications
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.labor_employees e
      WHERE e.id = employee_certifications.labor_employee_id
        AND public.labor_has_management_access(e.location_id)
    )
  );

CREATE POLICY employee_certifications_write ON public.employee_certifications
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.labor_employees e
      WHERE e.id = employee_certifications.labor_employee_id
        AND public.labor_has_management_access(e.location_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.labor_employees e
      WHERE e.id = employee_certifications.labor_employee_id
        AND public.labor_has_management_access(e.location_id)
    )
  );

CREATE POLICY review_templates_read ON public.review_templates
  FOR SELECT TO authenticated
  USING (location_id IS NULL OR public.labor_has_location_access(location_id));

CREATE POLICY review_templates_write ON public.review_templates
  FOR ALL TO authenticated
  USING (location_id IS NULL OR public.labor_has_management_access(location_id))
  WITH CHECK (location_id IS NULL OR public.labor_has_management_access(location_id));

CREATE POLICY review_template_versions_read ON public.review_template_versions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.review_templates t
      WHERE t.id = review_template_versions.template_id
        AND (t.location_id IS NULL OR public.labor_has_location_access(t.location_id))
    )
  );

CREATE POLICY review_template_versions_write ON public.review_template_versions
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.review_templates t
      WHERE t.id = review_template_versions.template_id
        AND (t.location_id IS NULL OR public.labor_has_management_access(t.location_id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.review_templates t
      WHERE t.id = review_template_versions.template_id
        AND (t.location_id IS NULL OR public.labor_has_management_access(t.location_id))
    )
  );

CREATE POLICY review_sections_read ON public.review_sections
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.review_template_versions v
      JOIN public.review_templates t
        ON t.id = v.template_id
      WHERE v.id = review_sections.template_version_id
        AND (t.location_id IS NULL OR public.labor_has_location_access(t.location_id))
    )
  );

CREATE POLICY review_sections_write ON public.review_sections
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.review_template_versions v
      JOIN public.review_templates t
        ON t.id = v.template_id
      WHERE v.id = review_sections.template_version_id
        AND (t.location_id IS NULL OR public.labor_has_management_access(t.location_id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.review_template_versions v
      JOIN public.review_templates t
        ON t.id = v.template_id
      WHERE v.id = review_sections.template_version_id
        AND (t.location_id IS NULL OR public.labor_has_management_access(t.location_id))
    )
  );

CREATE POLICY review_items_read ON public.review_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.review_sections s
      JOIN public.review_template_versions v
        ON v.id = s.template_version_id
      JOIN public.review_templates t
        ON t.id = v.template_id
      WHERE s.id = review_items.review_section_id
        AND (t.location_id IS NULL OR public.labor_has_location_access(t.location_id))
    )
  );

CREATE POLICY review_items_write ON public.review_items
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.review_sections s
      JOIN public.review_template_versions v
        ON v.id = s.template_version_id
      JOIN public.review_templates t
        ON t.id = v.template_id
      WHERE s.id = review_items.review_section_id
        AND (t.location_id IS NULL OR public.labor_has_management_access(t.location_id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.review_sections s
      JOIN public.review_template_versions v
        ON v.id = s.template_version_id
      JOIN public.review_templates t
        ON t.id = v.template_id
      WHERE s.id = review_items.review_section_id
        AND (t.location_id IS NULL OR public.labor_has_management_access(t.location_id))
    )
  );

CREATE POLICY employee_review_instances_read ON public.employee_review_instances
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.labor_employees e
      WHERE e.id = employee_review_instances.labor_employee_id
        AND public.labor_has_management_access(e.location_id)
    )
  );

CREATE POLICY employee_review_instances_write ON public.employee_review_instances
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.labor_employees e
      WHERE e.id = employee_review_instances.labor_employee_id
        AND public.labor_has_management_access(e.location_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.labor_employees e
      WHERE e.id = employee_review_instances.labor_employee_id
        AND public.labor_has_management_access(e.location_id)
    )
  );

CREATE POLICY employee_review_responses_read ON public.employee_review_responses
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.employee_review_instances i
      JOIN public.labor_employees e
        ON e.id = i.labor_employee_id
      WHERE i.id = employee_review_responses.review_instance_id
        AND public.labor_has_management_access(e.location_id)
    )
  );

CREATE POLICY employee_review_responses_write ON public.employee_review_responses
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.employee_review_instances i
      JOIN public.labor_employees e
        ON e.id = i.labor_employee_id
      WHERE i.id = employee_review_responses.review_instance_id
        AND public.labor_has_management_access(e.location_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.employee_review_instances i
      JOIN public.labor_employees e
        ON e.id = i.labor_employee_id
      WHERE i.id = employee_review_responses.review_instance_id
        AND public.labor_has_management_access(e.location_id)
    )
  );

CREATE POLICY attendance_incidents_read ON public.attendance_incidents
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.labor_employees e
      WHERE e.id = attendance_incidents.labor_employee_id
        AND public.labor_has_management_access(e.location_id)
    )
  );

CREATE POLICY attendance_incidents_write ON public.attendance_incidents
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.labor_employees e
      WHERE e.id = attendance_incidents.labor_employee_id
        AND public.labor_has_management_access(e.location_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.labor_employees e
      WHERE e.id = attendance_incidents.labor_employee_id
        AND public.labor_has_management_access(e.location_id)
    )
  );

CREATE POLICY attendance_policy_actions_read ON public.attendance_policy_actions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.labor_employees e
      WHERE e.id = attendance_policy_actions.labor_employee_id
        AND public.labor_has_management_access(e.location_id)
    )
  );

CREATE POLICY attendance_policy_actions_write ON public.attendance_policy_actions
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.labor_employees e
      WHERE e.id = attendance_policy_actions.labor_employee_id
        AND public.labor_has_management_access(e.location_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.labor_employees e
      WHERE e.id = attendance_policy_actions.labor_employee_id
        AND public.labor_has_management_access(e.location_id)
    )
  );

CREATE POLICY labor_source_document_catalog_read ON public.labor_source_document_catalog
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY labor_source_document_catalog_write ON public.labor_source_document_catalog
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- ─── Roster snapshot view / RPC ─────────────────────────────────────────────

CREATE OR REPLACE VIEW public.labor_employee_status_snapshot AS
WITH review_due_dates AS (
  SELECT
    e.id AS labor_employee_id,
    COALESCE(e.first_shift_date, e.start_date) + 30 AS review_30_due_date,
    COALESCE(e.first_shift_date, e.start_date) + 60 AS review_60_due_date,
    COALESCE(e.first_shift_date, e.start_date) + 90 AS review_90_due_date
  FROM public.labor_employees e
),
review_latest AS (
  SELECT DISTINCT ON (i.labor_employee_id, i.review_cycle)
    i.labor_employee_id,
    i.review_cycle,
    i.status,
    i.due_date,
    i.completed_at
  FROM public.employee_review_instances i
  ORDER BY i.labor_employee_id, i.review_cycle, COALESCE(i.completed_at, i.created_at) DESC
),
current_cpr AS (
  SELECT DISTINCT ON (ec.labor_employee_id)
    ec.labor_employee_id,
    ec.completed_on,
    ec.expires_on
  FROM public.employee_certifications ec
  JOIN public.certification_requirements cr
    ON cr.id = ec.requirement_id
  WHERE cr.slug = 'dog_cpr_annual'
  ORDER BY ec.labor_employee_id, ec.completed_on DESC, ec.created_at DESC
),
training_rollup AS (
  SELECT
    tr.labor_employee_id,
    COUNT(*) AS training_record_count,
    COUNT(*) FILTER (WHERE tr.overall_status IN ('not_started', 'in_progress', 'needs_follow_up', 'retest_required')) AS open_training_record_count,
    COUNT(*) FILTER (WHERE tr.overall_status IN ('complete', 'passed')) AS completed_training_record_count,
    MAX(tr.updated_at) AS last_training_updated_at
  FROM public.training_records tr
  WHERE tr.labor_employee_id IS NOT NULL
  GROUP BY tr.labor_employee_id
),
active_training AS (
  SELECT DISTINCT ON (tr.labor_employee_id)
    tr.labor_employee_id,
    tr.id AS active_training_record_id,
    tr.overall_status AS active_training_status,
    tr.progress_percent AS active_training_progress_percent,
    tr.target_end_date AS active_training_target_end_date,
    tr.template_name_snapshot AS active_training_template_name
  FROM public.training_records tr
  WHERE tr.labor_employee_id IS NOT NULL
  ORDER BY tr.labor_employee_id,
    CASE
      WHEN tr.overall_status IN ('not_started', 'in_progress', 'needs_follow_up', 'retest_required') THEN 0
      ELSE 1
    END,
    tr.updated_at DESC
),
attendance_rollup AS (
  SELECT
    ai.labor_employee_id,
    COUNT(*) FILTER (WHERE ai.incident_date >= CURRENT_DATE - 90) AS recent_attendance_incident_count,
    MAX(ai.incident_date) AS last_attendance_incident_at
  FROM public.attendance_incidents ai
  GROUP BY ai.labor_employee_id
)
SELECT
  e.id AS labor_employee_id,
  e.location_id,
  e.linked_user_id,
  e.full_name,
  e.position_title,
  e.employment_status,
  e.start_date,
  e.first_shift_date,
  e.end_date,
  e.assigned_trainer_name,
  e.assigned_manager_name,
  at.active_training_record_id,
  at.active_training_status,
  at.active_training_progress_percent,
  at.active_training_target_end_date,
  at.active_training_template_name,
  COALESCE(tr.training_record_count, 0) AS training_record_count,
  COALESCE(tr.open_training_record_count, 0) AS open_training_record_count,
  COALESCE(tr.completed_training_record_count, 0) AS completed_training_record_count,
  cc.completed_on AS cpr_completed_on,
  cc.expires_on AS cpr_expires_on,
  CASE
    WHEN cc.expires_on IS NULL THEN 'not_started'
    WHEN cc.expires_on < CURRENT_DATE THEN 'expired'
    WHEN cc.expires_on <= CURRENT_DATE + 30 THEN 'due_soon'
    ELSE 'current'
  END AS cpr_status,
  rd.review_30_due_date,
  COALESCE(r30.status::text,
    CASE
      WHEN rd.review_30_due_date IS NULL THEN 'not_started'
      WHEN rd.review_30_due_date < CURRENT_DATE THEN 'overdue'
      ELSE 'scheduled'
    END
  ) AS review_30_status,
  rd.review_60_due_date,
  COALESCE(r60.status::text,
    CASE
      WHEN rd.review_60_due_date IS NULL THEN 'not_started'
      WHEN rd.review_60_due_date < CURRENT_DATE THEN 'overdue'
      ELSE 'scheduled'
    END
  ) AS review_60_status,
  rd.review_90_due_date,
  COALESCE(r90.status::text,
    CASE
      WHEN rd.review_90_due_date IS NULL THEN 'not_started'
      WHEN rd.review_90_due_date < CURRENT_DATE THEN 'overdue'
      ELSE 'scheduled'
    END
  ) AS review_90_status,
  COALESCE(ar.recent_attendance_incident_count, 0) AS recent_attendance_incident_count,
  ar.last_attendance_incident_at
FROM public.labor_employees e
LEFT JOIN review_due_dates rd
  ON rd.labor_employee_id = e.id
LEFT JOIN review_latest r30
  ON r30.labor_employee_id = e.id
 AND r30.review_cycle = '30_day'
LEFT JOIN review_latest r60
  ON r60.labor_employee_id = e.id
 AND r60.review_cycle = '60_day'
LEFT JOIN review_latest r90
  ON r90.labor_employee_id = e.id
 AND r90.review_cycle = '90_day'
LEFT JOIN current_cpr cc
  ON cc.labor_employee_id = e.id
LEFT JOIN training_rollup tr
  ON tr.labor_employee_id = e.id
LEFT JOIN active_training at
  ON at.labor_employee_id = e.id
LEFT JOIN attendance_rollup ar
  ON ar.labor_employee_id = e.id;

GRANT SELECT ON public.labor_employee_status_snapshot TO authenticated;

CREATE OR REPLACE FUNCTION public.get_labor_roster_snapshot(
  p_location_ref text,
  p_actor_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_location_id uuid;
BEGIN
  v_location_id := public.resolve_labor_location_id(p_location_ref, p_actor_user_id);
  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'Unable to resolve location from %', p_location_ref;
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(
      to_jsonb(snapshot)
      ORDER BY
        CASE
          WHEN snapshot.employment_status = 'active' THEN 0
          WHEN snapshot.employment_status = 'candidate' THEN 1
          ELSE 2
        END,
        snapshot.full_name
    )
    FROM public.labor_employee_status_snapshot snapshot
    WHERE snapshot.location_id = v_location_id
  ), '[]'::jsonb);
END;
$$;

-- ─── Labor RPCs ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_labor_employee(
  p_location_ref text,
  p_full_name text,
  p_position_title text,
  p_start_date date DEFAULT NULL,
  p_first_shift_date date DEFAULT NULL,
  p_linked_user_id uuid DEFAULT NULL,
  p_assigned_trainer_name text DEFAULT NULL,
  p_assigned_manager_name text DEFAULT NULL,
  p_actor_user_id uuid DEFAULT NULL,
  p_actor_name text DEFAULT NULL
)
RETURNS public.labor_employees
LANGUAGE plpgsql
AS $$
DECLARE
  v_location_id uuid;
  v_employee public.labor_employees%ROWTYPE;
BEGIN
  v_location_id := public.resolve_labor_location_id(p_location_ref, p_actor_user_id);
  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'Unable to resolve location from %', p_location_ref;
  END IF;

  INSERT INTO public.labor_employees (
    location_id,
    linked_user_id,
    linked_lite_profile_id,
    full_name,
    position_title,
    employment_status,
    start_date,
    first_shift_date,
    assigned_trainer_name,
    assigned_manager_name,
    created_by_user_id,
    updated_by_user_id
  )
  VALUES (
    v_location_id,
    p_linked_user_id,
    (
      SELECT lp.id
      FROM public.lite_profiles lp
      LEFT JOIN public.locations l
        ON l.slug = lp.location_id
      WHERE lp.user_id = p_linked_user_id
        AND (l.id = v_location_id OR lp.role = 'enterprise_admin')
      LIMIT 1
    ),
    trim(COALESCE(p_full_name, '')),
    trim(COALESCE(p_position_title, '')),
    CASE
      WHEN COALESCE(trim(COALESCE(p_full_name, '')), '') = '' THEN 'candidate'
      ELSE 'active'
    END,
    p_start_date,
    p_first_shift_date,
    NULLIF(trim(COALESCE(p_assigned_trainer_name, '')), ''),
    NULLIF(trim(COALESCE(p_assigned_manager_name, '')), ''),
    p_actor_user_id,
    p_actor_user_id
  )
  RETURNING *
  INTO v_employee;

  RETURN v_employee;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_labor_employee(
  p_employee_id uuid,
  p_full_name text DEFAULT NULL,
  p_position_title text DEFAULT NULL,
  p_employment_status labor_employment_status DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_first_shift_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_assigned_trainer_name text DEFAULT NULL,
  p_assigned_manager_name text DEFAULT NULL,
  p_actor_user_id uuid DEFAULT NULL
)
RETURNS public.labor_employees
LANGUAGE plpgsql
AS $$
DECLARE
  v_employee public.labor_employees%ROWTYPE;
BEGIN
  UPDATE public.labor_employees
  SET
    full_name = COALESCE(NULLIF(trim(COALESCE(p_full_name, '')), ''), full_name),
    position_title = COALESCE(NULLIF(trim(COALESCE(p_position_title, '')), ''), position_title),
    employment_status = COALESCE(p_employment_status, employment_status),
    start_date = COALESCE(p_start_date, start_date),
    first_shift_date = COALESCE(p_first_shift_date, first_shift_date),
    end_date = COALESCE(p_end_date, end_date),
    assigned_trainer_name = COALESCE(NULLIF(trim(COALESCE(p_assigned_trainer_name, '')), ''), assigned_trainer_name),
    assigned_manager_name = COALESCE(NULLIF(trim(COALESCE(p_assigned_manager_name, '')), ''), assigned_manager_name),
    updated_by_user_id = COALESCE(p_actor_user_id, updated_by_user_id)
  WHERE id = p_employee_id
  RETURNING *
  INTO v_employee;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Labor employee % not found', p_employee_id;
  END IF;

  RETURN v_employee;
END;
$$;

CREATE OR REPLACE FUNCTION public.append_labor_employee_note(
  p_labor_employee_id uuid,
  p_note_text text,
  p_note_type labor_note_type DEFAULT 'general',
  p_visibility_scope labor_visibility_scope DEFAULT 'manager_only',
  p_source_module text DEFAULT 'labor',
  p_actor_user_id uuid DEFAULT NULL,
  p_actor_name text DEFAULT NULL
)
RETURNS public.labor_employee_notes
LANGUAGE plpgsql
AS $$
DECLARE
  v_employee public.labor_employees%ROWTYPE;
  v_note public.labor_employee_notes%ROWTYPE;
  v_note_text text := trim(COALESCE(p_note_text, ''));
BEGIN
  IF p_labor_employee_id IS NULL THEN
    RAISE EXCEPTION 'Labor employee is required';
  END IF;

  IF v_note_text = '' THEN
    RAISE EXCEPTION 'Note text is required';
  END IF;

  SELECT *
  INTO v_employee
  FROM public.labor_employees
  WHERE id = p_labor_employee_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Labor employee % not found', p_labor_employee_id;
  END IF;

  INSERT INTO public.labor_employee_notes (
    labor_employee_id,
    note_type,
    visibility_scope,
    source_module,
    note_text,
    created_by_user_id,
    created_by_name
  )
  VALUES (
    p_labor_employee_id,
    COALESCE(p_note_type, 'general'),
    COALESCE(p_visibility_scope, 'manager_only'),
    COALESCE(NULLIF(trim(COALESCE(p_source_module, '')), ''), 'labor'),
    v_note_text,
    p_actor_user_id,
    NULLIF(trim(COALESCE(p_actor_name, '')), '')
  )
  RETURNING *
  INTO v_note;

  RETURN v_note;
END;
$$;

-- ─── Training RPCs ──────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.create_training_record(
  uuid,
  text,
  text,
  text,
  date,
  date,
  date,
  text,
  uuid,
  text
);

CREATE OR REPLACE FUNCTION public.create_training_record(
  p_template_id uuid,
  p_location_ref text,
  p_employee_full_name text,
  p_target_role text,
  p_hire_date date DEFAULT NULL,
  p_training_start_date date DEFAULT NULL,
  p_target_end_date date DEFAULT NULL,
  p_assigned_trainer_name text DEFAULT NULL,
  p_actor_user_id uuid DEFAULT NULL,
  p_actor_name text DEFAULT NULL,
  p_assigned_manager_name text DEFAULT NULL,
  p_labor_employee_id uuid DEFAULT NULL
)
RETURNS public.training_records
LANGUAGE plpgsql
AS $$
DECLARE
  v_location_id uuid;
  v_template public.training_templates%ROWTYPE;
  v_version public.training_template_versions%ROWTYPE;
  v_record public.training_records%ROWTYPE;
  v_required_item_count integer := 0;
  v_employee_full_name text := trim(COALESCE(p_employee_full_name, ''));
  v_target_role text := trim(COALESCE(p_target_role, ''));
  v_location_ref text := trim(COALESCE(p_location_ref, ''));
  v_actor_name text := NULLIF(trim(COALESCE(p_actor_name, '')), '');
  v_employee_name_first text := NULL;
  v_employee_name_last text := NULL;
  v_labor_employee public.labor_employees%ROWTYPE;
BEGIN
  IF p_labor_employee_id IS NOT NULL THEN
    SELECT *
    INTO v_labor_employee
    FROM public.labor_employees
    WHERE id = p_labor_employee_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Labor employee % was not found', p_labor_employee_id;
    END IF;

    IF v_employee_full_name = '' THEN
      v_employee_full_name := v_labor_employee.full_name;
    END IF;
    IF v_target_role = '' THEN
      v_target_role := v_labor_employee.position_title;
    END IF;
  END IF;

  IF p_template_id IS NULL THEN
    RAISE EXCEPTION 'Training template is required';
  END IF;

  IF v_employee_full_name = '' THEN
    RAISE EXCEPTION 'Employee full name is required';
  END IF;

  IF v_target_role = '' THEN
    RAISE EXCEPTION 'Target role is required';
  END IF;

  IF v_location_ref = '' THEN
    RAISE EXCEPTION 'Location reference is required';
  END IF;

  v_location_id := public.resolve_labor_location_id(v_location_ref, p_actor_user_id);
  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'Unable to resolve location from %', v_location_ref;
  END IF;

  IF p_labor_employee_id IS NOT NULL AND v_labor_employee.location_id <> v_location_id THEN
    RAISE EXCEPTION 'Labor employee % does not belong to location %', p_labor_employee_id, v_location_id;
  END IF;

  SELECT *
  INTO v_template
  FROM public.training_templates
  WHERE id = p_template_id
    AND is_active = true
    AND template_class = 'training_plan'
    AND (location_id IS NULL OR location_id = v_location_id)
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Training template % is not available for location %', p_template_id, v_location_id;
  END IF;

  SELECT *
  INTO v_version
  FROM public.training_template_versions
  WHERE template_id = v_template.id
    AND is_current = true
    AND status = 'published'
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Training template % does not have a current published version', p_template_id;
  END IF;

  SELECT count(*)
  INTO v_required_item_count
  FROM public.training_template_items
  WHERE template_version_id = v_version.id
    AND required = true;

  v_employee_name_first := split_part(v_employee_full_name, ' ', 1);
  v_employee_name_last := NULLIF(btrim(substring(v_employee_full_name FROM length(v_employee_name_first) + 1)), '');

  INSERT INTO public.training_records (
    template_id,
    template_version_id,
    template_name_snapshot,
    template_class_snapshot,
    labor_employee_id,
    employee_id,
    employee_name_first,
    employee_name_last,
    employee_full_name,
    target_role,
    location_id,
    hire_date,
    training_start_date,
    target_end_date,
    assigned_trainer_name,
    assigned_manager_name,
    overall_status,
    progress_percent,
    required_item_count,
    required_item_completed_count,
    template_snapshot,
    created_by_user_id,
    updated_by_user_id
  )
  VALUES (
    v_template.id,
    v_version.id,
    v_template.name,
    v_template.template_class,
    p_labor_employee_id,
    p_labor_employee_id,
    v_employee_name_first,
    v_employee_name_last,
    v_employee_full_name,
    v_target_role,
    v_location_id,
    p_hire_date,
    p_training_start_date,
    p_target_end_date,
    COALESCE(NULLIF(trim(COALESCE(p_assigned_trainer_name, '')), ''), v_labor_employee.assigned_trainer_name),
    COALESCE(NULLIF(trim(COALESCE(p_assigned_manager_name, '')), ''), v_labor_employee.assigned_manager_name),
    'not_started',
    0,
    v_required_item_count,
    0,
    COALESCE(public.build_training_template_published_snapshot(v_version.id), '{}'::jsonb),
    p_actor_user_id,
    p_actor_user_id
  )
  RETURNING *
  INTO v_record;

  INSERT INTO public.training_record_item_results (
    record_id,
    template_item_id,
    template_section_id,
    status
  )
  SELECT
    v_record.id,
    item.id,
    item.template_section_id,
    'not_started'::public.training_item_status
  FROM public.training_template_items item
  WHERE item.template_version_id = v_version.id;

  INSERT INTO public.training_record_events (
    record_id,
    event_type,
    actor_user_id,
    actor_name,
    after_state
  )
  VALUES (
    v_record.id,
    'record_created',
    p_actor_user_id,
    COALESCE(v_actor_name, 'System'),
    jsonb_build_object(
      'employee_full_name', v_record.employee_full_name,
      'target_role', v_record.target_role,
      'template_id', v_record.template_id,
      'template_version_id', v_record.template_version_id,
      'labor_employee_id', v_record.labor_employee_id
    )
  );

  RETURN v_record;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_training_record_config(
  p_record_id uuid,
  p_labor_employee_id uuid DEFAULT NULL,
  p_employee_full_name text DEFAULT NULL,
  p_target_role text DEFAULT NULL,
  p_hire_date date DEFAULT NULL,
  p_training_start_date date DEFAULT NULL,
  p_target_end_date date DEFAULT NULL,
  p_assigned_trainer_name text DEFAULT NULL,
  p_assigned_manager_name text DEFAULT NULL,
  p_actor_user_id uuid DEFAULT NULL,
  p_actor_name text DEFAULT NULL
)
RETURNS public.training_records
LANGUAGE plpgsql
AS $$
DECLARE
  v_record public.training_records%ROWTYPE;
  v_before jsonb;
BEGIN
  SELECT *
  INTO v_record
  FROM public.training_records
  WHERE id = p_record_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Training record % not found', p_record_id;
  END IF;

  v_before := to_jsonb(v_record);

  UPDATE public.training_records
  SET
    labor_employee_id = COALESCE(p_labor_employee_id, labor_employee_id),
    employee_id = COALESCE(p_labor_employee_id, employee_id),
    employee_full_name = COALESCE(NULLIF(trim(COALESCE(p_employee_full_name, '')), ''), employee_full_name),
    target_role = COALESCE(NULLIF(trim(COALESCE(p_target_role, '')), ''), target_role),
    hire_date = COALESCE(p_hire_date, hire_date),
    training_start_date = COALESCE(p_training_start_date, training_start_date),
    target_end_date = COALESCE(p_target_end_date, target_end_date),
    assigned_trainer_name = COALESCE(NULLIF(trim(COALESCE(p_assigned_trainer_name, '')), ''), assigned_trainer_name),
    assigned_manager_name = COALESCE(NULLIF(trim(COALESCE(p_assigned_manager_name, '')), ''), assigned_manager_name),
    updated_by_user_id = COALESCE(p_actor_user_id, updated_by_user_id)
  WHERE id = p_record_id
  RETURNING *
  INTO v_record;

  UPDATE public.training_records
  SET
    employee_name_first = split_part(employee_full_name, ' ', 1),
    employee_name_last = NULLIF(btrim(substring(employee_full_name FROM length(split_part(employee_full_name, ' ', 1)) + 1)), '')
  WHERE id = p_record_id
  RETURNING *
  INTO v_record;

  INSERT INTO public.training_record_events (
    record_id,
    event_type,
    actor_user_id,
    actor_name,
    before_state,
    after_state
  )
  VALUES (
    v_record.id,
    'record_reopened',
    p_actor_user_id,
    COALESCE(NULLIF(trim(COALESCE(p_actor_name, '')), ''), 'System'),
    v_before,
    to_jsonb(v_record)
  );

  RETURN v_record;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_training_item_status(
  p_record_id uuid,
  p_template_item_id uuid,
  p_status public.training_item_status,
  p_actor_user_id uuid DEFAULT NULL,
  p_actor_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_result public.training_record_item_results%ROWTYPE;
  v_record public.training_records%ROWTYPE;
  v_required_total integer := 0;
  v_required_done integer := 0;
  v_new_percent numeric(5,2) := 0;
  v_new_overall_status public.training_record_status := 'not_started';
  v_event_actor text := COALESCE(NULLIF(trim(COALESCE(p_actor_name, '')), ''), 'System');
  v_before_status public.training_item_status;
BEGIN
  SELECT *
  INTO v_result
  FROM public.training_record_item_results
  WHERE record_id = p_record_id
    AND template_item_id = p_template_item_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Training item result not found for record % item %', p_record_id, p_template_item_id;
  END IF;

  v_before_status := v_result.status;

  UPDATE public.training_record_item_results
  SET
    status = p_status,
    completed_by_user_id = CASE WHEN p_status IN ('complete', 'passed') THEN p_actor_user_id ELSE NULL END,
    completed_by_name = CASE WHEN p_status IN ('complete', 'passed') THEN v_event_actor ELSE NULL END,
    completed_at = CASE WHEN p_status IN ('complete', 'passed') THEN now() ELSE NULL END,
    updated_at = now()
  WHERE id = v_result.id
  RETURNING *
  INTO v_result;

  SELECT COUNT(*)
  INTO v_required_total
  FROM public.training_template_items ti
  JOIN public.training_record_item_results rir
    ON rir.template_item_id = ti.id
  WHERE rir.record_id = p_record_id
    AND ti.required = true;

  SELECT COUNT(*)
  INTO v_required_done
  FROM public.training_template_items ti
  JOIN public.training_record_item_results rir
    ON rir.template_item_id = ti.id
  WHERE rir.record_id = p_record_id
    AND ti.required = true
    AND rir.status IN ('complete', 'passed');

  IF v_required_total > 0 THEN
    v_new_percent := ROUND((v_required_done::numeric / v_required_total::numeric) * 100, 2);
  END IF;

  IF v_required_done = 0 THEN
    v_new_overall_status := 'not_started';
  ELSIF v_required_done >= v_required_total AND v_required_total > 0 THEN
    v_new_overall_status := 'complete';
  ELSE
    v_new_overall_status := 'in_progress';
  END IF;

  UPDATE public.training_records
  SET
    progress_percent = v_new_percent,
    required_item_completed_count = v_required_done,
    overall_status = v_new_overall_status,
    actual_completion_date = CASE WHEN v_new_overall_status = 'complete' THEN CURRENT_DATE ELSE NULL END,
    updated_by_user_id = COALESCE(p_actor_user_id, updated_by_user_id)
  WHERE id = p_record_id
  RETURNING *
  INTO v_record;

  INSERT INTO public.training_record_events (
    record_id,
    template_item_id,
    event_type,
    actor_user_id,
    actor_name,
    before_state,
    after_state
  )
  VALUES (
    p_record_id,
    p_template_item_id,
    'item_status_changed',
    p_actor_user_id,
    v_event_actor,
    jsonb_build_object('status', v_before_status),
    jsonb_build_object(
      'status', v_result.status,
      'completed_at', v_result.completed_at,
      'completed_by_name', v_result.completed_by_name
    )
  );

  RETURN jsonb_build_object(
    'result', to_jsonb(v_result),
    'record', to_jsonb(v_record)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.append_training_item_note(
  p_record_id uuid,
  p_template_item_id uuid,
  p_note_text text,
  p_actor_user_id uuid DEFAULT NULL,
  p_actor_name text DEFAULT NULL
)
RETURNS public.training_record_notes
LANGUAGE plpgsql
AS $$
DECLARE
  v_note public.training_record_notes%ROWTYPE;
  v_section_id uuid;
  v_actor_name text := COALESCE(NULLIF(trim(COALESCE(p_actor_name, '')), ''), 'System');
BEGIN
  SELECT template_section_id
  INTO v_section_id
  FROM public.training_record_item_results
  WHERE record_id = p_record_id
    AND template_item_id = p_template_item_id
  LIMIT 1;

  IF v_section_id IS NULL THEN
    RAISE EXCEPTION 'Training item % is not linked to record %', p_template_item_id, p_record_id;
  END IF;

  INSERT INTO public.training_record_notes (
    record_id,
    template_section_id,
    template_item_id,
    note_text,
    initials,
    created_by_user_id,
    created_by_name
  )
  VALUES (
    p_record_id,
    v_section_id,
    p_template_item_id,
    trim(COALESCE(p_note_text, '')),
    public.labor_initials(v_actor_name),
    p_actor_user_id,
    v_actor_name
  )
  RETURNING *
  INTO v_note;

  INSERT INTO public.training_record_events (
    record_id,
    template_item_id,
    event_type,
    actor_user_id,
    actor_name,
    after_state
  )
  VALUES (
    p_record_id,
    p_template_item_id,
    'note_added',
    p_actor_user_id,
    v_actor_name,
    to_jsonb(v_note)
  );

  RETURN v_note;
END;
$$;

CREATE OR REPLACE FUNCTION public.append_training_record_note(
  p_record_id uuid,
  p_note_text text,
  p_actor_user_id uuid DEFAULT NULL,
  p_actor_name text DEFAULT NULL
)
RETURNS public.training_record_notes
LANGUAGE plpgsql
AS $$
DECLARE
  v_note public.training_record_notes%ROWTYPE;
  v_actor_name text := COALESCE(NULLIF(trim(COALESCE(p_actor_name, '')), ''), 'System');
BEGIN
  INSERT INTO public.training_record_notes (
    record_id,
    note_text,
    initials,
    created_by_user_id,
    created_by_name
  )
  VALUES (
    p_record_id,
    trim(COALESCE(p_note_text, '')),
    public.labor_initials(v_actor_name),
    p_actor_user_id,
    v_actor_name
  )
  RETURNING *
  INTO v_note;

  INSERT INTO public.training_record_events (
    record_id,
    event_type,
    actor_user_id,
    actor_name,
    after_state
  )
  VALUES (
    p_record_id,
    'note_added',
    p_actor_user_id,
    v_actor_name,
    to_jsonb(v_note)
  );

  RETURN v_note;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_training_template_draft(
  p_template_id uuid,
  p_from_version_id uuid DEFAULT NULL,
  p_actor_user_id uuid DEFAULT NULL,
  p_actor_name text DEFAULT NULL,
  p_changelog text DEFAULT NULL
)
RETURNS public.training_template_versions
LANGUAGE plpgsql
AS $$
DECLARE
  v_source_version public.training_template_versions%ROWTYPE;
  v_new_version public.training_template_versions%ROWTYPE;
  v_next_version integer;
  v_section record;
  v_item record;
  v_dependency record;
  v_new_section_id uuid;
  v_new_item_id uuid;
BEGIN
  IF p_from_version_id IS NOT NULL THEN
    SELECT *
    INTO v_source_version
    FROM public.training_template_versions
    WHERE id = p_from_version_id
      AND template_id = p_template_id;
  ELSE
    SELECT *
    INTO v_source_version
    FROM public.training_template_versions
    WHERE template_id = p_template_id
    ORDER BY is_current DESC, version_no DESC
    LIMIT 1;
  END IF;

  SELECT COALESCE(MAX(version_no), 0) + 1
  INTO v_next_version
  FROM public.training_template_versions
  WHERE template_id = p_template_id;

  INSERT INTO public.training_template_versions (
    template_id,
    version_no,
    status,
    is_current,
    source_seed_key,
    source_packet,
    changelog,
    metadata,
    created_by_user_id
  )
  VALUES (
    p_template_id,
    v_next_version,
    'draft',
    false,
    v_source_version.source_seed_key,
    v_source_version.source_packet,
    COALESCE(NULLIF(trim(COALESCE(p_changelog, '')), ''), format('Draft cloned from version %s', COALESCE(v_source_version.version_no::text, 'seed'))),
    jsonb_build_object(
      'cloned_from_version_id', v_source_version.id,
      'cloned_from_version_no', v_source_version.version_no,
      'actor_name', NULLIF(trim(COALESCE(p_actor_name, '')), '')
    ),
    p_actor_user_id
  )
  RETURNING *
  INTO v_new_version;

  CREATE TEMP TABLE tmp_training_section_map (
    source_id uuid PRIMARY KEY,
    new_id uuid NOT NULL
  ) ON COMMIT DROP;

  CREATE TEMP TABLE tmp_training_item_map (
    source_id uuid PRIMARY KEY,
    new_id uuid NOT NULL
  ) ON COMMIT DROP;

  FOR v_section IN
    SELECT *
    FROM public.training_template_sections
    WHERE template_version_id = v_source_version.id
    ORDER BY
      CASE WHEN parent_section_id IS NULL THEN 0 ELSE 1 END,
      sequence_order
  LOOP
    INSERT INTO public.training_template_sections (
      template_version_id,
      parent_section_id,
      section_key,
      title,
      section_type,
      sequence_order,
      day_number,
      phase_name,
      time_block_start,
      time_block_end,
      time_block_note,
      completion_mode,
      instructions,
      metadata
    )
    VALUES (
      v_new_version.id,
      (
        SELECT new_id
        FROM tmp_training_section_map
        WHERE source_id = v_section.parent_section_id
      ),
      v_section.section_key,
      v_section.title,
      v_section.section_type,
      v_section.sequence_order,
      v_section.day_number,
      v_section.phase_name,
      v_section.time_block_start,
      v_section.time_block_end,
      v_section.time_block_note,
      v_section.completion_mode,
      v_section.instructions,
      v_section.metadata
    )
    RETURNING id
    INTO v_new_section_id;

    INSERT INTO tmp_training_section_map (source_id, new_id)
    VALUES (v_section.id, v_new_section_id);
  END LOOP;

  FOR v_item IN
    SELECT *
    FROM public.training_template_items
    WHERE template_version_id = v_source_version.id
    ORDER BY sequence_order
  LOOP
    INSERT INTO public.training_template_items (
      template_version_id,
      template_section_id,
      item_key,
      label,
      description,
      item_type,
      sequence_order,
      required,
      safety_sensitive,
      completion_mode,
      answer_options,
      correct_answer,
      expected_response,
      requires_attachment,
      linked_template_id,
      policy_reference,
      metadata
    )
    VALUES (
      v_new_version.id,
      (SELECT new_id FROM tmp_training_section_map WHERE source_id = v_item.template_section_id),
      v_item.item_key,
      v_item.label,
      v_item.description,
      v_item.item_type,
      v_item.sequence_order,
      v_item.required,
      v_item.safety_sensitive,
      v_item.completion_mode,
      v_item.answer_options,
      v_item.correct_answer,
      v_item.expected_response,
      v_item.requires_attachment,
      v_item.linked_template_id,
      v_item.policy_reference,
      v_item.metadata
    )
    RETURNING id
    INTO v_new_item_id;

    INSERT INTO tmp_training_item_map (source_id, new_id)
    VALUES (v_item.id, v_new_item_id);
  END LOOP;

  FOR v_dependency IN
    SELECT *
    FROM public.training_template_dependencies
    WHERE template_version_id = v_source_version.id
    ORDER BY sequence_order
  LOOP
    INSERT INTO public.training_template_dependencies (
      template_version_id,
      template_item_id,
      dependency_type,
      required_template_id,
      required_external_name,
      required_attachment_type,
      required_record_status,
      requirement_rule,
      sequence_order,
      is_required
    )
    VALUES (
      v_new_version.id,
      (SELECT new_id FROM tmp_training_item_map WHERE source_id = v_dependency.template_item_id),
      v_dependency.dependency_type,
      v_dependency.required_template_id,
      v_dependency.required_external_name,
      v_dependency.required_attachment_type,
      v_dependency.required_record_status,
      v_dependency.requirement_rule,
      v_dependency.sequence_order,
      v_dependency.is_required
    );
  END LOOP;

  RETURN v_new_version;
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_training_template_version(
  p_template_version_id uuid,
  p_actor_user_id uuid DEFAULT NULL,
  p_actor_name text DEFAULT NULL,
  p_changelog text DEFAULT NULL
)
RETURNS public.training_template_versions
LANGUAGE plpgsql
AS $$
DECLARE
  v_version public.training_template_versions%ROWTYPE;
  v_snapshot jsonb;
BEGIN
  SELECT *
  INTO v_version
  FROM public.training_template_versions
  WHERE id = p_template_version_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Training template version % not found', p_template_version_id;
  END IF;

  v_snapshot := public.build_training_template_published_snapshot(v_version.id);

  UPDATE public.training_template_versions
  SET is_current = false
  WHERE template_id = v_version.template_id
    AND is_current = true
    AND id <> v_version.id;

  UPDATE public.training_template_versions
  SET
    status = 'published',
    is_current = true,
    changelog = COALESCE(NULLIF(trim(COALESCE(p_changelog, '')), ''), changelog),
    published_snapshot = COALESCE(v_snapshot, published_snapshot),
    published_at = now()
  WHERE id = v_version.id
  RETURNING *
  INTO v_version;

  RETURN v_version;
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_training_template_version(
  p_template_id uuid,
  p_restore_version_id uuid,
  p_actor_user_id uuid DEFAULT NULL,
  p_actor_name text DEFAULT NULL
)
RETURNS public.training_template_versions
LANGUAGE plpgsql
AS $$
DECLARE
  v_new_version public.training_template_versions%ROWTYPE;
  v_restored_version_no integer;
BEGIN
  SELECT version_no
  INTO v_restored_version_no
  FROM public.training_template_versions
  WHERE id = p_restore_version_id
    AND template_id = p_template_id;

  IF v_restored_version_no IS NULL THEN
    RAISE EXCEPTION 'Restore source version % was not found for template %', p_restore_version_id, p_template_id;
  END IF;

  SELECT *
  INTO v_new_version
  FROM public.create_training_template_draft(
    p_template_id,
    p_restore_version_id,
    p_actor_user_id,
    p_actor_name,
    format('Restored from version %s', v_restored_version_no)
  );

  RETURN v_new_version;
END;
$$;

-- ─── Review / certification RPCs ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_review_instance(
  p_labor_employee_id uuid,
  p_template_id uuid,
  p_review_cycle review_cycle DEFAULT 'ad_hoc',
  p_due_date date DEFAULT NULL,
  p_actor_user_id uuid DEFAULT NULL,
  p_actor_name text DEFAULT NULL
)
RETURNS public.employee_review_instances
LANGUAGE plpgsql
AS $$
DECLARE
  v_employee public.labor_employees%ROWTYPE;
  v_version public.review_template_versions%ROWTYPE;
  v_instance public.employee_review_instances%ROWTYPE;
  v_anchor_date date;
BEGIN
  SELECT *
  INTO v_employee
  FROM public.labor_employees
  WHERE id = p_labor_employee_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Labor employee % not found', p_labor_employee_id;
  END IF;

  SELECT *
  INTO v_version
  FROM public.review_template_versions
  WHERE template_id = p_template_id
    AND is_current = true
    AND status = 'published'
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Review template % does not have a current published version', p_template_id;
  END IF;

  v_anchor_date := COALESCE(v_employee.first_shift_date, v_employee.start_date);

  INSERT INTO public.employee_review_instances (
    labor_employee_id,
    template_id,
    template_version_id,
    review_cycle,
    due_date,
    reviewer_user_id,
    reviewer_name,
    created_by_user_id,
    updated_by_user_id
  )
  VALUES (
    p_labor_employee_id,
    p_template_id,
    v_version.id,
    p_review_cycle,
    COALESCE(
      p_due_date,
      CASE p_review_cycle
        WHEN '30_day' THEN v_anchor_date + 30
        WHEN '60_day' THEN v_anchor_date + 60
        WHEN '90_day' THEN v_anchor_date + 90
        ELSE v_anchor_date
      END
    ),
    p_actor_user_id,
    NULLIF(trim(COALESCE(p_actor_name, '')), ''),
    p_actor_user_id,
    p_actor_user_id
  )
  RETURNING *
  INTO v_instance;

  RETURN v_instance;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_employee_certification(
  p_certification_id uuid DEFAULT NULL,
  p_labor_employee_id uuid DEFAULT NULL,
  p_requirement_id uuid DEFAULT NULL,
  p_completed_on date DEFAULT NULL,
  p_expires_on date DEFAULT NULL,
  p_external_document_url text DEFAULT NULL,
  p_source_note text DEFAULT NULL,
  p_actor_user_id uuid DEFAULT NULL
)
RETURNS public.employee_certifications
LANGUAGE plpgsql
AS $$
DECLARE
  v_requirement public.certification_requirements%ROWTYPE;
  v_row public.employee_certifications%ROWTYPE;
  v_resolved_expires_on date;
BEGIN
  IF p_requirement_id IS NULL THEN
    RAISE EXCEPTION 'Certification requirement is required';
  END IF;
  IF p_labor_employee_id IS NULL THEN
    RAISE EXCEPTION 'Labor employee is required';
  END IF;
  IF p_completed_on IS NULL THEN
    RAISE EXCEPTION 'Completion date is required';
  END IF;

  SELECT *
  INTO v_requirement
  FROM public.certification_requirements
  WHERE id = p_requirement_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Certification requirement % not found', p_requirement_id;
  END IF;

  v_resolved_expires_on := COALESCE(
    p_expires_on,
    CASE v_requirement.frequency
      WHEN 'annual' THEN p_completed_on + 365
      WHEN 'custom_days' THEN p_completed_on + COALESCE(v_requirement.renewal_interval_days, 0)
      ELSE NULL
    END
  );

  IF p_certification_id IS NULL THEN
    INSERT INTO public.employee_certifications (
      labor_employee_id,
      requirement_id,
      completed_on,
      expires_on,
      external_document_url,
      source_note,
      created_by_user_id,
      updated_by_user_id
    )
    VALUES (
      p_labor_employee_id,
      p_requirement_id,
      p_completed_on,
      v_resolved_expires_on,
      NULLIF(trim(COALESCE(p_external_document_url, '')), ''),
      NULLIF(trim(COALESCE(p_source_note, '')), ''),
      p_actor_user_id,
      p_actor_user_id
    )
    RETURNING *
    INTO v_row;
  ELSE
    UPDATE public.employee_certifications
    SET
      labor_employee_id = COALESCE(p_labor_employee_id, labor_employee_id),
      requirement_id = COALESCE(p_requirement_id, requirement_id),
      completed_on = COALESCE(p_completed_on, completed_on),
      expires_on = COALESCE(v_resolved_expires_on, expires_on),
      external_document_url = COALESCE(NULLIF(trim(COALESCE(p_external_document_url, '')), ''), external_document_url),
      source_note = COALESCE(NULLIF(trim(COALESCE(p_source_note, '')), ''), source_note),
      updated_by_user_id = COALESCE(p_actor_user_id, updated_by_user_id)
    WHERE id = p_certification_id
    RETURNING *
    INTO v_row;
  END IF;

  RETURN v_row;
END;
$$;

-- ─── Grants ────────────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.resolve_labor_location_id(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_labor_roster_snapshot(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_labor_employee(text, text, text, date, date, uuid, text, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_labor_employee(uuid, text, text, labor_employment_status, date, date, date, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.append_labor_employee_note(uuid, text, labor_note_type, labor_visibility_scope, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_training_record(uuid, text, text, text, date, date, date, text, uuid, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_training_record_config(uuid, uuid, text, text, date, date, date, text, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_training_item_status(uuid, uuid, public.training_item_status, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.append_training_item_note(uuid, uuid, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.append_training_record_note(uuid, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_training_template_draft(uuid, uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_training_template_version(uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_training_template_version(uuid, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_review_instance(uuid, uuid, review_cycle, date, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_employee_certification(uuid, uuid, uuid, date, date, text, text, uuid) TO authenticated;

-- ─── Seed high-priority source catalog foundations ──────────────────────────

INSERT INTO public.certification_requirements (
  slug,
  name,
  description,
  frequency,
  renewal_interval_days,
  reminder_window_days,
  is_active
)
VALUES (
  'dog_cpr_annual',
  'Dog CPR Certification',
  'Annual CPR certification for K9 Resort staff with diploma/document evidence.',
  'annual',
  365,
  30,
  true
)
ON CONFLICT (slug) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  frequency = EXCLUDED.frequency,
  renewal_interval_days = EXCLUDED.renewal_interval_days,
  reminder_window_days = EXCLUDED.reminder_window_days,
  is_active = EXCLUDED.is_active;

INSERT INTO public.labor_source_document_catalog (
  source_file_name,
  source_path,
  page_range,
  document_family,
  document_class,
  role_scope,
  extraction_status,
  normalized_target,
  qa_flags,
  notes
)
VALUES
  (
    'K9 CH Certifications.pdf',
    '/<path>/Downloads/K9 CH Certifications.pdf',
    '1-42',
    'training_packet',
    'scan_pdf',
    'all',
    'cataloged_scan_requires_ocr',
    'training template backlog',
    '["scan-based packet","manual QA required"]'::jsonb,
    'Adair Forsythe packet cataloged for normalization and manual QA. Existing PCT/CSR training plan seeds came from this packet family.'
  ),
  (
    'K9 CH Certifications.pdf',
    '/<path>/Downloads/K9 CH Certifications.pdf',
    'unknown subset',
    'onboarding_training_plan',
    'training_plan',
    'PCT',
    'seeded_manual_parse',
    'training_templates:pct_training_plan',
    '[]'::jsonb,
    'Existing PCT onboarding training plan is already seeded from Adair Forsythe materials and should be upgraded into the structured builder.'
  ),
  (
    'K9 CH Certifications.pdf',
    '/<path>/Downloads/K9 CH Certifications.pdf',
    'unknown subset',
    'onboarding_training_plan',
    'training_plan',
    'CSR',
    'seeded_manual_parse',
    'training_templates:csr_training_plan',
    '[]'::jsonb,
    'Existing CSR onboarding training plan is already seeded from Adair Forsythe materials and should be upgraded into the structured builder.'
  ),
  (
    'K9 CH Certifications.pdf',
    '/<path>/Downloads/K9 CH Certifications.pdf',
    'unknown subset',
    'bathing_certification',
    'live_evaluation',
    'PCT',
    'cataloged_pending_normalization',
    'future training template seed',
    '["awaiting OCR/manual parse"]'::jsonb,
    'Adair Forsythe packet likely contains bathing certification material that should become a separate certification/evaluation template.'
  ),
  (
    'K9 CH Certifications.pdf',
    '/<path>/Downloads/K9 CH Certifications.pdf',
    'unknown subset',
    'written_certification',
    'written_certification',
    'PCT/CSR',
    'cataloged_pending_normalization',
    'future training template seed',
    '["awaiting OCR/manual parse"]'::jsonb,
    'Adair Forsythe packet family placeholder for written exams and knowledge checks.'
  ),
  (
    'K9 CH Certifications.pdf',
    '/<path>/Downloads/K9 CH Certifications.pdf',
    'unknown subset',
    'live_certification',
    'live_evaluation',
    'PCT/CSR',
    'cataloged_pending_normalization',
    'future training template seed',
    '["awaiting OCR/manual parse"]'::jsonb,
    'Adair Forsythe packet family placeholder for live practical certifications.'
  ),
  (
    'Assistant Manager 30, 60, 90 day review template.docx',
    '/<path>/Downloads/30_60_90_day_review_template_draftsfeedback_requested_1/Assistant Manager 30, 60, 90 day review template.docx',
    'full document',
    'performance_review',
    'review_template',
    'Assistant Manager',
    'parsed_docx_ready_for_seed',
    'review_templates:assistant_manager_30_60_90',
    '[]'::jsonb,
    'Role-specific structured review template source.'
  ),
  (
    'CSR 30^LJ 60^LJ 90 day review template.docx',
    '/<path>/Downloads/30_60_90_day_review_template_draftsfeedback_requested_1/CSR 30^LJ 60^LJ 90 day review template.docx',
    'full document',
    'performance_review',
    'review_template',
    'CSR',
    'parsed_docx_ready_for_seed',
    'review_templates:csr_30_60_90',
    '[]'::jsonb,
    'Role-specific structured review template source.'
  ),
  (
    'General Manager 30^J 60^J 90 day review template.docx',
    '/<path>/Downloads/30_60_90_day_review_template_draftsfeedback_requested_1/General Manager 30^J 60^J 90 day review template.docx',
    'full document',
    'performance_review',
    'review_template',
    'General Manager',
    'parsed_docx_ready_for_seed',
    'review_templates:general_manager_30_60_90',
    '[]'::jsonb,
    'Role-specific structured review template source.'
  ),
  (
    'PCT 30^LLJ 60^LLJ 90 day review template.docx',
    '/<path>/Downloads/30_60_90_day_review_template_draftsfeedback_requested_1/PCT 30^LLJ 60^LLJ 90 day review template.docx',
    'full document',
    'performance_review',
    'review_template',
    'PCT',
    'parsed_docx_ready_for_seed',
    'review_templates:pct_30_60_90',
    '[]'::jsonb,
    'Role-specific structured review template source.'
  ),
  (
    'Supervisor 30^J 60^J 90 day review template.docx',
    '/<path>/Downloads/30_60_90_day_review_template_draftsfeedback_requested_1/Supervisor 30^J 60^J 90 day review template.docx',
    'full document',
    'performance_review',
    'review_template',
    'Supervisor',
    'parsed_docx_ready_for_seed',
    'review_templates:supervisor_30_60_90',
    '[]'::jsonb,
    'Role-specific structured review template source.'
  )
ON CONFLICT DO NOTHING;
