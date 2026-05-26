-- Canonical per-cell compliance controls: due-date overrides, notes, and
-- state transitions that preserve the audit trail.

BEGIN;

CREATE TABLE IF NOT EXISTS public.labor_compliance_due_date_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  labor_employee_id uuid NOT NULL REFERENCES public.labor_employees(id) ON DELETE CASCADE,
  requirement_id uuid NOT NULL REFERENCES public.labor_compliance_requirements(id) ON DELETE RESTRICT,
  due_date date NOT NULL,
  reason text NOT NULL DEFAULT 'Due date set from Compliance grid',
  is_current boolean NOT NULL DEFAULT true,
  superseded_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid,
  updated_by_user_id uuid
);

CREATE INDEX IF NOT EXISTS labor_compliance_due_date_overrides_employee_requirement_idx
  ON public.labor_compliance_due_date_overrides (labor_employee_id, requirement_id, is_current, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS labor_compliance_due_date_overrides_current_unique_idx
  ON public.labor_compliance_due_date_overrides (labor_employee_id, requirement_id)
  WHERE is_current = true;

CREATE TABLE IF NOT EXISTS public.labor_compliance_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  labor_employee_id uuid NOT NULL REFERENCES public.labor_employees(id) ON DELETE CASCADE,
  requirement_id uuid NOT NULL REFERENCES public.labor_compliance_requirements(id) ON DELETE RESTRICT,
  note_text text NOT NULL,
  audit_event_id uuid REFERENCES public.labor_compliance_audit_events(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid,
  created_by_name text,
  CONSTRAINT labor_compliance_notes_note_text_chk CHECK (btrim(note_text) <> '')
);

CREATE INDEX IF NOT EXISTS labor_compliance_notes_employee_requirement_idx
  ON public.labor_compliance_notes (labor_employee_id, requirement_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_labor_compliance_due_date_overrides_updated ON public.labor_compliance_due_date_overrides;
CREATE TRIGGER trg_labor_compliance_due_date_overrides_updated
  BEFORE UPDATE ON public.labor_compliance_due_date_overrides
  FOR EACH ROW EXECUTE FUNCTION public.training_updated_at_trigger();

DROP TRIGGER IF EXISTS trg_labor_compliance_due_date_overrides_audit ON public.labor_compliance_due_date_overrides;
CREATE TRIGGER trg_labor_compliance_due_date_overrides_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.labor_compliance_due_date_overrides
  FOR EACH ROW EXECUTE FUNCTION public.audit_labor_compliance_mutation();

DROP TRIGGER IF EXISTS trg_labor_compliance_notes_audit ON public.labor_compliance_notes;
CREATE TRIGGER trg_labor_compliance_notes_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.labor_compliance_notes
  FOR EACH ROW EXECUTE FUNCTION public.audit_labor_compliance_mutation();

ALTER TABLE public.labor_compliance_due_date_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labor_compliance_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS labor_compliance_due_date_overrides_read ON public.labor_compliance_due_date_overrides;
CREATE POLICY labor_compliance_due_date_overrides_read ON public.labor_compliance_due_date_overrides
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.labor_employees e
      WHERE e.id = labor_compliance_due_date_overrides.labor_employee_id
        AND public.labor_compliance_can_view(e.location_id)
    )
  );

DROP POLICY IF EXISTS labor_compliance_due_date_overrides_write ON public.labor_compliance_due_date_overrides;
DROP POLICY IF EXISTS labor_compliance_due_date_overrides_insert ON public.labor_compliance_due_date_overrides;
CREATE POLICY labor_compliance_due_date_overrides_insert ON public.labor_compliance_due_date_overrides
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.labor_employees e
      WHERE e.id = labor_compliance_due_date_overrides.labor_employee_id
        AND public.labor_compliance_can_update_evidence(e.location_id)
    )
    AND public.labor_compliance_requirement_matches_employee_location(labor_employee_id, requirement_id)
  );

DROP POLICY IF EXISTS labor_compliance_due_date_overrides_update ON public.labor_compliance_due_date_overrides;
CREATE POLICY labor_compliance_due_date_overrides_update ON public.labor_compliance_due_date_overrides
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.labor_employees e
      WHERE e.id = labor_compliance_due_date_overrides.labor_employee_id
        AND public.labor_compliance_can_update_evidence(e.location_id)
    )
    AND public.labor_compliance_requirement_matches_employee_location(labor_employee_id, requirement_id)
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.labor_employees e
      WHERE e.id = labor_compliance_due_date_overrides.labor_employee_id
        AND public.labor_compliance_can_update_evidence(e.location_id)
    )
    AND public.labor_compliance_requirement_matches_employee_location(labor_employee_id, requirement_id)
  );

