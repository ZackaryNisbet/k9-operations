-- Labor interview multi-guide review model
-- One candidate interview can own multiple pinned guide snapshots while all
-- transcript/audio evidence remains on the parent interview record.

ALTER TABLE public.labor_interview_records
  ADD COLUMN IF NOT EXISTS transcript_status text NOT NULL DEFAULT 'missing',
  ADD COLUMN IF NOT EXISTS transcript_source text,
  ADD COLUMN IF NOT EXISTS transcript_uploaded_at timestamptz,
  ADD CONSTRAINT labor_interview_records_transcript_status_chk CHECK (
    transcript_status IN ('missing', 'uploading', 'transcribing', 'ready', 'failed')
  );

UPDATE public.labor_interview_records
SET transcript_status = CASE
    WHEN NULLIF(BTRIM(transcript_text), '') IS NOT NULL THEN 'ready'
    ELSE transcript_status
  END,
  transcript_source = CASE
    WHEN NULLIF(BTRIM(transcript_text), '') IS NOT NULL THEN COALESCE(transcript_source, 'legacy')
    ELSE transcript_source
  END
WHERE transcript_status = 'missing';

CREATE TABLE IF NOT EXISTS public.labor_interview_record_guides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id uuid NOT NULL REFERENCES public.labor_interview_records(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
  template_id uuid NOT NULL REFERENCES public.labor_interview_templates(id) ON DELETE RESTRICT,
  template_version_id uuid NOT NULL REFERENCES public.labor_interview_template_versions(id) ON DELETE RESTRICT,
  guide_label text NOT NULL,
  role_key text,
  role_label text NOT NULL,
  guide_status labor_interview_status NOT NULL DEFAULT 'draft',
  sequence_order integer NOT NULL DEFAULT 10,
  template_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  pdf_field_manifest_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  question_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid,
  updated_by_user_id uuid,
  CONSTRAINT labor_interview_record_guides_unique_version UNIQUE (interview_id, template_version_id),
  CONSTRAINT labor_interview_record_guides_snapshot_types_chk CHECK (
    jsonb_typeof(template_snapshot) = 'object'
    AND jsonb_typeof(pdf_field_manifest_snapshot) = 'array'
    AND jsonb_typeof(question_snapshot) = 'array'
  )
);

CREATE INDEX IF NOT EXISTS labor_interview_record_guides_interview_idx
  ON public.labor_interview_record_guides (interview_id, sequence_order, created_at);

CREATE INDEX IF NOT EXISTS labor_interview_record_guides_location_idx
  ON public.labor_interview_record_guides (location_id, created_at DESC);

CREATE INDEX IF NOT EXISTS labor_interview_record_guides_template_idx
  ON public.labor_interview_record_guides (template_version_id);

