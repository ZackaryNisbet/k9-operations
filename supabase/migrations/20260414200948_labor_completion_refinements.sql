-- Labor completion refinements
-- - simplify labor employee create/update contracts around start/end dates
-- - derive active/inactive labor state from end_date for dashboard consumption
-- - add canonical labor dashboard snapshot RPC
-- - add review template draft/publish/restore lifecycle and review response RPCs

-- Clear roster-level trainer/manager ownership fields; labor actions are now
-- attributed to the acting account rather than assigned per employee.
UPDATE public.labor_employees
SET
  first_shift_date = NULL,
  assigned_trainer_user_id = NULL,
  assigned_trainer_name = NULL,
  assigned_manager_user_id = NULL,
  assigned_manager_name = NULL
WHERE first_shift_date IS NOT NULL
   OR assigned_trainer_user_id IS NOT NULL
   OR assigned_trainer_name IS NOT NULL
   OR assigned_manager_user_id IS NOT NULL
   OR assigned_manager_name IS NOT NULL;

CREATE OR REPLACE VIEW public.labor_employee_status_snapshot AS
WITH review_due_dates AS (
  SELECT
    e.id AS labor_employee_id,
    e.start_date + 30 AS review_30_due_date,
    e.start_date + 60 AS review_60_due_date,
    e.start_date + 90 AS review_90_due_date
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
    ec.expires_on,
    ec.external_document_url,
    ec.source_note
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
),
note_rollup AS (
  SELECT
    n.labor_employee_id,
    COUNT(*) FILTER (WHERE n.created_at >= now() - interval '7 days') AS recent_employee_note_count_7d,
    MAX(n.created_at) AS last_employee_note_at
  FROM public.labor_employee_notes n
  GROUP BY n.labor_employee_id
)
SELECT
  e.id AS labor_employee_id,
  e.location_id,
  e.linked_user_id,
  e.full_name,
  e.position_title,
  CASE
    WHEN e.end_date IS NULL THEN 'active'::public.labor_employment_status
    WHEN e.employment_status IN ('terminated', 'quit', 'archived') THEN e.employment_status
    ELSE 'terminated'::public.labor_employment_status
  END AS employment_status,
  e.start_date,
  NULL::date AS first_shift_date,
  e.end_date,
  NULL::text AS assigned_trainer_name,
  NULL::text AS assigned_manager_name,
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
  ar.last_attendance_incident_at,
  (e.end_date IS NULL) AS is_active,
  CASE
    WHEN e.end_date IS NOT NULL THEN false
    WHEN COALESCE(tr.open_training_record_count, 0) > 0 THEN false
    WHEN COALESCE(tr.completed_training_record_count, 0) > 0 THEN true
    ELSE false
  END AS training_compliance_flag,
  cc.external_document_url AS cpr_document_url,
  cc.source_note AS cpr_source_note,
  COALESCE(nr.recent_employee_note_count_7d, 0) AS recent_employee_note_count_7d,
  nr.last_employee_note_at
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
LEFT JOIN note_rollup nr
  ON nr.labor_employee_id = e.id
LEFT JOIN attendance_rollup ar
  ON ar.labor_employee_id = e.id;

DROP FUNCTION IF EXISTS public.create_labor_employee(text, text, text, date, date, uuid, text, text, uuid, text);
DROP FUNCTION IF EXISTS public.update_labor_employee(uuid, text, text, labor_employment_status, date, date, date, text, text, uuid);

CREATE OR REPLACE FUNCTION public.create_labor_employee(
  p_location_ref text,
  p_full_name text,
  p_position_title text,
  p_start_date date,
  p_end_date date DEFAULT NULL,
  p_linked_user_id uuid DEFAULT NULL,
  p_actor_user_id uuid DEFAULT NULL,
  p_actor_name text DEFAULT NULL
)
RETURNS public.labor_employees
LANGUAGE plpgsql
AS $$
DECLARE
  v_location_id uuid;
  v_employee public.labor_employees%ROWTYPE;
  v_full_name text := trim(COALESCE(p_full_name, ''));
  v_position_title text := trim(COALESCE(p_position_title, ''));