DROP POLICY IF EXISTS labor_compliance_notes_read ON public.labor_compliance_notes;
CREATE POLICY labor_compliance_notes_read ON public.labor_compliance_notes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.labor_employees e
      WHERE e.id = labor_compliance_notes.labor_employee_id
        AND public.labor_compliance_can_view(e.location_id)
    )
  );

DROP POLICY IF EXISTS labor_compliance_notes_insert ON public.labor_compliance_notes;
CREATE POLICY labor_compliance_notes_insert ON public.labor_compliance_notes
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.labor_employees e
      WHERE e.id = labor_compliance_notes.labor_employee_id
        AND public.labor_compliance_can_update_evidence(e.location_id)
    )
    AND public.labor_compliance_requirement_matches_employee_location(labor_employee_id, requirement_id)
  );

REVOKE ALL ON TABLE public.labor_compliance_due_date_overrides FROM PUBLIC;
REVOKE ALL ON TABLE public.labor_compliance_notes FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE public.labor_compliance_due_date_overrides TO authenticated;
GRANT SELECT, INSERT ON TABLE public.labor_compliance_notes TO authenticated;

CREATE OR REPLACE FUNCTION public.set_labor_compliance_due_date(
  p_labor_employee_id uuid,
  p_requirement_id uuid,
  p_due_date date DEFAULT NULL,
  p_note_text text DEFAULT NULL,
  p_actor_user_id uuid DEFAULT NULL,
  p_actor_name text DEFAULT NULL
)
RETURNS public.labor_compliance_due_date_overrides
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_employee public.labor_employees%ROWTYPE;
  v_requirement public.labor_compliance_requirements%ROWTYPE;
  v_override public.labor_compliance_due_date_overrides%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  SELECT * INTO v_employee
  FROM public.labor_employees
  WHERE id = p_labor_employee_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Labor employee % not found', p_labor_employee_id;
  END IF;

  IF NOT public.labor_compliance_can_update_evidence(v_employee.location_id) THEN
    RAISE EXCEPTION 'Insufficient permission to update compliance due dates for location %', v_employee.location_id
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_requirement
  FROM public.labor_compliance_requirements
  WHERE id = p_requirement_id
    AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Compliance requirement % not found', p_requirement_id;
  END IF;

  IF NOT public.labor_compliance_requirement_matches_employee_location(p_labor_employee_id, p_requirement_id) THEN
    RAISE EXCEPTION 'Compliance requirement % does not apply to employee %', p_requirement_id, p_labor_employee_id;
  END IF;

  UPDATE public.labor_compliance_due_date_overrides
  SET
    is_current = false,
    superseded_at = COALESCE(superseded_at, v_now),
    updated_at = v_now,
    updated_by_user_id = COALESCE(p_actor_user_id, auth.uid(), updated_by_user_id)
  WHERE labor_employee_id = p_labor_employee_id
    AND requirement_id = p_requirement_id
    AND is_current = true;

  IF p_due_date IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.labor_compliance_due_date_overrides (
    labor_employee_id,
    requirement_id,
    due_date,
    reason,
    is_current,
    metadata,
    created_by_user_id,
    updated_by_user_id
  )
  VALUES (
    p_labor_employee_id,
    p_requirement_id,
    p_due_date,
    COALESCE(NULLIF(btrim(COALESCE(p_note_text, '')), ''), 'Due date set from Compliance grid'),
    true,
    jsonb_build_object(
      'source_module', 'compliance_grid',
      'actor_user_id', COALESCE(p_actor_user_id, auth.uid()),
      'actor_name', NULLIF(btrim(COALESCE(p_actor_name, '')), ''),
      'requirement_slug', v_requirement.slug
    ),
    COALESCE(p_actor_user_id, auth.uid()),
    COALESCE(p_actor_user_id, auth.uid())
  )
  RETURNING *
  INTO v_override;

  RETURN v_override;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_labor_compliance_checkpoint_state(
  p_labor_employee_id uuid,
  p_requirement_id uuid,
  p_state text,
  p_action_date date DEFAULT NULL,
  p_labor_employee_document_id uuid DEFAULT NULL,
  p_review_instance_id uuid DEFAULT NULL,
  p_note_text text DEFAULT NULL,
  p_actor_user_id uuid DEFAULT NULL,
  p_actor_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_employee public.labor_employees%ROWTYPE;
  v_requirement public.labor_compliance_requirements%ROWTYPE;
  v_document public.labor_employee_documents%ROWTYPE;
  v_review_instance public.employee_review_instances%ROWTYPE;
  v_state text := lower(btrim(COALESCE(p_state, '')));
  v_action_date date := COALESCE(p_action_date, CURRENT_DATE);
  v_now timestamptz := now();
  v_actor_user_id uuid := COALESCE(p_actor_user_id, auth.uid());
  v_actor_name text := NULLIF(btrim(COALESCE(p_actor_name, '')), '');
  v_evidence_link_id uuid;
  v_exception_id uuid;
BEGIN
  IF v_state NOT IN ('completed', 'waived', 'not_started') THEN
    RAISE EXCEPTION 'Unsupported compliance checkpoint state %', p_state USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_employee
  FROM public.labor_employees
  WHERE id = p_labor_employee_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Labor employee % not found', p_labor_employee_id;
  END IF;

  IF NOT public.labor_compliance_can_update_evidence(v_employee.location_id) THEN
    RAISE EXCEPTION 'Insufficient permission to update compliance checkpoint for location %', v_employee.location_id
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_requirement
  FROM public.labor_compliance_requirements
  WHERE id = p_requirement_id
    AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Compliance requirement % not found', p_requirement_id;
  END IF;

  IF NOT public.labor_compliance_requirement_matches_employee_location(p_labor_employee_id, p_requirement_id) THEN
    RAISE EXCEPTION 'Compliance requirement % does not apply to employee %', p_requirement_id, p_labor_employee_id;
  END IF;

  IF p_labor_employee_document_id IS NOT NULL THEN
    SELECT * INTO v_document
    FROM public.labor_employee_documents
    WHERE id = p_labor_employee_document_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Compliance evidence document % not found', p_labor_employee_document_id;
    END IF;

    IF v_document.labor_employee_id <> p_labor_employee_id THEN
      RAISE EXCEPTION 'Compliance evidence document % belongs to a different employee', p_labor_employee_document_id;
    END IF;

    IF v_document.document_type <> 'performance_review_evidence' THEN
      RAISE EXCEPTION 'Compliance evidence document % must be stored as performance_review_evidence', p_labor_employee_document_id;
    END IF;
  END IF;

  IF v_state = 'completed'
    AND v_requirement.evidence_policy = 'file_required'
    AND p_labor_employee_document_id IS NULL THEN
    RAISE EXCEPTION 'Compliance checkpoint % requires a PDF evidence file before completion', v_requirement.slug;
  END IF;

  IF p_review_instance_id IS NOT NULL THEN
    SELECT * INTO v_review_instance
    FROM public.employee_review_instances
    WHERE id = p_review_instance_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Review instance % not found', p_review_instance_id;
    END IF;

    IF v_review_instance.labor_employee_id <> p_labor_employee_id THEN
      RAISE EXCEPTION 'Review instance % belongs to a different employee', p_review_instance_id;
    END IF;
  END IF;

  UPDATE public.labor_compliance_exceptions
  SET
    superseded_at = COALESCE(superseded_at, v_now),
    updated_at = v_now,
    updated_by_user_id = COALESCE(v_actor_user_id, updated_by_user_id)
  WHERE labor_employee_id = p_labor_employee_id
    AND requirement_id = p_requirement_id
    AND superseded_at IS NULL;

  UPDATE public.labor_compliance_evidence_links
  SET
    is_current = false,
    superseded_at = COALESCE(superseded_at, v_now),
    updated_at = v_now,
    updated_by_user_id = COALESCE(v_actor_user_id, updated_by_user_id)
  WHERE labor_employee_id = p_labor_employee_id
    AND requirement_id = p_requirement_id
    AND is_current = true;

  IF v_state = 'waived' THEN
    INSERT INTO public.labor_compliance_exceptions (
      labor_employee_id,
      requirement_id,
      exception_kind,
      original_due_date,
      effective_on,
      reason,
      approved_by_user_id,
      approved_by_name,
      metadata,
      created_by_user_id,
      updated_by_user_id
    )
    VALUES (
      p_labor_employee_id,
      p_requirement_id,
      'waived',
      NULL,
      v_action_date,
      COALESCE(NULLIF(btrim(COALESCE(p_note_text, '')), ''), 'Waived from Compliance grid'),
      v_actor_user_id,
      v_actor_name,
      jsonb_build_object(
        'source_module', 'compliance_grid',
        'completion_mode', 'waived',
        'actor_user_id', v_actor_user_id,
        'actor_name', v_actor_name,
        'requirement_slug', v_requirement.slug,
        'review_instance_id', p_review_instance_id
      ),
      v_actor_user_id,
      v_actor_user_id
    )
    RETURNING id INTO v_exception_id;

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
    )
    VALUES (
      p_labor_employee_id,
      p_requirement_id,
      v_action_date,
      NULL,
      NULL,
      CASE WHEN p_review_instance_id IS NOT NULL THEN 'employee_review_instances' ELSE 'labor_compliance_exceptions' END,
      COALESCE(p_review_instance_id, v_exception_id),
      'Waived in Compliance grid',
      true,
      jsonb_build_object(
        'source_module', 'compliance_grid',
        'completion_mode', 'waived',
        'completion_waiver', jsonb_build_object(
          'waived_on', v_action_date,
          'waived_at', v_now,
          'actor_user_id', v_actor_user_id,
          'actor_name', v_actor_name
        ),
        'exception_id', v_exception_id,
        'requirement_slug', v_requirement.slug,
        'review_instance_id', p_review_instance_id
      ),
      v_actor_user_id,
      v_actor_user_id
    )
    RETURNING id INTO v_evidence_link_id;

    IF p_review_instance_id IS NOT NULL THEN
      UPDATE public.employee_review_instances
      SET
        status = 'completed',
        completed_at = v_action_date::timestamptz,
        reviewer_user_id = COALESCE(v_actor_user_id, reviewer_user_id),
        reviewer_name = COALESCE(v_actor_name, reviewer_name),
        metadata = (COALESCE(metadata, '{}'::jsonb) - 'completion_evidence') || jsonb_build_object(
          'completion_mode', 'waived',
          'completion_waiver', jsonb_build_object(
            'waived_on', v_action_date,
            'waived_at', v_now,
            'actor_user_id', v_actor_user_id,
            'actor_name', v_actor_name,
            'requirement_id', p_requirement_id,
            'requirement_slug', v_requirement.slug
          )
        ),
        updated_at = v_now,
        updated_by_user_id = COALESCE(v_actor_user_id, updated_by_user_id)
      WHERE id = p_review_instance_id;
    END IF;
  ELSIF v_state = 'completed' THEN
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
    )
    VALUES (
      p_labor_employee_id,
      p_requirement_id,
      v_action_date,
      COALESCE(NULLIF(v_document.file_name, ''), 'Compliance completion'),
      p_labor_employee_document_id,
      CASE WHEN p_review_instance_id IS NOT NULL THEN 'employee_review_instances' ELSE 'labor_compliance_requirements' END,
      COALESCE(p_review_instance_id, p_requirement_id),
      'Completed in Compliance grid',
      true,
      jsonb_build_object(
        'source_module', 'compliance_grid',
        'completion_mode', 'completed',
        'actor_user_id', v_actor_user_id,
        'actor_name', v_actor_name,
        'requirement_slug', v_requirement.slug,
        'review_instance_id', p_review_instance_id,
        'document_storage_bucket', v_document.storage_bucket,
        'document_storage_path', v_document.storage_path
      ),
      v_actor_user_id,
      v_actor_user_id
    )
    RETURNING id INTO v_evidence_link_id;
  ELSIF v_state = 'not_started' AND p_review_instance_id IS NOT NULL THEN
    UPDATE public.employee_review_instances
    SET
      status = 'scheduled',
      completed_at = NULL,
      metadata = COALESCE(metadata, '{}'::jsonb) - 'completion_evidence' - 'completion_waiver' - 'completion_mode',
      updated_at = v_now,
      updated_by_user_id = COALESCE(v_actor_user_id, updated_by_user_id)
    WHERE id = p_review_instance_id;
  END IF;

  IF NULLIF(btrim(COALESCE(p_note_text, '')), '') IS NOT NULL THEN
    INSERT INTO public.labor_compliance_notes (
      labor_employee_id,
      requirement_id,
      note_text,
      metadata,
      created_by_user_id,
      created_by_name
    )
    VALUES (
      p_labor_employee_id,
      p_requirement_id,
      btrim(p_note_text),
      jsonb_build_object(
        'source_module', 'compliance_grid',
        'state_action', v_state,
        'action_date', v_action_date,
        'requirement_slug', v_requirement.slug,
        'review_instance_id', p_review_instance_id
      ),
      v_actor_user_id,
      v_actor_name
    );
  END IF;

  RETURN jsonb_build_object(
    'labor_employee_id', p_labor_employee_id,
    'requirement_id', p_requirement_id,
    'state', v_state,
    'action_date', v_action_date,
    'evidence_link_id', v_evidence_link_id,
    'exception_id', v_exception_id,
    'review_instance_id', p_review_instance_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.append_labor_compliance_note(
  p_labor_employee_id uuid,
  p_requirement_id uuid,
  p_note_text text,
  p_audit_event_id uuid DEFAULT NULL,
  p_actor_user_id uuid DEFAULT NULL,
  p_actor_name text DEFAULT NULL
)
RETURNS public.labor_compliance_notes
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_employee public.labor_employees%ROWTYPE;
  v_requirement public.labor_compliance_requirements%ROWTYPE;
  v_note public.labor_compliance_notes%ROWTYPE;
  v_note_text text := btrim(COALESCE(p_note_text, ''));
BEGIN
  IF v_note_text = '' THEN
    RAISE EXCEPTION 'Note text is required';
  END IF;

  SELECT * INTO v_employee
  FROM public.labor_employees
  WHERE id = p_labor_employee_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Labor employee % not found', p_labor_employee_id;
  END IF;

  IF NOT public.labor_compliance_can_update_evidence(v_employee.location_id) THEN
    RAISE EXCEPTION 'Insufficient permission to add compliance notes for location %', v_employee.location_id
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_requirement
  FROM public.labor_compliance_requirements
  WHERE id = p_requirement_id
    AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Compliance requirement % not found', p_requirement_id;
  END IF;

  IF NOT public.labor_compliance_requirement_matches_employee_location(p_labor_employee_id, p_requirement_id) THEN
    RAISE EXCEPTION 'Compliance requirement % does not apply to employee %', p_requirement_id, p_labor_employee_id;
  END IF;

  INSERT INTO public.labor_compliance_notes (
    labor_employee_id,
    requirement_id,
    note_text,
    audit_event_id,
    metadata,
    created_by_user_id,
    created_by_name
  )
  VALUES (
    p_labor_employee_id,
    p_requirement_id,
    v_note_text,
    p_audit_event_id,
    jsonb_build_object(
      'source_module', 'compliance_grid',
      'requirement_slug', v_requirement.slug
    ),
    COALESCE(p_actor_user_id, auth.uid()),
    NULLIF(btrim(COALESCE(p_actor_name, '')), '')
  )
  RETURNING *
  INTO v_note;

  RETURN v_note;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_labor_compliance_board(
  p_location_id uuid,
  p_as_of date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_as_of date := COALESCE(p_as_of, CURRENT_DATE);
  v_result jsonb;
BEGIN
  IF p_location_id IS NULL THEN
    RAISE EXCEPTION 'p_location_id is required' USING ERRCODE = '22023';
  END IF;

  IF NOT public.labor_compliance_can_view(p_location_id) THEN
    RAISE EXCEPTION 'Insufficient permission to view labor compliance board for location %', p_location_id
      USING ERRCODE = '42501';
  END IF;

  WITH candidate_requirements AS (
    SELECT
      r.*,
      COALESCE(r.parent_requirement_id, r.id) AS policy_key,
      CASE WHEN r.scope_type = 'location' THEN 1 ELSE 0 END AS scope_rank
    FROM public.labor_compliance_requirements r
    WHERE r.is_active = true
      AND (
        (r.scope_type = 'enterprise' AND r.scope_location_id IS NULL)
        OR (r.scope_type = 'location' AND r.scope_location_id = p_location_id)
      )
  ),
  effective_requirements AS (
    SELECT *
    FROM (
      SELECT
        cr.*,
        row_number() OVER (
          PARTITION BY cr.policy_key
          ORDER BY cr.scope_rank DESC, cr.updated_at DESC, cr.created_at DESC, cr.id
        ) AS rn
      FROM candidate_requirements cr
    ) ranked
    WHERE ranked.rn = 1
  ),
  employees AS (
    SELECT e.*
    FROM public.labor_employees e
    WHERE e.location_id = p_location_id
      AND COALESCE(e.employment_status::text, 'active') NOT IN ('terminated', 'quit', 'archived')
      AND (e.end_date IS NULL OR e.end_date >= v_as_of)
  ),
  applicable AS (
    SELECT
      e.id AS labor_employee_id,
      er.*
    FROM employees e
    CROSS JOIN effective_requirements er
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.labor_compliance_role_applicability ra
      WHERE ra.requirement_id = er.id
        AND ra.is_required = true
    )
    OR EXISTS (
      SELECT 1
      FROM public.labor_compliance_role_applicability ra
      WHERE ra.requirement_id = er.id
        AND ra.is_required = true
        AND (
          lower(btrim(ra.role_name)) = lower(btrim(COALESCE(e.position_title, '')))
          OR lower(btrim(COALESCE(e.position_title, ''))) LIKE '%' || lower(btrim(ra.role_name)) || '%'
        )
    )
  ),
  latest_evidence AS (
    SELECT DISTINCT ON (el.labor_employee_id, COALESCE(rr.parent_requirement_id, rr.id))
      el.*,
      COALESCE(rr.parent_requirement_id, rr.id) AS policy_key
    FROM public.labor_compliance_evidence_links el
    JOIN public.labor_compliance_requirements rr
      ON rr.id = el.requirement_id
    WHERE el.is_current = true
      AND el.superseded_at IS NULL
      AND public.labor_compliance_requirement_matches_employee_location(el.labor_employee_id, el.requirement_id)
    ORDER BY
      el.labor_employee_id,
      COALESCE(rr.parent_requirement_id, rr.id),
      el.completed_on DESC NULLS LAST,
      el.updated_at DESC,
      el.created_at DESC
  ),
  latest_exceptions AS (
    SELECT DISTINCT ON (ex.labor_employee_id, COALESCE(rr.parent_requirement_id, rr.id))
      ex.*,
      COALESCE(rr.parent_requirement_id, rr.id) AS policy_key
    FROM public.labor_compliance_exceptions ex
    JOIN public.labor_compliance_requirements rr
      ON rr.id = ex.requirement_id
    WHERE ex.effective_on <= v_as_of
      AND ex.superseded_at IS NULL
      AND public.labor_compliance_requirement_matches_employee_location(ex.labor_employee_id, ex.requirement_id)
      AND (ex.expires_on IS NULL OR ex.expires_on >= v_as_of)
    ORDER BY
      ex.labor_employee_id,
      COALESCE(rr.parent_requirement_id, rr.id),
      ex.effective_on DESC,
      ex.created_at DESC
  ),
  latest_due_overrides AS (
    SELECT DISTINCT ON (d.labor_employee_id, COALESCE(rr.parent_requirement_id, rr.id))
      d.*,
      COALESCE(rr.parent_requirement_id, rr.id) AS policy_key
    FROM public.labor_compliance_due_date_overrides d
    JOIN public.labor_compliance_requirements rr
      ON rr.id = d.requirement_id
    WHERE d.is_current = true
      AND d.superseded_at IS NULL
      AND public.labor_compliance_requirement_matches_employee_location(d.labor_employee_id, d.requirement_id)
    ORDER BY
      d.labor_employee_id,
      COALESCE(rr.parent_requirement_id, rr.id),
      d.updated_at DESC,
      d.created_at DESC
  ),
  legacy_certifications AS (
    SELECT DISTINCT ON (ec.labor_employee_id, er.policy_key)
      ec.labor_employee_id,
      er.policy_key,
      ec.id AS legacy_certification_id,
      ec.completed_on,
      ec.expires_on,
      ec.labor_employee_document_id,
      ec.external_document_url,
      ec.source_note
    FROM effective_requirements er
    JOIN public.certification_requirements cr
      ON cr.slug IN (
        SELECT jsonb_array_elements_text(
          CASE
            WHEN jsonb_typeof(er.metadata->'legacy_slugs') = 'array' THEN er.metadata->'legacy_slugs'
            ELSE '[]'::jsonb
          END
        )
      )
    JOIN public.employee_certifications ec
      ON ec.requirement_id = cr.id
    WHERE er.requirement_kind = 'training'
    ORDER BY ec.labor_employee_id, er.policy_key, ec.completed_on DESC, ec.created_at DESC
  ),
  legacy_reviews AS (
    SELECT DISTINCT ON (eri.labor_employee_id, er.policy_key)
      eri.labor_employee_id,
      er.policy_key,
      eri.id AS legacy_review_instance_id,
      eri.due_date,
      eri.completed_at,
      eri.status::text AS status
    FROM effective_requirements er
    JOIN public.employee_review_instances eri
      ON eri.review_cycle::text = er.metadata->>'legacy_review_cycle'
    WHERE er.requirement_kind = 'review_checkpoint'
    ORDER BY eri.labor_employee_id, er.policy_key, COALESCE(eri.completed_at, eri.updated_at, eri.created_at) DESC
  ),
  status_base AS (
    SELECT
      a.labor_employee_id,
      a.id AS requirement_id,
      a.parent_requirement_id,
      a.policy_key,
      a.slug,
      a.title,
      a.requirement_kind,
      a.evidence_policy,
      a.renewal_due_date_required,
      a.due_rule,
      a.display_group,
      a.display_order,
      a.metadata AS requirement_metadata,
      le.id AS evidence_link_id,
      ld.id AS due_date_override_id,
      COALESCE(le.completed_on, lc.completed_on, CASE WHEN lr.status = 'completed' THEN lr.completed_at::date ELSE NULL END) AS completed_on,
      COALESCE(le.renewal_due_date, lc.expires_on) AS renewal_due_date,
      COALESCE(
        ld.due_date,
        CASE
          WHEN lr.due_date IS NOT NULL THEN lr.due_date
          WHEN a.due_rule->>'anchor' = 'start_date'
            AND a.due_rule ? 'offset_days'
            AND e.start_date IS NOT NULL
            THEN e.start_date + ((a.due_rule->>'offset_days')::integer)
          WHEN a.renewal_due_date_required THEN COALESCE(le.renewal_due_date, lc.expires_on)
          ELSE NULL::date
        END
      ) AS due_date,
      lx.original_due_date,
      lx.adjusted_due_date,
      lx.exception_kind,
      lx.reason AS exception_reason,
      lc.legacy_certification_id,
      lr.legacy_review_instance_id,
      lr.status AS legacy_review_status,
      COALESCE(le.labor_employee_document_id, lc.labor_employee_document_id) AS labor_employee_document_id,
      COALESCE(le.external_evidence_url, lc.external_document_url) AS external_evidence_url,
      COALESCE(le.source_note, lc.source_note) AS source_note
    FROM applicable a
    JOIN employees e
      ON e.id = a.labor_employee_id
    LEFT JOIN latest_evidence le
      ON le.labor_employee_id = a.labor_employee_id
     AND le.policy_key = a.policy_key
    LEFT JOIN latest_exceptions lx
      ON lx.labor_employee_id = a.labor_employee_id
     AND lx.policy_key = a.policy_key
    LEFT JOIN latest_due_overrides ld
      ON ld.labor_employee_id = a.labor_employee_id
     AND ld.policy_key = a.policy_key
    LEFT JOIN legacy_certifications lc
      ON lc.labor_employee_id = a.labor_employee_id
     AND lc.policy_key = a.policy_key
    LEFT JOIN legacy_reviews lr
      ON lr.labor_employee_id = a.labor_employee_id
     AND lr.policy_key = a.policy_key
  ),
  status_rows AS (
    SELECT
      sb.*,
      CASE
        WHEN sb.exception_kind = 'not_applicable_override' THEN 'not_applicable'
        WHEN sb.exception_kind = 'waived' THEN 'waived'
        WHEN sb.exception_kind = 'historical_cleanup' THEN 'historical_cleanup'
        WHEN sb.legacy_review_status = 'completed' THEN 'complete'
        WHEN sb.completed_on IS NOT NULL
          AND sb.renewal_due_date_required = true
          AND sb.renewal_due_date IS NULL
          THEN 'missing_renewal_due_date'
        WHEN sb.completed_on IS NOT NULL
          AND sb.renewal_due_date_required = true
          AND sb.renewal_due_date < v_as_of
          THEN 'expired'
        WHEN sb.completed_on IS NOT NULL
          AND (sb.renewal_due_date_required = false OR sb.renewal_due_date >= v_as_of)
          THEN 'complete'
        WHEN sb.legacy_review_status IN ('in_progress', 'scheduled') THEN sb.legacy_review_status
        WHEN sb.due_date IS NOT NULL AND sb.due_date < v_as_of THEN 'overdue'
        WHEN sb.due_date IS NOT NULL THEN 'scheduled'
        ELSE 'not_started'
      END AS compliance_status
    FROM status_base sb
  ),
  employee_rows AS (
    SELECT
      e.id,
      e.full_name,
      e.position_title,
      e.employment_status::text AS employment_status,
      e.start_date,
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'requirement_id', sr.requirement_id,
            'parent_requirement_id', sr.parent_requirement_id,
            'slug', sr.slug,
            'title', sr.title,
            'requirement_kind', sr.requirement_kind,
            'status', sr.compliance_status,
            'due_date', sr.due_date,
            'due_date_override_id', sr.due_date_override_id,
            'original_due_date', COALESCE(sr.original_due_date, sr.due_date),
            'adjusted_due_date', sr.adjusted_due_date,
            'completed_on', sr.completed_on,
            'renewal_due_date', sr.renewal_due_date,
            'evidence_policy', sr.evidence_policy,
            'renewal_due_date_required', sr.renewal_due_date_required,
            'evidence_link_id', sr.evidence_link_id,
            'labor_employee_document_id', sr.labor_employee_document_id,
            'external_evidence_url', sr.external_evidence_url,
            'source_note', sr.source_note,
            'exception_kind', sr.exception_kind,
            'exception_reason', sr.exception_reason,
            'compatibility', jsonb_strip_nulls(jsonb_build_object(
              'legacy_certification_id', sr.legacy_certification_id,
              'legacy_review_instance_id', sr.legacy_review_instance_id,
              'legacy_review_status', sr.legacy_review_status
            ))
          )
          ORDER BY sr.display_group, sr.display_order, sr.title
        ) FILTER (WHERE sr.requirement_id IS NOT NULL),
        '[]'::jsonb
      ) AS requirements
    FROM employees e
    LEFT JOIN status_rows sr
      ON sr.labor_employee_id = e.id
    GROUP BY e.id, e.full_name, e.position_title, e.employment_status, e.start_date
  )
  SELECT jsonb_build_object(
    'location_id', p_location_id,
    'as_of', v_as_of,
    'generated_at', now(),
    'requirements', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', er.id,
          'parent_requirement_id', er.parent_requirement_id,
          'slug', er.slug,
          'title', er.title,
          'requirement_kind', er.requirement_kind,
          'scope_type', er.scope_type,
          'scope_location_id', er.scope_location_id,
          'evidence_policy', er.evidence_policy,
          'renewal_due_date_required', er.renewal_due_date_required,
          'due_rule', er.due_rule,
          'display_group', er.display_group,
          'display_order', er.display_order,
          'metadata', er.metadata
        )
        ORDER BY er.display_group, er.display_order, er.title
      )
      FROM effective_requirements er
    ), '[]'::jsonb),
    'employees', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'labor_employee_id', erows.id,
          'full_name', erows.full_name,
          'position_title', erows.position_title,
          'employment_status', erows.employment_status,
          'start_date', erows.start_date,
          'requirements', erows.requirements
        )
        ORDER BY erows.full_name, erows.id
      )
      FROM employee_rows erows
    ), '[]'::jsonb)
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_labor_compliance_board(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_labor_compliance_board(uuid, date) TO authenticated;

GRANT EXECUTE ON FUNCTION public.set_labor_compliance_due_date(uuid, uuid, date, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_labor_compliance_checkpoint_state(uuid, uuid, text, date, uuid, uuid, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.append_labor_compliance_note(uuid, uuid, text, uuid, uuid, text) TO authenticated;

COMMENT ON TABLE public.labor_compliance_due_date_overrides IS
  'Current and historical per-employee due date overrides for compliance requirements. Current rows feed get_labor_compliance_board; superseded rows remain auditable.';
COMMENT ON TABLE public.labor_compliance_notes IS
  'Append-only notes attached to a specific employee/requirement compliance cell.';
COMMENT ON FUNCTION public.set_labor_compliance_checkpoint_state(uuid, uuid, text, date, uuid, uuid, text, uuid, text) IS
  'Sets a compliance cell to completed, waived, or not_started while superseding current evidence/exceptions instead of deleting historical rows.';

COMMIT;
