BEGIN;

CREATE TABLE IF NOT EXISTS public.client_incident_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  case_type text NOT NULL CHECK (
    case_type IN (
      'animal_incident',
      'vet_visit',
      'serious_animal_event',
      'employee_injury',
      'gm_accident_investigation',
      'incident_investigation'
    )
  ),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'under_review', 'closed')),
  severity text NOT NULL DEFAULT 'standard' CHECK (severity IN ('standard', 'elevated', 'critical')),
  incident_date date NOT NULL DEFAULT CURRENT_DATE,
  incident_time time,
  incident_area text,
  subject_name text NOT NULL,
  secondary_subject_name text,
  client_name text,
  owner_phone text,
  summary text NOT NULL,
  narrative text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid,
  created_by_name text,
  updated_by_user_id uuid,
  updated_by_name text,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_incident_cases_location_idx
  ON public.client_incident_cases (location_id, incident_date DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS public.client_incident_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  case_id uuid NOT NULL REFERENCES public.client_incident_cases(id) ON DELETE CASCADE,
  form_code text NOT NULL,
  form_name text NOT NULL,
  source_page_start integer,
  source_page_end integer,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'final')),
  form_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid,
  created_by_name text,
  updated_by_user_id uuid,
  updated_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_incident_documents_case_idx
  ON public.client_incident_documents (case_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.client_incident_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  case_id uuid NOT NULL REFERENCES public.client_incident_cases(id) ON DELETE CASCADE,
  activity_type text NOT NULL CHECK (
    activity_type IN (
      'case_created',
      'case_updated',
      'status_change',
      'form_added',
      'form_updated',
      'note'
    )
  ),
  content text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_incident_activity_case_idx
  ON public.client_incident_activity (case_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_client_incident_cases_updated ON public.client_incident_cases;
CREATE TRIGGER trg_client_incident_cases_updated
  BEFORE UPDATE ON public.client_incident_cases
  FOR EACH ROW EXECUTE FUNCTION public.training_updated_at_trigger();

DROP TRIGGER IF EXISTS trg_client_incident_documents_updated ON public.client_incident_documents;
CREATE TRIGGER trg_client_incident_documents_updated
  BEFORE UPDATE ON public.client_incident_documents
  FOR EACH ROW EXECUTE FUNCTION public.training_updated_at_trigger();

ALTER TABLE public.client_incident_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_incident_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_incident_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_incident_cases_read ON public.client_incident_cases;
CREATE POLICY client_incident_cases_read ON public.client_incident_cases
  FOR SELECT TO authenticated
  USING (public.labor_has_management_access(location_id));

DROP POLICY IF EXISTS client_incident_cases_write ON public.client_incident_cases;
CREATE POLICY client_incident_cases_write ON public.client_incident_cases
  FOR ALL TO authenticated
  USING (public.labor_has_management_access(location_id))
  WITH CHECK (public.labor_has_management_access(location_id));

DROP POLICY IF EXISTS client_incident_documents_read ON public.client_incident_documents;
CREATE POLICY client_incident_documents_read ON public.client_incident_documents
  FOR SELECT TO authenticated
  USING (public.labor_has_management_access(location_id));

DROP POLICY IF EXISTS client_incident_documents_write ON public.client_incident_documents;
CREATE POLICY client_incident_documents_write ON public.client_incident_documents
  FOR ALL TO authenticated
  USING (public.labor_has_management_access(location_id))
  WITH CHECK (public.labor_has_management_access(location_id));

DROP POLICY IF EXISTS client_incident_activity_read ON public.client_incident_activity;
CREATE POLICY client_incident_activity_read ON public.client_incident_activity
  FOR SELECT TO authenticated
  USING (public.labor_has_management_access(location_id));

DROP POLICY IF EXISTS client_incident_activity_write ON public.client_incident_activity;
CREATE POLICY client_incident_activity_write ON public.client_incident_activity
  FOR ALL TO authenticated
  USING (public.labor_has_management_access(location_id))
  WITH CHECK (public.labor_has_management_access(location_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_incident_cases TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_incident_documents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_incident_activity TO authenticated;

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
SELECT *
FROM (
  VALUES
    (
      'Section 10 - Red Binder.pdf',
      'Section 10 - Red Binder.pdf',
      '67',
      'red_binder_appendix',
      'client_management_form',
      NULL,
      'structured_seeded',
      'client_management:red_binder:vet_visit_form',
      '[]'::jsonb,
      'Vet Visit Form seeded into Client Management form library.'
    ),
    (
      'Section 10 - Red Binder.pdf',
      'Section 10 - Red Binder.pdf',
      '68',
      'red_binder_appendix',
      'client_management_form',
      NULL,
      'structured_seeded',
      'client_management:red_binder:animal_incident_report',
      '[]'::jsonb,
      'Animal Incident Report seeded into Client Management form library.'
    ),
    (
      'Section 10 - Red Binder.pdf',
      'Section 10 - Red Binder.pdf',
      '69',
      'red_binder_appendix',
      'client_management_form',
      NULL,
      'structured_seeded',
      'client_management:red_binder:serious_animal_event_report',
      '[]'::jsonb,
      'Serious Animal Injury / Illness / Death Report seeded into Client Management form library.'
    ),
    (
      'Section 10 - Red Binder.pdf',
      'Section 10 - Red Binder.pdf',
      '70',
      'red_binder_appendix',
      'client_management_form',
      NULL,
      'structured_seeded',
      'client_management:red_binder:employee_injury_report',
      '[]'::jsonb,
      'Employee injury self-report seeded into Client Management form library.'
    ),
    (
      'Section 10 - Red Binder.pdf',
      'Section 10 - Red Binder.pdf',
      '71-72',
      'red_binder_appendix',
      'client_management_form',
      NULL,
      'structured_seeded',
      'client_management:red_binder:gm_accident_investigation',
      '[]'::jsonb,
      'GM Accident Investigation form seeded into Client Management form library.'
    ),
    (
      'Section 10 - Red Binder.pdf',
      'Section 10 - Red Binder.pdf',
      '72-74',
      'red_binder_appendix',
      'client_management_form',
      NULL,
      'structured_seeded',
      'client_management:red_binder:incident_investigation_report',
      '[]'::jsonb,
      'Incident Investigation Report seeded into Client Management form library.'
    )
) AS source_rows (
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
WHERE NOT EXISTS (
  SELECT 1
  FROM public.labor_source_document_catalog existing
  WHERE existing.source_file_name = source_rows.source_file_name
    AND existing.page_range = source_rows.page_range
    AND existing.normalized_target = source_rows.normalized_target
);

COMMIT;
