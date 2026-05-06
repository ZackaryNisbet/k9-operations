-- Labor roster staffing and printable team roster support.
-- Adds canonical FT/PT commitment and server-side staffing rollups used by
-- Labor Management Home and the print/PDF roster.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n
      ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'labor_employment_commitment'
  ) THEN
    CREATE TYPE public.labor_employment_commitment AS ENUM ('full_time', 'part_time');
  END IF;
END;
$$;

ALTER TABLE public.labor_employees
  ADD COLUMN IF NOT EXISTS employment_commitment public.labor_employment_commitment;

CREATE OR REPLACE FUNCTION public.labor_roster_position_group(
  p_position_title text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN trim(COALESCE(p_position_title, '')) = '' THEN 'other'
    WHEN COALESCE(p_position_title, '') ~* '(director|regional|general[[:space:]]+manager|(^|[^a-z0-9])gm([^a-z0-9]|$)|assistant[[:space:]]+manager|(^|[^a-z0-9])agm([^a-z0-9]|$)|manager)' THEN 'manager'
    WHEN COALESCE(p_position_title, '') ~* '(supervisor|lead)' THEN 'supervisor'
    WHEN COALESCE(p_position_title, '') ~* '(customer[[:space:]]+service[[:space:]]+representative|(^|[^a-z0-9])csr([^a-z0-9]|$))' THEN 'csr'
    WHEN COALESCE(p_position_title, '') ~* '(pet[[:space:]]+care[[:space:]]+technician|(^|[^a-z0-9])pct([^a-z0-9]|$)|technician)' THEN 'pct'
    ELSE 'other'
  END;
$$;

CREATE OR REPLACE VIEW public.labor_employee_status_snapshot
WITH (security_invoker = true) AS
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
certification_latest AS (
  SELECT DISTINCT ON (ec.labor_employee_id, cr.slug)
    ec.labor_employee_id,
    cr.slug,
    ec.completed_on,
    ec.expires_on,
    ec.labor_employee_document_id,
    ec.external_document_url,
    ec.source_note,
    ec.created_at
  FROM public.employee_certifications ec
  JOIN public.certification_requirements cr
    ON cr.id = ec.requirement_id
  WHERE cr.slug IN ('incite_modules', 'dog_cpr_annual', 'ppbc_level_1', 'ppbc_level_2')
  ORDER BY ec.labor_employee_id, cr.slug, ec.completed_on DESC, ec.created_at DESC
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
    COUNT(*) FILTER (WHERE ai.incident_date >= CURRENT_DATE - 30) AS attendance_mark_count_30d,
    MAX(ai.incident_date) AS last_attendance_incident_at
  FROM public.attendance_incidents ai
  GROUP BY ai.labor_employee_id
),
note_rollup AS (
  SELECT
    n.labor_employee_id,
    COUNT(*) FILTER (WHERE n.created_at >= now() - interval '7 days') AS recent_employee_note_count_7d,
    COUNT(*) FILTER (WHERE n.created_at >= now() - interval '30 days') AS recent_employee_note_count_30d,
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
  cpr.completed_on AS cpr_completed_on,
  cpr.expires_on AS cpr_expires_on,
  CASE
    WHEN cpr.expires_on IS NULL THEN 'not_started'
    WHEN cpr.expires_on < CURRENT_DATE THEN 'expired'
    WHEN cpr.expires_on <= CURRENT_DATE + 30 THEN 'due_soon'
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
    ELSE (
      incite.completed_on IS NOT NULL
      AND incite.labor_employee_document_id IS NOT NULL
      AND cpr.completed_on IS NOT NULL
      AND cpr.expires_on IS NOT NULL
      AND cpr.expires_on >= CURRENT_DATE
      AND (
        cpr.labor_employee_document_id IS NOT NULL
        OR NULLIF(trim(COALESCE(cpr.external_document_url, '')), '') IS NOT NULL
      )
      AND (
        COALESCE(e.position_title, '') ~* '(pet[[:space:]]*care[[:space:]]*technician|(^|[^a-z0-9])pct([^a-z0-9]|$)|customer[[:space:]]*service[[:space:]]*representative|(^|[^a-z0-9])csr([^a-z0-9]|$))'
        OR (
          ppbc1.completed_on IS NOT NULL
          AND ppbc1.labor_employee_document_id IS NOT NULL
          AND ppbc2.completed_on IS NOT NULL
          AND ppbc2.labor_employee_document_id IS NOT NULL
        )
      )
    )
  END AS training_compliance_flag,
  cpr.external_document_url AS cpr_document_url,
  cpr.source_note AS cpr_source_note,
  COALESCE(nr.recent_employee_note_count_7d, 0) AS recent_employee_note_count_7d,
  nr.last_employee_note_at,
  e.employment_commitment,
  public.labor_roster_position_group(e.position_title) AS position_group,
  COALESCE(nr.recent_employee_note_count_30d, 0) AS recent_employee_note_count_30d,
  COALESCE(ar.attendance_mark_count_30d, 0) AS attendance_mark_count_30d
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
LEFT JOIN certification_latest incite
  ON incite.labor_employee_id = e.id
 AND incite.slug = 'incite_modules'
LEFT JOIN certification_latest cpr
  ON cpr.labor_employee_id = e.id
 AND cpr.slug = 'dog_cpr_annual'
LEFT JOIN certification_latest ppbc1
  ON ppbc1.labor_employee_id = e.id
 AND ppbc1.slug = 'ppbc_level_1'
LEFT JOIN certification_latest ppbc2
  ON ppbc2.labor_employee_id = e.id
 AND ppbc2.slug = 'ppbc_level_2'
LEFT JOIN training_rollup tr
  ON tr.labor_employee_id = e.id
LEFT JOIN active_training at
  ON at.labor_employee_id = e.id
LEFT JOIN note_rollup nr
  ON nr.labor_employee_id = e.id
LEFT JOIN attendance_rollup ar
  ON ar.labor_employee_id = e.id;

DROP FUNCTION IF EXISTS public.create_labor_employee(text, text, text, date, date, uuid, uuid, text);
DROP FUNCTION IF EXISTS public.update_labor_employee(uuid, text, text, date, date, boolean, uuid, uuid);

CREATE OR REPLACE FUNCTION public.create_labor_employee(
  p_location_ref text,
  p_full_name text,
  p_position_title text,
  p_start_date date,
  p_end_date date DEFAULT NULL,
  p_linked_user_id uuid DEFAULT NULL,
  p_actor_user_id uuid DEFAULT NULL,
  p_actor_name text DEFAULT NULL,
  p_employment_commitment public.labor_employment_commitment DEFAULT NULL
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
    employment_commitment,
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
    (
      CASE
        WHEN p_end_date IS NULL THEN 'active'
        ELSE 'terminated'
      END
    )::public.labor_employment_status,
    p_employment_commitment,
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
  p_actor_user_id uuid DEFAULT NULL,
  p_employment_commitment public.labor_employment_commitment DEFAULT NULL,
  p_employment_commitment_provided boolean DEFAULT false
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
    employment_commitment = CASE
      WHEN p_employment_commitment_provided THEN p_employment_commitment
      ELSE employment_commitment
    END,
    linked_user_id = COALESCE(p_linked_user_id, linked_user_id),
    employment_status = CASE
      WHEN p_end_date_provided AND p_end_date IS NULL THEN 'active'::public.labor_employment_status
      WHEN p_end_date_provided AND p_end_date IS NOT NULL THEN 'terminated'::public.labor_employment_status
      WHEN end_date IS NULL THEN 'active'::public.labor_employment_status
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
    position_seed AS (
      SELECT *
      FROM (VALUES
        ('manager', 'Managers', 1),
        ('supervisor', 'Supervisors', 2),
        ('csr', 'CSRs', 3),
        ('pct', 'PCTs', 4),
        ('other', 'Other', 5)
      ) AS seed(position_group, label, sort_order)
    ),
    position_matrix AS (
      SELECT
        ps.position_group,
        ps.label,
        ps.sort_order,
        COUNT(s.labor_employee_id) FILTER (
          WHERE s.is_active
            AND s.employment_commitment = 'full_time'::public.labor_employment_commitment
        ) AS full_time_count,
        COUNT(s.labor_employee_id) FILTER (
          WHERE s.is_active
            AND s.employment_commitment = 'part_time'::public.labor_employment_commitment
        ) AS part_time_count,
        COUNT(s.labor_employee_id) FILTER (
          WHERE s.is_active
            AND s.employment_commitment IS NULL
        ) AS unassigned_count,
        COUNT(s.labor_employee_id) FILTER (WHERE s.is_active) AS total_count
      FROM position_seed ps
      LEFT JOIN snapshot s
        ON s.position_group = ps.position_group
      GROUP BY ps.position_group, ps.label, ps.sort_order
    ),
    metrics AS (
      SELECT jsonb_build_object(
        'active_employee_count', COUNT(*) FILTER (WHERE is_active),
        'manager_count', COUNT(*) FILTER (WHERE is_active AND position_group = 'manager'),
        'supervisor_count', COUNT(*) FILTER (WHERE is_active AND position_group = 'supervisor'),
        'csr_count', COUNT(*) FILTER (WHERE is_active AND position_group = 'csr'),
        'pct_count', COUNT(*) FILTER (WHERE is_active AND position_group = 'pct'),
        'other_position_count', COUNT(*) FILTER (WHERE is_active AND position_group = 'other'),
        'full_time_count', COUNT(*) FILTER (
          WHERE is_active
            AND employment_commitment = 'full_time'::public.labor_employment_commitment
        ),
        'part_time_count', COUNT(*) FILTER (
          WHERE is_active
            AND employment_commitment = 'part_time'::public.labor_employment_commitment
        ),
        'unassigned_commitment_count', COUNT(*) FILTER (
          WHERE is_active
            AND employment_commitment IS NULL
        ),
        'staffing_matrix', COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'position_group', pm.position_group,
              'label', pm.label,
              'full_time_count', pm.full_time_count,
              'part_time_count', pm.part_time_count,
              'unassigned_count', pm.unassigned_count,
              'total_count', pm.total_count
            )
            ORDER BY pm.sort_order
          )
          FROM position_matrix pm
          WHERE pm.position_group <> 'other'
             OR pm.total_count > 0
        ), '[]'::jsonb),
        'employee_note_count_7d', COALESCE((SELECT note_count FROM recent_notes), 0),
        'employee_note_count_30d', COALESCE(SUM(recent_employee_note_count_30d) FILTER (WHERE is_active), 0),
        'attendance_mark_count_30d', COALESCE(SUM(attendance_mark_count_30d) FILTER (WHERE is_active), 0),
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

CREATE OR REPLACE FUNCTION public.labor_employee_change_history_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_actor_name text;
BEGIN
  v_actor_name := public.labor_history_actor_name(NEW.updated_by_user_id);

  IF NEW.full_name IS DISTINCT FROM OLD.full_name THEN
    INSERT INTO public.labor_employee_history_events (
      labor_employee_id, event_category, event_type, source_table, source_id,
      field_name, title, summary, old_value, new_value, old_values, new_values,
      actor_user_id, actor_name, occurred_at
    )
    VALUES (
      NEW.id, 'employee', 'employee_field_changed', 'labor_employees', NEW.id,
      'full_name', 'Name changed', 'Employee name changed',
      OLD.full_name, NEW.full_name,
      jsonb_build_object('full_name', OLD.full_name),
      jsonb_build_object('full_name', NEW.full_name),
      NEW.updated_by_user_id, v_actor_name, now()
    );
  END IF;

  IF NEW.position_title IS DISTINCT FROM OLD.position_title THEN
    INSERT INTO public.labor_employee_history_events (
      labor_employee_id, event_category, event_type, source_table, source_id,
      field_name, title, summary, old_value, new_value, old_values, new_values,
      actor_user_id, actor_name, occurred_at
    )
    VALUES (
      NEW.id, 'employee', 'employee_field_changed', 'labor_employees', NEW.id,
      'position_title', 'Position title changed', 'Employee position title changed',
      OLD.position_title, NEW.position_title,
      jsonb_build_object('position_title', OLD.position_title),
      jsonb_build_object('position_title', NEW.position_title),
      NEW.updated_by_user_id, v_actor_name, now()
    );
  END IF;

  IF NEW.employment_commitment IS DISTINCT FROM OLD.employment_commitment THEN
    INSERT INTO public.labor_employee_history_events (
      labor_employee_id, event_category, event_type, source_table, source_id,
      field_name, title, summary, old_value, new_value, old_values, new_values,
      actor_user_id, actor_name, occurred_at
    )
    VALUES (
      NEW.id, 'employee', 'employee_field_changed', 'labor_employees', NEW.id,
      'employment_commitment', 'Commitment changed', 'Employee staffing commitment changed',
      OLD.employment_commitment::text, NEW.employment_commitment::text,
      jsonb_build_object('employment_commitment', OLD.employment_commitment),
      jsonb_build_object('employment_commitment', NEW.employment_commitment),
      NEW.updated_by_user_id, v_actor_name, now()
    );
  END IF;

  IF NEW.start_date IS DISTINCT FROM OLD.start_date THEN
    INSERT INTO public.labor_employee_history_events (
      labor_employee_id, event_category, event_type, source_table, source_id,
      field_name, title, summary, old_value, new_value, old_values, new_values,
      actor_user_id, actor_name, occurred_at
    )
    VALUES (
      NEW.id, 'employee', 'employee_field_changed', 'labor_employees', NEW.id,
      'start_date', 'Start date changed', 'Employee start date changed',
      OLD.start_date::text, NEW.start_date::text,
      jsonb_build_object('start_date', OLD.start_date),
      jsonb_build_object('start_date', NEW.start_date),
      NEW.updated_by_user_id, v_actor_name, now()
    );
  END IF;

  IF NEW.end_date IS DISTINCT FROM OLD.end_date THEN
    INSERT INTO public.labor_employee_history_events (
      labor_employee_id, event_category, event_type, source_table, source_id,
      field_name, title, summary, old_value, new_value, old_values, new_values,
      actor_user_id, actor_name, occurred_at
    )
    VALUES (
      NEW.id, 'employee', 'employee_field_changed', 'labor_employees', NEW.id,
      'end_date', 'Employment status changed', 'Employee end date changed',
      OLD.end_date::text, NEW.end_date::text,
      jsonb_build_object('end_date', OLD.end_date),
      jsonb_build_object('end_date', NEW.end_date),
      NEW.updated_by_user_id, v_actor_name, now()
    );
  END IF;

  IF (OLD.metadata ->> 'contact_email') IS DISTINCT FROM (NEW.metadata ->> 'contact_email') THEN
    INSERT INTO public.labor_employee_history_events (
      labor_employee_id, event_category, event_type, source_table, source_id,
      field_name, title, summary, old_value, new_value, old_values, new_values,
      actor_user_id, actor_name, occurred_at
    )
    VALUES (
      NEW.id, 'employee', 'employee_field_changed', 'labor_employees', NEW.id,
      'contact_email', 'Email changed', 'Employee email changed',
      OLD.metadata ->> 'contact_email', NEW.metadata ->> 'contact_email',
      jsonb_build_object('contact_email', OLD.metadata ->> 'contact_email'),
      jsonb_build_object('contact_email', NEW.metadata ->> 'contact_email'),
      NEW.updated_by_user_id, v_actor_name, now()
    );
  END IF;

  IF (OLD.metadata ->> 'contact_phone') IS DISTINCT FROM (NEW.metadata ->> 'contact_phone') THEN
    INSERT INTO public.labor_employee_history_events (
      labor_employee_id, event_category, event_type, source_table, source_id,
      field_name, title, summary, old_value, new_value, old_values, new_values,
      actor_user_id, actor_name, occurred_at
    )
    VALUES (
      NEW.id, 'employee', 'employee_field_changed', 'labor_employees', NEW.id,
      'contact_phone', 'Phone changed', 'Employee phone changed',
      OLD.metadata ->> 'contact_phone', NEW.metadata ->> 'contact_phone',
      jsonb_build_object('contact_phone', OLD.metadata ->> 'contact_phone'),
      jsonb_build_object('contact_phone', NEW.metadata ->> 'contact_phone'),
      NEW.updated_by_user_id, v_actor_name, now()
    );
  END IF;

  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.labor_roster_position_group(text) TO authenticated;
GRANT SELECT ON public.labor_employee_status_snapshot TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_labor_employee(text, text, text, date, date, uuid, uuid, text, public.labor_employment_commitment) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_labor_employee(uuid, text, text, date, date, boolean, uuid, uuid, public.labor_employment_commitment, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_labor_dashboard_snapshot(text, uuid) TO authenticated;
