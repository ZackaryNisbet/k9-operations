-- Labor Interview Assistant immutability guards
-- Published template content and interview template snapshots are append-only.

CREATE OR REPLACE FUNCTION public.prevent_labor_interview_template_version_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'published' THEN
      RAISE EXCEPTION 'Published interview template versions cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status = 'published' THEN
    IF NEW.status NOT IN ('published', 'archived') THEN
      RAISE EXCEPTION 'Published interview template versions cannot return to draft';
    END IF;

    IF NEW.template_id IS DISTINCT FROM OLD.template_id
      OR NEW.version_no IS DISTINCT FROM OLD.version_no
      OR NEW.source_pdf_bucket IS DISTINCT FROM OLD.source_pdf_bucket
      OR NEW.source_pdf_path IS DISTINCT FROM OLD.source_pdf_path
      OR NEW.source_pdf_file_name IS DISTINCT FROM OLD.source_pdf_file_name
      OR NEW.source_pdf_mime_type IS DISTINCT FROM OLD.source_pdf_mime_type
      OR NEW.source_pdf_file_size_bytes IS DISTINCT FROM OLD.source_pdf_file_size_bytes
      OR NEW.pdf_page_count IS DISTINCT FROM OLD.pdf_page_count
      OR NEW.pdf_field_manifest IS DISTINCT FROM OLD.pdf_field_manifest
      OR NEW.pdf_verification_status IS DISTINCT FROM OLD.pdf_verification_status
      OR NEW.published_snapshot IS DISTINCT FROM OLD.published_snapshot
      OR NEW.changelog IS DISTINCT FROM OLD.changelog
      OR NEW.metadata IS DISTINCT FROM OLD.metadata
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
      OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
      OR NEW.published_at IS DISTINCT FROM OLD.published_at
    THEN
      RAISE EXCEPTION 'Published interview template content is immutable';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_labor_interview_template_version_immutable ON public.labor_interview_template_versions;
CREATE TRIGGER trg_labor_interview_template_version_immutable
  BEFORE UPDATE OR DELETE ON public.labor_interview_template_versions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_labor_interview_template_version_mutation();

CREATE OR REPLACE FUNCTION public.prevent_labor_interview_question_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_status public.labor_interview_template_status;
  v_version_id uuid;
BEGIN
  v_version_id := COALESCE(NEW.template_version_id, OLD.template_version_id);

  SELECT status INTO v_status
  FROM public.labor_interview_template_versions
  WHERE id = v_version_id;

  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'Interview template questions can only be changed on draft versions';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_labor_interview_question_draft_only ON public.labor_interview_template_questions;
CREATE TRIGGER trg_labor_interview_question_draft_only
  BEFORE UPDATE OR DELETE ON public.labor_interview_template_questions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_labor_interview_question_mutation();

CREATE OR REPLACE FUNCTION public.prevent_labor_interview_record_snapshot_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.template_id IS DISTINCT FROM OLD.template_id
    OR NEW.template_version_id IS DISTINCT FROM OLD.template_version_id
    OR NEW.template_snapshot IS DISTINCT FROM OLD.template_snapshot
    OR NEW.pdf_field_manifest_snapshot IS DISTINCT FROM OLD.pdf_field_manifest_snapshot
    OR NEW.question_snapshot IS DISTINCT FROM OLD.question_snapshot
  THEN
    RAISE EXCEPTION 'Interview template snapshots cannot be changed after record creation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_labor_interview_record_snapshot_immutable ON public.labor_interview_records;
CREATE TRIGGER trg_labor_interview_record_snapshot_immutable
  BEFORE UPDATE ON public.labor_interview_records
  FOR EACH ROW EXECUTE FUNCTION public.prevent_labor_interview_record_snapshot_mutation();
