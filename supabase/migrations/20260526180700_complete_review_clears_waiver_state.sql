-- Completing a previously waived review checkpoint must clear the waiver state.

BEGIN;

CREATE OR REPLACE FUNCTION public.complete_employee_review_instance(
  p_review_instance_id uuid,
  p_actor_user_id uuid DEFAULT NULL,
  p_actor_name text DEFAULT NULL,
  p_labor_employee_document_id uuid DEFAULT NULL,
  p_completed_on date DEFAULT NULL
)
RETURNS public.employee_review_instances
LANGUAGE plpgsql
AS $$
DECLARE
  v_instance public.employee_review_instances%ROWTYPE;
  v_employee public.labor_employees%ROWTYPE;
  v_requirement public.labor_compliance_requirements%ROWTYPE;
  v_document public.labor_employee_documents%ROWTYPE;
  v_completed_on date := COALESCE(p_completed_on, CURRENT_DATE);
  v_snapshot jsonb;
  v_evidence_link_id uuid;
  v_review_cycle text;
BEGIN
  SELECT *
  INTO v_instance
  FROM public.employee_review_instances
  WHERE id = p_review_instance_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Review instance % not found', p_review_instance_id;
  END IF;

  SELECT *
  INTO v_employee
  FROM public.labor_employees
  WHERE id = v_instance.labor_employee_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Labor employee % not found for review instance %', v_instance.labor_employee_id, p_review_instance_id;
  END IF;

  v_review_cycle := v_instance.review_cycle::text;

  SELECT r.*
  INTO v_requirement
  FROM public.labor_compliance_requirements r
  WHERE r.requirement_kind = 'review_checkpoint'
    AND r.is_active = true
    AND (
      r.scope_type = 'enterprise'
      OR r.scope_location_id = v_employee.location_id
    )
    AND (
      r.metadata->>'legacy_review_cycle' = v_review_cycle
      OR COALESCE(r.metadata->'legacy_cycles', '[]'::jsonb) ? v_review_cycle
      OR r.slug = v_review_cycle
      OR r.slug = concat('review_', split_part(v_review_cycle, '_', 1), '_day')
      OR replace(r.slug, '_day', '') = concat('review_', split_part(v_review_cycle, '_', 1))
    )
  ORDER BY
    CASE WHEN r.scope_location_id = v_employee.location_id THEN 0 ELSE 1 END,
    CASE WHEN r.parent_requirement_id IS NOT NULL THEN 0 ELSE 1 END,
    r.display_order,
    r.updated_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active compliance review checkpoint is configured for review cycle %', v_review_cycle;
  END IF;

  IF p_labor_employee_document_id IS NULL THEN
    RAISE EXCEPTION 'Review completion requires a local evidence PDF for checkpoint %', v_requirement.slug;
  END IF;

  SELECT *
  INTO v_document
  FROM public.labor_employee_documents
  WHERE id = p_labor_employee_document_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Review evidence document % not found', p_labor_employee_document_id;
  END IF;

  IF v_document.labor_employee_id <> v_instance.labor_employee_id THEN
    RAISE EXCEPTION 'Review evidence document % belongs to a different employee', p_labor_employee_document_id;
  END IF;

  IF v_document.document_type <> 'performance_review_evidence' THEN
    RAISE EXCEPTION 'Review evidence document % must be stored as performance_review_evidence', p_labor_employee_document_id;
  END IF;

  UPDATE public.labor_compliance_exceptions
  SET
    superseded_at = COALESCE(superseded_at, now()),
    updated_at = now(),
    updated_by_user_id = COALESCE(p_actor_user_id, updated_by_user_id)
  WHERE labor_employee_id = v_instance.labor_employee_id
    AND requirement_id = v_requirement.id
    AND superseded_at IS NULL;

  UPDATE public.labor_compliance_evidence_links
  SET
    is_current = false,
    superseded_at = COALESCE(superseded_at, now()),
    updated_at = now(),
    updated_by_user_id = COALESCE(p_actor_user_id, updated_by_user_id)
  WHERE labor_employee_id = v_instance.labor_employee_id
    AND requirement_id = v_requirement.id
    AND is_current = true;

  INSERT INTO public.labor_compliance_evidence_links (
    labor_employee_id,
    requirement_id,
    completed_on,
    evidence_label,
    labor_employee_document_id,
    source_table,
    source_id,
    source_note,
    is_current,
    metadata,
    created_by_user_id,
    updated_by_user_id
  ) VALUES (
    v_instance.labor_employee_id,
    v_requirement.id,
    v_completed_on,
    COALESCE(NULLIF(v_document.file_name, ''), 'Performance review evidence'),
    v_document.id,
    'employee_review_instances',
    v_instance.id,
    'Performance review completion evidence',
    true,
    jsonb_build_object(
      'review_instance_id', v_instance.id,
      'review_cycle', v_review_cycle,
      'template_id', v_instance.template_id,
      'template_version_id', v_instance.template_version_id,
      'requirement_slug', v_requirement.slug,
      'document_storage_bucket', v_document.storage_bucket,
      'document_storage_path', v_document.storage_path,
      'completed_on', v_completed_on
    ),
    p_actor_user_id,
    p_actor_user_id
  )
  RETURNING id INTO v_evidence_link_id;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'review_item_id', rr.review_item_id,
        'rating_value', rr.rating_value,
        'response_text', rr.response_text,
        'updated_at', rr.updated_at
      )
      ORDER BY ri.sequence_order
    ),
    '[]'::jsonb
  )
  INTO v_snapshot
  FROM public.employee_review_responses rr
  JOIN public.review_items ri
    ON ri.id = rr.review_item_id
  WHERE rr.review_instance_id = p_review_instance_id;

  UPDATE public.employee_review_instances
  SET
    status = 'completed',
    completed_at = v_completed_on::timestamptz,
    reviewer_user_id = COALESCE(p_actor_user_id, reviewer_user_id),
    reviewer_name = COALESCE(NULLIF(trim(COALESCE(p_actor_name, '')), ''), reviewer_name),
    responses_snapshot = v_snapshot,
    metadata = (COALESCE(metadata, '{}'::jsonb) - 'completion_waiver' - 'completion_mode') || jsonb_build_object(
      'completion_mode', 'completed',
      'completion_evidence', jsonb_build_object(
        'evidence_link_id', v_evidence_link_id,
        'document_id', v_document.id,
        'file_name', v_document.file_name,
        'requirement_id', v_requirement.id,
        'requirement_slug', v_requirement.slug,
        'completed_on', v_completed_on,
        'uploaded_at', v_document.uploaded_at
      )
    ),
    updated_at = now(),
    updated_by_user_id = COALESCE(p_actor_user_id, updated_by_user_id)
  WHERE id = p_review_instance_id
  RETURNING *
  INTO v_instance;

  RETURN v_instance;
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_employee_review_instance(uuid, uuid, text, uuid, date) TO authenticated;

COMMENT ON FUNCTION public.complete_employee_review_instance(uuid, uuid, text, uuid, date) IS
  'Completes a performance review only after a local labor_employee_documents evidence file is linked, clearing any prior waiver state for the checkpoint.';

COMMIT;
