-- Labor Interview Assistant
-- Versioned interview templates, Acrobat/PDF form-field manifests,
-- interview records, response snapshots, generated artifacts, and AI draft audit.

DO $$
BEGIN
  CREATE TYPE labor_interview_template_status AS ENUM (
    'draft',
    'published',
    'archived'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE labor_interview_status AS ENUM (
    'draft',
    'in_progress',
    'ai_drafted',
    'reviewed',
    'completed',
    'archived'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE labor_interview_response_type AS ENUM (
    'custom_question',
    'pdf_field'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'labor-interview-documents',
  'labor-interview-documents',
  false,
  52428800,
  ARRAY[
    'application/pdf',
    'text/plain',
    'text/vtt',
    'application/json'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE TABLE IF NOT EXISTS public.labor_interview_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
  role_key text NOT NULL,
  role_label text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid,
  updated_by_user_id uuid,
  CONSTRAINT labor_interview_templates_role_unique UNIQUE (location_id, role_key)
);

CREATE INDEX IF NOT EXISTS labor_interview_templates_location_idx
  ON public.labor_interview_templates (location_id, is_active, role_key);

CREATE TABLE IF NOT EXISTS public.labor_interview_template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.labor_interview_templates(id) ON DELETE RESTRICT,
  version_no integer NOT NULL,
  status labor_interview_template_status NOT NULL DEFAULT 'draft',
  is_current boolean NOT NULL DEFAULT false,
  source_pdf_bucket text,
  source_pdf_path text,
  source_pdf_file_name text,
  source_pdf_mime_type text,
  source_pdf_file_size_bytes bigint,
  pdf_page_count integer,
  pdf_field_manifest jsonb NOT NULL DEFAULT '[]'::jsonb,
  pdf_verification_status text NOT NULL DEFAULT 'missing_pdf',
  published_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  changelog text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid,
  published_at timestamptz,
  archived_at timestamptz,
  CONSTRAINT labor_interview_template_versions_unique UNIQUE (template_id, version_no),
  CONSTRAINT labor_interview_template_versions_verify_status_chk CHECK (
    pdf_verification_status IN ('missing_pdf', 'pending_verification', 'verified_fields', 'failed_no_fields', 'failed_invalid_pdf')
  ),
  CONSTRAINT labor_interview_template_versions_publish_requires_fields_chk CHECK (
    status <> 'published'
    OR (
      pdf_verification_status = 'verified_fields'
      AND jsonb_typeof(pdf_field_manifest) = 'array'
      AND jsonb_array_length(pdf_field_manifest) > 0
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS labor_interview_template_versions_current_idx
  ON public.labor_interview_template_versions (template_id)
  WHERE is_current = true;

CREATE INDEX IF NOT EXISTS labor_interview_template_versions_template_idx
  ON public.labor_interview_template_versions (template_id, status, version_no DESC);

CREATE TABLE IF NOT EXISTS public.labor_interview_template_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_version_id uuid NOT NULL REFERENCES public.labor_interview_template_versions(id) ON DELETE RESTRICT,
  question_key text NOT NULL,
  category text NOT NULL,
  prompt text NOT NULL,
  helper_text text,
  sequence_order integer NOT NULL,
  required boolean NOT NULL DEFAULT false,
  answer_format text NOT NULL DEFAULT 'long_text',
  mapped_pdf_field_name text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT labor_interview_template_questions_unique UNIQUE (template_version_id, question_key)
);

CREATE INDEX IF NOT EXISTS labor_interview_template_questions_version_idx
  ON public.labor_interview_template_questions (template_version_id, sequence_order);

CREATE TABLE IF NOT EXISTS public.labor_interview_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
  labor_employee_id uuid REFERENCES public.labor_employees(id) ON DELETE SET NULL,
  template_id uuid NOT NULL REFERENCES public.labor_interview_templates(id) ON DELETE RESTRICT,
  template_version_id uuid NOT NULL REFERENCES public.labor_interview_template_versions(id) ON DELETE RESTRICT,
  candidate_full_name text NOT NULL,
  candidate_email text,
  candidate_phone text,
  candidate_position text NOT NULL,
  interview_date date,
  interview_time time,
  status labor_interview_status NOT NULL DEFAULT 'draft',
  interviewer_user_id uuid,
  interviewer_name text,
  zoom_recording_url text,
  zoom_passcode text,
  transcript_text text,
  transcript_file_bucket text,
  transcript_file_path text,
  template_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  pdf_field_manifest_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  question_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid,
  updated_by_user_id uuid
);

CREATE INDEX IF NOT EXISTS labor_interview_records_location_idx
  ON public.labor_interview_records (location_id, interview_date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS labor_interview_records_template_idx
  ON public.labor_interview_records (template_version_id);

CREATE INDEX IF NOT EXISTS labor_interview_records_employee_idx
  ON public.labor_interview_records (labor_employee_id)
  WHERE labor_employee_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.labor_interview_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id uuid NOT NULL REFERENCES public.labor_interview_records(id) ON DELETE CASCADE,
  response_type labor_interview_response_type NOT NULL,
  question_key text,
  pdf_field_name text,
  prompt_snapshot text,
  response_text text,
  ai_draft_text text,
  ai_confidence numeric(4,3),
  ai_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid,
  updated_by_user_id uuid,
  CONSTRAINT labor_interview_responses_target_chk CHECK (
    (response_type = 'custom_question' AND question_key IS NOT NULL)
    OR (response_type = 'pdf_field' AND pdf_field_name IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS labor_interview_responses_question_unique
  ON public.labor_interview_responses (interview_id, question_key)
  WHERE response_type = 'custom_question';

CREATE UNIQUE INDEX IF NOT EXISTS labor_interview_responses_pdf_field_unique
  ON public.labor_interview_responses (interview_id, pdf_field_name)
  WHERE response_type = 'pdf_field';

CREATE INDEX IF NOT EXISTS labor_interview_responses_interview_idx
  ON public.labor_interview_responses (interview_id, response_type);

CREATE TABLE IF NOT EXISTS public.labor_interview_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id uuid NOT NULL REFERENCES public.labor_interview_records(id) ON DELETE CASCADE,
  artifact_type text NOT NULL,
  file_name text NOT NULL,
  storage_bucket text NOT NULL DEFAULT 'labor-interview-documents',
  storage_path text NOT NULL,
  mime_type text NOT NULL DEFAULT 'application/pdf',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid,
  created_by_name text
);

CREATE INDEX IF NOT EXISTS labor_interview_artifacts_interview_idx
  ON public.labor_interview_artifacts (interview_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.labor_interview_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id uuid REFERENCES public.labor_interview_records(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
  event_type text NOT NULL,
  source_table text,
  source_id uuid,
  previous_snapshot jsonb,
  new_snapshot jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id uuid,
  actor_name text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS labor_interview_events_interview_idx
  ON public.labor_interview_events (interview_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS labor_interview_events_location_idx
  ON public.labor_interview_events (location_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION public.build_labor_interview_template_snapshot(
  p_template_version_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'template', jsonb_build_object(
      'id', t.id,
      'location_id', t.location_id,
      'role_key', t.role_key,
      'role_label', t.role_label,
      'description', t.description
    ),
    'version', jsonb_build_object(
      'id', tv.id,
      'version_no', tv.version_no,
      'status', tv.status::text,
      'pdf_verification_status', tv.pdf_verification_status,
      'source_pdf_bucket', tv.source_pdf_bucket,
      'source_pdf_path', tv.source_pdf_path,
      'source_pdf_file_name', tv.source_pdf_file_name,
      'pdf_page_count', tv.pdf_page_count,
      'pdf_field_manifest', COALESCE(tv.pdf_field_manifest, '[]'::jsonb),
      'metadata', COALESCE(tv.metadata, '{}'::jsonb),
      'published_at', tv.published_at
    ),
    'questions', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', q.id,
          'question_key', q.question_key,
          'category', q.category,
          'prompt', q.prompt,
          'helper_text', q.helper_text,
          'sequence_order', q.sequence_order,
          'required', q.required,
          'answer_format', q.answer_format,
          'mapped_pdf_field_name', q.mapped_pdf_field_name,
          'metadata', COALESCE(q.metadata, '{}'::jsonb)
        )
        ORDER BY q.sequence_order
      )
      FROM public.labor_interview_template_questions q
      WHERE q.template_version_id = tv.id
    ), '[]'::jsonb)
  )
  FROM public.labor_interview_template_versions tv
  JOIN public.labor_interview_templates t
    ON t.id = tv.template_id
  WHERE tv.id = p_template_version_id;
$$;

CREATE OR REPLACE FUNCTION public.labor_interview_record_history_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_event_type text := TG_OP;
  v_location_id uuid;
BEGIN
  v_location_id := COALESCE(NEW.location_id, OLD.location_id);

  IF TG_OP = 'INSERT' THEN
    v_event_type := 'interview_created';
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      v_event_type := 'interview_status_changed';
    ELSE
      v_event_type := 'interview_updated';
    END IF;
  END IF;

  INSERT INTO public.labor_interview_events (
    interview_id,
    location_id,
    event_type,
    source_table,
    source_id,
    previous_snapshot,
    new_snapshot,
    actor_user_id,
    actor_name,
    occurred_at
  )
  VALUES (
    COALESCE(NEW.id, OLD.id),
    v_location_id,
    v_event_type,
    'labor_interview_records',
    COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
    to_jsonb(NEW),
    COALESCE(NEW.updated_by_user_id, NEW.created_by_user_id),
    COALESCE(NEW.interviewer_name, 'System'),
    now()
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_labor_interview_record_history ON public.labor_interview_records;
CREATE TRIGGER trg_labor_interview_record_history
  AFTER INSERT OR UPDATE ON public.labor_interview_records
  FOR EACH ROW EXECUTE FUNCTION public.labor_interview_record_history_trigger();

ALTER TABLE public.labor_interview_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labor_interview_template_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labor_interview_template_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labor_interview_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labor_interview_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labor_interview_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labor_interview_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS labor_interview_templates_select ON public.labor_interview_templates;
CREATE POLICY labor_interview_templates_select ON public.labor_interview_templates
  FOR SELECT TO authenticated
  USING (public.labor_has_management_access(location_id));

DROP POLICY IF EXISTS labor_interview_templates_write ON public.labor_interview_templates;
CREATE POLICY labor_interview_templates_write ON public.labor_interview_templates
  FOR ALL TO authenticated
  USING (public.labor_has_management_access(location_id))
  WITH CHECK (public.labor_has_management_access(location_id));

DROP POLICY IF EXISTS labor_interview_template_versions_select ON public.labor_interview_template_versions;
CREATE POLICY labor_interview_template_versions_select ON public.labor_interview_template_versions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.labor_interview_templates t
      WHERE t.id = labor_interview_template_versions.template_id
        AND public.labor_has_management_access(t.location_id)
    )
  );

DROP POLICY IF EXISTS labor_interview_template_versions_write ON public.labor_interview_template_versions;
CREATE POLICY labor_interview_template_versions_write ON public.labor_interview_template_versions
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.labor_interview_templates t
      WHERE t.id = labor_interview_template_versions.template_id
        AND public.labor_has_management_access(t.location_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.labor_interview_templates t
      WHERE t.id = labor_interview_template_versions.template_id
        AND public.labor_has_management_access(t.location_id)
    )
  );

DROP POLICY IF EXISTS labor_interview_template_questions_select ON public.labor_interview_template_questions;
CREATE POLICY labor_interview_template_questions_select ON public.labor_interview_template_questions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.labor_interview_template_versions tv
      JOIN public.labor_interview_templates t ON t.id = tv.template_id
      WHERE tv.id = labor_interview_template_questions.template_version_id
        AND public.labor_has_management_access(t.location_id)
    )
  );

DROP POLICY IF EXISTS labor_interview_template_questions_write ON public.labor_interview_template_questions;
CREATE POLICY labor_interview_template_questions_write ON public.labor_interview_template_questions
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.labor_interview_template_versions tv
      JOIN public.labor_interview_templates t ON t.id = tv.template_id
      WHERE tv.id = labor_interview_template_questions.template_version_id
        AND tv.status = 'draft'
        AND public.labor_has_management_access(t.location_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.labor_interview_template_versions tv
      JOIN public.labor_interview_templates t ON t.id = tv.template_id
      WHERE tv.id = labor_interview_template_questions.template_version_id
        AND tv.status = 'draft'
        AND public.labor_has_management_access(t.location_id)
    )
  );

