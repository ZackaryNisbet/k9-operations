-- Performance review PDF/signature bridge.
-- Review source data stays on employee_review_instances.metadata so the
-- existing review instance lifecycle remains the canonical record.

CREATE OR REPLACE FUNCTION public.save_employee_review_pdf_draft(
  p_review_instance_id uuid,
  p_review_rating text DEFAULT NULL,
  p_manager_notes text DEFAULT NULL,
  p_action_plan text DEFAULT NULL,
  p_overall_rating text DEFAULT NULL,
  p_overall_comments text DEFAULT NULL,
  p_actor_user_id uuid DEFAULT NULL
)
RETURNS public.employee_review_instances
LANGUAGE plpgsql
AS $$
DECLARE
  v_instance public.employee_review_instances%ROWTYPE;
  v_metadata jsonb;
BEGIN
  SELECT *
  INTO v_instance
  FROM public.employee_review_instances
  WHERE id = p_review_instance_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Review instance % not found', p_review_instance_id;
  END IF;

  v_metadata := COALESCE(v_instance.metadata, '{}'::jsonb)
    || jsonb_build_object(
      'performance_review_rating', NULLIF(trim(COALESCE(p_review_rating, '')), ''),
      'manager_notes', NULLIF(trim(COALESCE(p_manager_notes, '')), ''),
      'action_plan', NULLIF(trim(COALESCE(p_action_plan, '')), ''),
      'overall_rating', NULLIF(trim(COALESCE(p_overall_rating, '')), ''),
      'overall_comments', NULLIF(trim(COALESCE(p_overall_comments, '')), ''),
      'pdf_draft_saved_at', now()
    );

  UPDATE public.employee_review_instances
  SET
    metadata = v_metadata,
    status = CASE
      WHEN status IN ('scheduled', 'overdue') THEN 'in_progress'
      ELSE status
    END,
    updated_at = now(),
    updated_by_user_id = COALESCE(p_actor_user_id, updated_by_user_id)
  WHERE id = p_review_instance_id
  RETURNING *
  INTO v_instance;

  RETURN v_instance;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_employee_review_signature_sent(
  p_review_instance_id uuid,
  p_provider text,
  p_submission_id text,
  p_submitter_id text DEFAULT NULL,
  p_submitter_slug text DEFAULT NULL,
  p_embed_src text DEFAULT NULL,
  p_delivery_method text DEFAULT NULL,
  p_recipient_email text DEFAULT NULL,
  p_recipient_phone text DEFAULT NULL,
  p_document_name text DEFAULT NULL,
  p_actor_user_id uuid DEFAULT NULL,
  p_provider_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS public.employee_review_instances
LANGUAGE plpgsql
AS $$
DECLARE
  v_instance public.employee_review_instances%ROWTYPE;
  v_signature jsonb;
BEGIN
  SELECT *
  INTO v_instance
  FROM public.employee_review_instances
  WHERE id = p_review_instance_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Review instance % not found', p_review_instance_id;
  END IF;

  v_signature := jsonb_build_object(
    'status', 'sent',
    'provider', NULLIF(trim(COALESCE(p_provider, '')), ''),
    'submission_id', NULLIF(trim(COALESCE(p_submission_id, '')), ''),
    'submitter_id', NULLIF(trim(COALESCE(p_submitter_id, '')), ''),
    'submitter_slug', NULLIF(trim(COALESCE(p_submitter_slug, '')), ''),
    'embed_src', NULLIF(trim(COALESCE(p_embed_src, '')), ''),
    'delivery_method', NULLIF(trim(COALESCE(p_delivery_method, '')), ''),
    'recipient_email', NULLIF(trim(COALESCE(p_recipient_email, '')), ''),
    'recipient_phone', NULLIF(trim(COALESCE(p_recipient_phone, '')), ''),
    'document_name', NULLIF(trim(COALESCE(p_document_name, '')), ''),
    'sent_at', now(),
    'provider_payload', COALESCE(p_provider_payload, '{}'::jsonb)
  );

  UPDATE public.employee_review_instances
  SET
    metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{signature}', v_signature, true),
    status = CASE
      WHEN status IN ('scheduled', 'overdue') THEN 'in_progress'
      ELSE status
    END,
    updated_at = now(),
    updated_by_user_id = COALESCE(p_actor_user_id, updated_by_user_id)
  WHERE id = p_review_instance_id
  RETURNING *
  INTO v_instance;

  RETURN v_instance;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_employee_review_signature_completed(
  p_review_instance_id uuid,
  p_provider text DEFAULT 'docuseal',
  p_submission_id text DEFAULT NULL,
  p_document_url text DEFAULT NULL,
  p_audit_log_url text DEFAULT NULL,
  p_completed_at timestamptz DEFAULT now(),
  p_signed_document_id uuid DEFAULT NULL,
  p_actor_user_id uuid DEFAULT NULL,
  p_provider_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS public.employee_review_instances
LANGUAGE plpgsql
AS $$
DECLARE
  v_instance public.employee_review_instances%ROWTYPE;
  v_existing_signature jsonb;
  v_signature jsonb;
BEGIN
  SELECT *
  INTO v_instance
  FROM public.employee_review_instances
  WHERE id = p_review_instance_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Review instance % not found', p_review_instance_id;
  END IF;

  v_existing_signature := COALESCE(v_instance.metadata->'signature', '{}'::jsonb);
  v_signature := v_existing_signature
    || jsonb_build_object(
      'status', 'completed',
      'provider', NULLIF(trim(COALESCE(p_provider, '')), ''),
      'submission_id', NULLIF(trim(COALESCE(p_submission_id, '')), ''),
      'document_url', NULLIF(trim(COALESCE(p_document_url, '')), ''),
      'audit_log_url', NULLIF(trim(COALESCE(p_audit_log_url, '')), ''),
      'completed_at', COALESCE(p_completed_at, now()),
      'signed_document_id', p_signed_document_id,
      'provider_payload', COALESCE(p_provider_payload, '{}'::jsonb)
    );

  UPDATE public.employee_review_instances
  SET
    metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{signature}', v_signature, true),
    status = 'completed',
    completed_at = COALESCE(completed_at, COALESCE(p_completed_at, now())),
    updated_at = now(),
    updated_by_user_id = COALESCE(p_actor_user_id, updated_by_user_id)
  WHERE id = p_review_instance_id
  RETURNING *
  INTO v_instance;

  RETURN v_instance;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_employee_review_pdf_draft(uuid, text, text, text, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_employee_review_signature_sent(uuid, text, text, text, text, text, text, text, text, text, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_employee_review_signature_completed(uuid, text, text, text, text, timestamptz, uuid, uuid, jsonb) TO authenticated;
