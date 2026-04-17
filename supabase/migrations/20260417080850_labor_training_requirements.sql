-- Labor training requirements
-- Adds Incite + PPBC requirement rows and makes roster compliance use the
-- certification/document evidence model instead of a CPR-only signal.

INSERT INTO public.certification_requirements (
  slug,
  name,
  description,
  frequency,
  renewal_interval_days,
  reminder_window_days,
  is_active
)
VALUES
  (
    'incite_modules',
    'Incite Modules',
    'Manual Incite module completion with uploaded PDF evidence.',
    'one_time',
    NULL,
    30,
    true
  ),
  (
    'dog_cpr_annual',
    'Dog CPR Certification',
    'Annual CPR certification with uploaded PDF evidence or a certificate URL.',
    'annual',
    365,
    30,
    true
  ),
  (
    'ppbc_level_1',
    'PPBC Level 1',
    'PPBC Level 1 online certification with uploaded PDF evidence for non-PCT and non-CSR positions.',
    'one_time',
    NULL,
    30,
    true
  ),
  (
    'ppbc_level_2',
    'PPBC Level 2',
    'PPBC Level 2 online certification with uploaded PDF evidence for non-PCT and non-CSR positions.',
    'one_time',
    NULL,
    30,
    true
  )
ON CONFLICT (slug) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  frequency = EXCLUDED.frequency,
  renewal_interval_days = EXCLUDED.renewal_interval_days,
  reminder_window_days = EXCLUDED.reminder_window_days,
  is_active = EXCLUDED.is_active,
  updated_at = now();

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

GRANT SELECT ON public.labor_employee_status_snapshot TO authenticated;