BEGIN
  IF v_full_name = '' THEN
    RAISE EXCEPTION 'Employee full name is required';
  END IF;

  IF v_position_title = '' THEN
    RAISE EXCEPTION 'Position title is required';
  END IF;

  IF p_start_date IS NULL THEN
    RAISE EXCEPTION 'Start date is required';
  END IF;

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
    end_date,
    metadata,
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
    v_full_name,
    v_position_title,
    CASE WHEN p_end_date IS NULL THEN 'active' ELSE 'terminated' END,
    p_start_date,
    p_end_date,
    jsonb_build_object(
      'created_via', 'labor_management',
      'actor_name', NULLIF(trim(COALESCE(p_actor_name, '')), '')
    ),
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
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_end_date_provided boolean DEFAULT false,
  p_linked_user_id uuid DEFAULT NULL,
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
    start_date = COALESCE(p_start_date, start_date),
    end_date = CASE WHEN p_end_date_provided THEN p_end_date ELSE end_date END,
    linked_user_id = COALESCE(p_linked_user_id, linked_user_id),
    employment_status = CASE
      WHEN p_end_date_provided AND p_end_date IS NULL THEN 'active'
      WHEN p_end_date_provided AND p_end_date IS NOT NULL THEN 'terminated'
      WHEN end_date IS NULL THEN 'active'
      ELSE employment_status
    END,
    first_shift_date = NULL,
    assigned_trainer_user_id = NULL,
    assigned_trainer_name = NULL,
    assigned_manager_user_id = NULL,
    assigned_manager_name = NULL,
    updated_by_user_id = COALESCE(p_actor_user_id, updated_by_user_id),
    updated_at = now()
  WHERE id = p_employee_id
  RETURNING *
  INTO v_employee;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Labor employee % not found', p_employee_id;
  END IF;

  RETURN v_employee;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_labor_dashboard_snapshot(
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

  RETURN (
    WITH snapshot AS (
      SELECT *
      FROM public.labor_employee_status_snapshot
      WHERE location_id = v_location_id
    ),
    recent_notes AS (
      SELECT COUNT(*) AS note_count
      FROM public.labor_employee_notes n
      JOIN public.labor_employees e
        ON e.id = n.labor_employee_id
      WHERE e.location_id = v_location_id
        AND n.created_at >= now() - interval '7 days'
    ),
    metrics AS (
      SELECT jsonb_build_object(
        'active_employee_count', COUNT(*) FILTER (WHERE is_active),
        'employee_note_count_7d', COALESCE((SELECT note_count FROM recent_notes), 0),
        'new_hire_count_30d', COUNT(*) FILTER (WHERE is_active AND start_date >= CURRENT_DATE - 30),
        'termination_count_30d', COUNT(*) FILTER (WHERE end_date IS NOT NULL AND end_date >= CURRENT_DATE - 30),
        'active_trainee_count', COUNT(*) FILTER (WHERE is_active AND open_training_record_count > 0),
        'training_compliance_numerator', COUNT(*) FILTER (WHERE is_active AND training_compliance_flag),
        'training_compliance_denominator', COUNT(*) FILTER (WHERE is_active),
        'training_compliance_score', CASE
          WHEN COUNT(*) FILTER (WHERE is_active) = 0 THEN 0
          ELSE ROUND(
            (COUNT(*) FILTER (WHERE is_active AND training_compliance_flag)::numeric
            / COUNT(*) FILTER (WHERE is_active)::numeric) * 100,
            2
          )
        END
      ) AS summary
      FROM snapshot
    )
    SELECT jsonb_build_object(
      'metrics', COALESCE((SELECT summary FROM metrics), '{}'::jsonb),
      'roster', COALESCE((
        SELECT jsonb_agg(to_jsonb(snapshot) ORDER BY is_active DESC, full_name)
        FROM snapshot
      ), '[]'::jsonb)
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.build_review_template_published_snapshot(
  p_version_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  WITH version_data AS (
    SELECT
      rv.id AS version_id,
      rv.version_no,
      rv.status,
      rv.metadata,
      rt.slug,
      rt.name,
      rt.role_scopes
    FROM public.review_template_versions rv
    JOIN public.review_templates rt
      ON rt.id = rv.template_id
    WHERE rv.id = p_version_id
  ),
  section_data AS (
    SELECT
      rs.id,
      rs.section_key,
      rs.title,
      rs.sequence_order,
      rs.instructions,
      rs.metadata,
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'item_key', ri.item_key,
            'prompt', ri.prompt,
            'item_type', ri.item_type,
            'sequence_order', ri.sequence_order,
            'options', ri.options,
            'metadata', ri.metadata
          )
          ORDER BY ri.sequence_order
        ) FILTER (WHERE ri.id IS NOT NULL),
        '[]'::jsonb
      ) AS items
    FROM public.review_sections rs
    LEFT JOIN public.review_items ri
      ON ri.review_section_id = rs.id
    WHERE rs.template_version_id = p_version_id
    GROUP BY rs.id
  )
  SELECT jsonb_build_object(
    'template_key', vd.slug,
    'template_name', vd.name,
    'role_scopes', vd.role_scopes,
    'version_no', vd.version_no,
    'status', vd.status,
    'metadata', vd.metadata,
    'sections', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'section_key', sd.section_key,
            'title', sd.title,
            'sequence_order', sd.sequence_order,
            'instructions', sd.instructions,
            'metadata', sd.metadata,
            'items', sd.items
          )
          ORDER BY sd.sequence_order
        )
        FROM section_data sd
      ),
      '[]'::jsonb
    )
  )
  FROM version_data vd;