DROP POLICY IF EXISTS labor_interview_records_select ON public.labor_interview_records;
CREATE POLICY labor_interview_records_select ON public.labor_interview_records
  FOR SELECT TO authenticated
  USING (public.labor_has_management_access(location_id));

DROP POLICY IF EXISTS labor_interview_records_write ON public.labor_interview_records;
CREATE POLICY labor_interview_records_write ON public.labor_interview_records
  FOR ALL TO authenticated
  USING (public.labor_has_management_access(location_id))
  WITH CHECK (public.labor_has_management_access(location_id));

DROP POLICY IF EXISTS labor_interview_responses_select ON public.labor_interview_responses;
CREATE POLICY labor_interview_responses_select ON public.labor_interview_responses
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.labor_interview_records r
      WHERE r.id = labor_interview_responses.interview_id
        AND public.labor_has_management_access(r.location_id)
    )
  );

DROP POLICY IF EXISTS labor_interview_responses_write ON public.labor_interview_responses;
CREATE POLICY labor_interview_responses_write ON public.labor_interview_responses
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.labor_interview_records r
      WHERE r.id = labor_interview_responses.interview_id
        AND public.labor_has_management_access(r.location_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.labor_interview_records r
      WHERE r.id = labor_interview_responses.interview_id
        AND public.labor_has_management_access(r.location_id)
    )
  );