INSERT INTO public.labor_interview_record_guides (
  interview_id,
  location_id,
  template_id,
  template_version_id,
  guide_label,
  role_key,
  role_label,
  guide_status,
  sequence_order,
  template_snapshot,
  pdf_field_manifest_snapshot,
  question_snapshot,
  metadata,
  created_at,
  updated_at,
  created_by_user_id,
  updated_by_user_id
)
SELECT
  r.id,
  r.location_id,
  r.template_id,
  r.template_version_id,
  COALESCE(NULLIF(r.template_snapshot #>> '{template,role_label}', ''), r.candidate_position, 'Interview Guide'),
  NULLIF(r.template_snapshot #>> '{template,role_key}', ''),
  COALESCE(NULLIF(r.template_snapshot #>> '{template,role_label}', ''), r.candidate_position, 'Interview Guide'),
  r.status,
  10,
  COALESCE(NULLIF(r.template_snapshot, '{}'::jsonb), public.build_labor_interview_template_snapshot(r.template_version_id), '{}'::jsonb),
  COALESCE(NULLIF(r.pdf_field_manifest_snapshot, '[]'::jsonb), r.template_snapshot #> '{version,pdf_field_manifest}', '[]'::jsonb),
  COALESCE(NULLIF(r.question_snapshot, '[]'::jsonb), r.template_snapshot #> '{questions}', '[]'::jsonb),
  jsonb_build_object('legacy_primary', true),
  r.created_at,
  r.updated_at,
  r.created_by_user_id,
  r.updated_by_user_id
FROM public.labor_interview_records r
WHERE NOT EXISTS (
  SELECT 1
  FROM public.labor_interview_record_guides g
  WHERE g.interview_id = r.id
    AND g.template_version_id = r.template_version_id
);

ALTER TABLE public.labor_interview_responses
  ADD COLUMN IF NOT EXISTS interview_guide_id uuid REFERENCES public.labor_interview_record_guides(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS response_state text NOT NULL DEFAULT 'blank',
  ADD COLUMN IF NOT EXISTS ai_review_mode text NOT NULL DEFAULT 'literal',
  ADD COLUMN IF NOT EXISTS manual_notes_text text,
  ADD COLUMN IF NOT EXISTS ai_merged_text text,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS reviewed_by_name text,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD CONSTRAINT labor_interview_responses_state_chk CHECK (
    response_state IN ('blank', 'manual', 'ai_draft', 'ai_approved', 'merged_draft', 'rejected')
  ),
  ADD CONSTRAINT labor_interview_responses_ai_review_mode_chk CHECK (
    ai_review_mode IN ('literal', 'inferred', 'speculative')
  );

UPDATE public.labor_interview_responses r
SET interview_guide_id = g.id
FROM public.labor_interview_record_guides g
WHERE r.interview_id = g.interview_id
  AND r.interview_guide_id IS NULL
  AND COALESCE((g.metadata->>'legacy_primary')::boolean, false) = true;

UPDATE public.labor_interview_responses
SET response_state = CASE
    WHEN COALESCE((metadata->>'approved')::boolean, false) = true AND NULLIF(BTRIM(response_text), '') IS NOT NULL THEN 'ai_approved'
    WHEN NULLIF(BTRIM(response_text), '') IS NOT NULL THEN 'manual'
    WHEN NULLIF(BTRIM(ai_draft_text), '') IS NOT NULL THEN 'ai_draft'
    ELSE 'blank'
  END,
  reviewed_at = CASE
    WHEN COALESCE((metadata->>'approved')::boolean, false) = true THEN COALESCE((metadata->>'approved_at')::timestamptz, updated_at)
    ELSE reviewed_at
  END,
  reviewed_by_name = CASE
    WHEN COALESCE((metadata->>'approved')::boolean, false) = true THEN COALESCE(metadata->>'approved_by', reviewed_by_name)
    ELSE reviewed_by_name
  END
WHERE response_state = 'blank';

DROP INDEX IF EXISTS labor_interview_responses_question_unique;
DROP INDEX IF EXISTS labor_interview_responses_pdf_field_unique;

CREATE UNIQUE INDEX IF NOT EXISTS labor_interview_responses_question_unique
  ON public.labor_interview_responses (
    interview_id,
    COALESCE(interview_guide_id, '00000000-0000-0000-0000-000000000000'::uuid),
    question_key
  )
  WHERE response_type = 'custom_question';

CREATE UNIQUE INDEX IF NOT EXISTS labor_interview_responses_pdf_field_unique
  ON public.labor_interview_responses (
    interview_id,
    COALESCE(interview_guide_id, '00000000-0000-0000-0000-000000000000'::uuid),
    pdf_field_name
  )
  WHERE response_type = 'pdf_field';

ALTER TABLE public.labor_interview_artifacts
  ADD COLUMN IF NOT EXISTS interview_guide_id uuid REFERENCES public.labor_interview_record_guides(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS labor_interview_artifacts_guide_idx
  ON public.labor_interview_artifacts (interview_guide_id, created_at DESC)
  WHERE interview_guide_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.prevent_labor_interview_guide_snapshot_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.interview_id IS DISTINCT FROM OLD.interview_id
    OR NEW.location_id IS DISTINCT FROM OLD.location_id
    OR NEW.template_id IS DISTINCT FROM OLD.template_id
    OR NEW.template_version_id IS DISTINCT FROM OLD.template_version_id
    OR NEW.template_snapshot IS DISTINCT FROM OLD.template_snapshot
    OR NEW.pdf_field_manifest_snapshot IS DISTINCT FROM OLD.pdf_field_manifest_snapshot
    OR NEW.question_snapshot IS DISTINCT FROM OLD.question_snapshot
  THEN
    RAISE EXCEPTION 'Interview guide snapshots cannot be changed after attachment';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_labor_interview_guide_snapshot_immutable ON public.labor_interview_record_guides;
CREATE TRIGGER trg_labor_interview_guide_snapshot_immutable
  BEFORE UPDATE ON public.labor_interview_record_guides
  FOR EACH ROW EXECUTE FUNCTION public.prevent_labor_interview_guide_snapshot_mutation();

ALTER TABLE public.labor_interview_record_guides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS labor_interview_record_guides_select ON public.labor_interview_record_guides;
CREATE POLICY labor_interview_record_guides_select ON public.labor_interview_record_guides
  FOR SELECT TO authenticated
  USING (public.labor_has_management_access(location_id));

DROP POLICY IF EXISTS labor_interview_record_guides_write ON public.labor_interview_record_guides;
CREATE POLICY labor_interview_record_guides_write ON public.labor_interview_record_guides
  FOR ALL TO authenticated
  USING (public.labor_has_management_access(location_id))
  WITH CHECK (
    public.labor_has_management_access(location_id)
    AND EXISTS (
      SELECT 1
      FROM public.labor_interview_records r
      WHERE r.id = labor_interview_record_guides.interview_id
        AND r.location_id = labor_interview_record_guides.location_id
        AND public.labor_has_management_access(r.location_id)
    )
  );