$$;

CREATE OR REPLACE FUNCTION public.create_review_template_draft(
  p_template_id uuid,
  p_from_version_id uuid DEFAULT NULL,
  p_actor_user_id uuid DEFAULT NULL,
  p_actor_name text DEFAULT NULL,
  p_changelog text DEFAULT NULL
)
RETURNS public.review_template_versions
LANGUAGE plpgsql
AS $$
DECLARE
  v_source_version public.review_template_versions%ROWTYPE;
  v_new_version public.review_template_versions%ROWTYPE;
  v_next_version integer;
  v_section record;
  v_item record;
  v_new_section_id uuid;
BEGIN
  IF p_from_version_id IS NOT NULL THEN
    SELECT *
    INTO v_source_version
    FROM public.review_template_versions
    WHERE id = p_from_version_id
      AND template_id = p_template_id;
  ELSE
    SELECT *
    INTO v_source_version
    FROM public.review_template_versions
    WHERE template_id = p_template_id
    ORDER BY is_current DESC, version_no DESC
    LIMIT 1;
  END IF;

  SELECT COALESCE(MAX(version_no), 0) + 1
  INTO v_next_version
  FROM public.review_template_versions
  WHERE template_id = p_template_id;

  INSERT INTO public.review_template_versions (
    template_id,
    version_no,
    status,
    is_current,
    source_document_name,
    changelog,
    metadata,
    created_by_user_id
  )
  VALUES (
    p_template_id,
    v_next_version,
    'draft',
    false,
    v_source_version.source_document_name,
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

  CREATE TEMP TABLE tmp_review_section_map (
    source_id uuid PRIMARY KEY,
    new_id uuid NOT NULL
  ) ON COMMIT DROP;

  FOR v_section IN
    SELECT *
    FROM public.review_sections
    WHERE template_version_id = v_source_version.id
    ORDER BY sequence_order
  LOOP
    INSERT INTO public.review_sections (
      template_version_id,
      section_key,
      title,
      sequence_order,
      instructions,
      metadata
    )
    VALUES (
      v_new_version.id,
      v_section.section_key,
      v_section.title,
      v_section.sequence_order,
      v_section.instructions,
      v_section.metadata
    )
    RETURNING id
    INTO v_new_section_id;

    INSERT INTO tmp_review_section_map (source_id, new_id)
    VALUES (v_section.id, v_new_section_id);
  END LOOP;

  INSERT INTO public.review_items (
    template_version_id,
    review_section_id,
    item_key,
    prompt,
    item_type,
    sequence_order,
    options,
    metadata
  )
  SELECT
    v_new_version.id,
    map.new_id,
    ri.item_key,
    ri.prompt,
    ri.item_type,
    ri.sequence_order,
    ri.options,
    ri.metadata
  FROM public.review_items ri
  JOIN tmp_review_section_map map
    ON map.source_id = ri.review_section_id
  WHERE ri.template_version_id = v_source_version.id
  ORDER BY ri.sequence_order;

  RETURN v_new_version;
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_review_template_version(
  p_template_version_id uuid,
  p_actor_user_id uuid DEFAULT NULL,
  p_actor_name text DEFAULT NULL,
  p_changelog text DEFAULT NULL
)
RETURNS public.review_template_versions
LANGUAGE plpgsql
AS $$
DECLARE
  v_version public.review_template_versions%ROWTYPE;
  v_snapshot jsonb;
BEGIN
  SELECT *
  INTO v_version
  FROM public.review_template_versions
  WHERE id = p_template_version_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Review template version % not found', p_template_version_id;
  END IF;

  v_snapshot := public.build_review_template_published_snapshot(v_version.id);

  UPDATE public.review_template_versions
  SET is_current = false
  WHERE template_id = v_version.template_id
    AND is_current = true
    AND id <> v_version.id;

  UPDATE public.review_template_versions
  SET
    status = 'published',
    is_current = true,
    changelog = COALESCE(NULLIF(trim(COALESCE(p_changelog, '')), ''), changelog),
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('published_by_actor_name', NULLIF(trim(COALESCE(p_actor_name, '')), '')),
    published_snapshot = COALESCE(v_snapshot, published_snapshot),
    published_at = now()
  WHERE id = v_version.id
  RETURNING *
  INTO v_version;

  RETURN v_version;
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_review_template_version(
  p_template_id uuid,
  p_restore_version_id uuid,
  p_actor_user_id uuid DEFAULT NULL,
  p_actor_name text DEFAULT NULL
)
RETURNS public.review_template_versions
LANGUAGE plpgsql
AS $$
DECLARE
  v_new_version public.review_template_versions%ROWTYPE;
  v_restored_version_no integer;
BEGIN
  SELECT version_no
  INTO v_restored_version_no
  FROM public.review_template_versions
  WHERE id = p_restore_version_id
    AND template_id = p_template_id;

  IF v_restored_version_no IS NULL THEN
    RAISE EXCEPTION 'Restore source version % was not found for review template %', p_restore_version_id, p_template_id;
  END IF;

  SELECT *
  INTO v_new_version
  FROM public.create_review_template_draft(
    p_template_id,
    p_restore_version_id,
    p_actor_user_id,
    p_actor_name,
    format('Restored from version %s', v_restored_version_no)
  );

  RETURN v_new_version;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_employee_review_response(
  p_review_instance_id uuid,
  p_review_item_id uuid,
  p_rating_value text DEFAULT NULL,
  p_response_text text DEFAULT NULL,
  p_actor_user_id uuid DEFAULT NULL
)
RETURNS public.employee_review_responses
LANGUAGE plpgsql
AS $$
DECLARE
  v_instance public.employee_review_instances%ROWTYPE;
  v_item public.review_items%ROWTYPE;
  v_response public.employee_review_responses%ROWTYPE;
BEGIN
  SELECT *
  INTO v_instance
  FROM public.employee_review_instances
  WHERE id = p_review_instance_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Review instance % not found', p_review_instance_id;
  END IF;

  SELECT *
  INTO v_item
  FROM public.review_items
  WHERE id = p_review_item_id
    AND template_version_id = v_instance.template_version_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Review item % does not belong to review instance %', p_review_item_id, p_review_instance_id;
  END IF;

  INSERT INTO public.employee_review_responses (
    review_instance_id,
    review_item_id,
    rating_value,
    response_text,
    created_by_user_id,
    updated_by_user_id
  )
  VALUES (
    p_review_instance_id,
    p_review_item_id,
    NULLIF(trim(COALESCE(p_rating_value, '')), ''),
    NULLIF(trim(COALESCE(p_response_text, '')), ''),
    p_actor_user_id,
    p_actor_user_id
  )
  ON CONFLICT (review_instance_id, review_item_id)
  DO UPDATE SET
    rating_value = EXCLUDED.rating_value,
    response_text = EXCLUDED.response_text,
    updated_at = now(),
    updated_by_user_id = COALESCE(EXCLUDED.updated_by_user_id, public.employee_review_responses.updated_by_user_id)
  RETURNING *
  INTO v_response;

  UPDATE public.employee_review_instances
  SET
    status = CASE
      WHEN status IN ('scheduled', 'overdue') THEN 'in_progress'
      ELSE status
    END,
    updated_at = now(),
    updated_by_user_id = COALESCE(p_actor_user_id, updated_by_user_id)
  WHERE id = p_review_instance_id;

  RETURN v_response;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_employee_review_instance(
  p_review_instance_id uuid,
  p_actor_user_id uuid DEFAULT NULL,
  p_actor_name text DEFAULT NULL
)
RETURNS public.employee_review_instances
LANGUAGE plpgsql
AS $$
DECLARE
  v_instance public.employee_review_instances%ROWTYPE;
  v_snapshot jsonb;
BEGIN
  SELECT *
  INTO v_instance
  FROM public.employee_review_instances
  WHERE id = p_review_instance_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Review instance % not found', p_review_instance_id;
  END IF;

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
    completed_at = COALESCE(completed_at, now()),
    reviewer_user_id = COALESCE(p_actor_user_id, reviewer_user_id),
    reviewer_name = COALESCE(NULLIF(trim(COALESCE(p_actor_name, '')), ''), reviewer_name),
    responses_snapshot = v_snapshot,
    updated_at = now(),
    updated_by_user_id = COALESCE(p_actor_user_id, updated_by_user_id)
  WHERE id = p_review_instance_id
  RETURNING *
  INTO v_instance;

  RETURN v_instance;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_labor_employee(text, text, text, date, date, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_labor_employee(uuid, text, text, date, date, boolean, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_labor_dashboard_snapshot(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.build_review_template_published_snapshot(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_review_template_draft(uuid, uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_review_template_version(uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_review_template_version(uuid, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_employee_review_response(uuid, uuid, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_employee_review_instance(uuid, uuid, text) TO authenticated;