DROP POLICY IF EXISTS labor_interview_artifacts_select ON public.labor_interview_artifacts;
CREATE POLICY labor_interview_artifacts_select ON public.labor_interview_artifacts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.labor_interview_records r
      WHERE r.id = labor_interview_artifacts.interview_id
        AND public.labor_has_management_access(r.location_id)
    )
  );

DROP POLICY IF EXISTS labor_interview_artifacts_write ON public.labor_interview_artifacts;
CREATE POLICY labor_interview_artifacts_write ON public.labor_interview_artifacts
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.labor_interview_records r
      WHERE r.id = labor_interview_artifacts.interview_id
        AND public.labor_has_management_access(r.location_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.labor_interview_records r
      WHERE r.id = labor_interview_artifacts.interview_id
        AND public.labor_has_management_access(r.location_id)
    )
  );

DROP POLICY IF EXISTS labor_interview_events_select ON public.labor_interview_events;
CREATE POLICY labor_interview_events_select ON public.labor_interview_events
  FOR SELECT TO authenticated
  USING (public.labor_has_management_access(location_id));

DROP POLICY IF EXISTS labor_interview_events_insert ON public.labor_interview_events;
CREATE POLICY labor_interview_events_insert ON public.labor_interview_events
  FOR INSERT TO authenticated
  WITH CHECK (public.labor_has_management_access(location_id));

