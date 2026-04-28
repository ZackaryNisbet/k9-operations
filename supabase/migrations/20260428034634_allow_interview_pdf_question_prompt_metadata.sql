-- Allow backfilling derived PDF question prompt metadata without mutating the
-- published template PDF, fields, questions, or published snapshot.
CREATE OR REPLACE FUNCTION public.prevent_labor_interview_template_version_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_old_metadata jsonb;
  v_new_metadata jsonb;
  v_metadata_change_is_prompt_backfill boolean;
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

    v_old_metadata := COALESCE(OLD.metadata, '{}'::jsonb);
    v_new_metadata := COALESCE(NEW.metadata, '{}'::jsonb);
    v_metadata_change_is_prompt_backfill := (
      v_new_metadata - 'pdf_question_prompts' - 'pdf_question_count' - 'pdf_question_prompts_backfilled_at'
    ) IS NOT DISTINCT FROM (
      v_old_metadata - 'pdf_question_prompts' - 'pdf_question_count' - 'pdf_question_prompts_backfilled_at'
    );

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
      OR (NEW.metadata IS DISTINCT FROM OLD.metadata AND NOT v_metadata_change_is_prompt_backfill)
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