DROP POLICY IF EXISTS labor_interview_documents_select ON storage.objects;
CREATE POLICY labor_interview_documents_select
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'labor-interview-documents'
    AND array_length(storage.foldername(name), 1) >= 1
    AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.labor_has_management_access(((storage.foldername(name))[1])::uuid)
  );

DROP POLICY IF EXISTS labor_interview_documents_insert ON storage.objects;
CREATE POLICY labor_interview_documents_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'labor-interview-documents'
    AND array_length(storage.foldername(name), 1) >= 2
    AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.labor_has_management_access(((storage.foldername(name))[1])::uuid)
  );

DROP POLICY IF EXISTS labor_interview_documents_update ON storage.objects;
CREATE POLICY labor_interview_documents_update
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'labor-interview-documents'
    AND array_length(storage.foldername(name), 1) >= 1
    AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.labor_has_management_access(((storage.foldername(name))[1])::uuid)
  )
  WITH CHECK (
    bucket_id = 'labor-interview-documents'
    AND array_length(storage.foldername(name), 1) >= 1
    AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.labor_has_management_access(((storage.foldername(name))[1])::uuid)
  );

DO $$
DECLARE
  v_location_id uuid;
  v_template_id uuid;
  v_version_id uuid;
  v_role record;
  v_sequence integer;
  v_question record;
BEGIN
  SELECT id INTO v_location_id FROM public.locations WHERE slug = 'cherry-hill' LIMIT 1;
  IF v_location_id IS NULL THEN
    RETURN;
  END IF;

  FOR v_role IN
    SELECT * FROM (VALUES
      ('assistant_manager', 'Assistant Manager'),
      ('customer_service_representative', 'Customer Service Representative'),
      ('supervisor', 'Supervisor'),
      ('pet_care_technician', 'Pet Care Technician')
    ) AS roles(role_key, role_label)
  LOOP
    INSERT INTO public.labor_interview_templates (
      location_id,
      role_key,
      role_label,
      description
    )
    VALUES (
      v_location_id,
      v_role.role_key,
      v_role.role_label,
      'Cherry Hill interview template seeded from the current interview workbook. Publish only after an Acrobat-prepared fillable PDF verifies with real fields.'
    )
    ON CONFLICT (location_id, role_key) DO UPDATE
    SET
      role_label = EXCLUDED.role_label,
      description = EXCLUDED.description,
      updated_at = now()
    RETURNING id INTO v_template_id;

    SELECT id INTO v_version_id
    FROM public.labor_interview_template_versions
    WHERE template_id = v_template_id
      AND version_no = 1
    LIMIT 1;

    IF v_version_id IS NULL THEN
      INSERT INTO public.labor_interview_template_versions (
        template_id,
        version_no,
        status,
        is_current,
        pdf_verification_status,
        changelog,
        metadata
      )
      VALUES (
        v_template_id,
        1,
        'draft',
        false,
        'missing_pdf',
        'Seeded draft from Interviews.xlsx; requires Acrobat-prepared fillable PDF verification before publishing.',
        jsonb_build_object('seed_source', 'Interviews.xlsx', 'seeded_without_pdf_fields', true)
      )
      RETURNING id INTO v_version_id;
    END IF;

    DELETE FROM public.labor_interview_template_questions
    WHERE template_version_id = v_version_id;

    v_sequence := 0;
    FOR v_question IN
      SELECT * FROM (VALUES
        ('Availability & Logistics', 'Do you have a car?'),
        ('Availability & Logistics', 'How far are you from Cherry Hill (in miles or minutes)?'),
        ('Availability & Logistics', 'Do you have any regular schedule conflicts (e.g. school, another job, standing appointments)?'),
        ('Availability & Logistics', 'Are you available on weekends?'),
        ('Availability & Logistics', 'Are you available on holidays?'),
        ('Availability & Logistics', 'Are you looking for long-term or short-term employment?'),
        ('Availability & Logistics', 'Are you authorized to work in the U.S. / over 18 / driver''s license'),
        ('Availability & Logistics', 'When are you available to start?'),
        ('Experience', 'What formal education do you have?'),
        ('Experience', 'Are you bilingual?'),
        ('Experience', 'How many years of dog experience do you have?'),
        ('Experience', 'What specific types of dog care have you done before (daycare, boarding, grooming, training, etc.)?'),
        ('Experience', 'How many years of customer service experience do you have?'),
        ('Experience', 'Have you ever worked in a kennel, dog daycare, or veterinary clinic?'),
        ('Experience', 'Have you ever handled more than 5 dogs at once?'),
        ('Experience', 'Have you worked in a role that involved cleaning or janitorial tasks?'),
        ('Work Preferences', 'Do you prefer morning, mid-day, or evening shifts?'),
        ('Work Preferences', 'Are you comfortable working shifts that start as early as 6 AM or end as late as 9 PM?'),
        ('Work Preferences', 'Are you open to last-minute shift coverage if someone calls out?'),
        ('Work Preferences', 'Are you okay working independently for parts of your shift?'),
        ('Work Preferences', 'Do you prefer working with animals, people, or a mix of both?'),
        ('Reliability & Culture Fit', 'Do you have any upcoming travel or time-off needs in the next 3 months?'),
        ('Reliability & Culture Fit', 'Have you ever been terminated from a job? If yes, why?'),
        ('Reliability & Culture Fit', 'Do you prefer working in a structured or flexible environment?'),
        ('Reliability & Culture Fit', 'Are you comfortable with cleaning up dog waste, urine, vomit, etc.?'),
        ('Reliability & Culture Fit', 'Are you comfortable in a loud environment with barking dogs?'),
        ('Compensation', 'What are your pay expectations?'),
        ('Compensation', 'Are you open to starting at our entry-level rate with opportunity for growth?'),
        ('Compensation', 'Do you require a certain minimum number of hours to make this job work for you financially?')
      ) AS questions(category, prompt)
    LOOP
      v_sequence := v_sequence + 10;
      INSERT INTO public.labor_interview_template_questions (
        template_version_id,
        question_key,
        category,
        prompt,
        sequence_order,
        required
      )
      VALUES (
        v_version_id,
        lower(regexp_replace(v_role.role_key || '_' || v_sequence::text, '[^a-zA-Z0-9]+', '_', 'g')),
        v_question.category,
        v_question.prompt,
        v_sequence,
        false
      );
    END LOOP;

    IF v_role.role_key = 'customer_service_representative' THEN
      INSERT INTO public.labor_interview_template_questions (
        template_version_id,
        question_key,
        category,
        prompt,
        sequence_order,
        required,
        metadata
      )
      VALUES
        (v_version_id, 'csr_wow_experience', 'Role-Specific', 'How do you provide a WOW experience?', 1000, false, '{"seed_source":"Improvement sheet"}'::jsonb),
        (v_version_id, 'csr_great_customer_service', 'Role-Specific', 'Give me an example of a time you experienced great customer service?', 1010, false, '{"seed_source":"Improvement sheet"}'::jsonb)
      ON CONFLICT (template_version_id, question_key) DO NOTHING;
    END IF;
  END LOOP;
END;
$$;
