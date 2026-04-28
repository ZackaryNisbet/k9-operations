DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'workflow_progress_snapshot'
      AND pg_get_function_identity_arguments(oid) = 'p_location_id text, p_view_date text'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'workflow_progress_snapshot_all_status_legacy'
      AND pg_get_function_identity_arguments(oid) = 'p_location_id text, p_view_date text'
  ) THEN
    ALTER FUNCTION public.workflow_progress_snapshot(TEXT, TEXT)
      RENAME TO workflow_progress_snapshot_all_status_legacy;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.workflow_progress_snapshot(
  p_location_id TEXT,
  p_view_date TEXT DEFAULT NULL
)
RETURNS TABLE (
  workflow_id TEXT,
  title TEXT,
  completed INTEGER,
  total INTEGER,
  status TEXT,
  status_text TEXT,
  sort_order INTEGER,
  updated_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
AS $$
WITH params AS (
  SELECT
    p_location_id AS location_id,
    COALESCE(NULLIF(p_view_date, ''), CURRENT_DATE::TEXT) AS view_date
),
legacy AS (
  SELECT *
  FROM public.workflow_progress_snapshot_all_status_legacy(p_location_id, p_view_date)
),
care_entries AS (
  SELECT * FROM (
    VALUES
      ('feeding-meds-am'::TEXT, 'ops_feeding_meds_am_' || (SELECT view_date FROM params)),
      ('feeding-meds-midday'::TEXT, 'ops_feeding_meds_midday_' || (SELECT view_date FROM params)),
      ('feeding-meds-pm'::TEXT, 'ops_feeding_meds_pm_' || (SELECT view_date FROM params)),
      ('feeding-report'::TEXT, 'ops_feeding_report_' || (SELECT view_date FROM params)),
      ('meds'::TEXT, 'ops_medication_report_' || (SELECT view_date FROM params))
  ) AS entry(workflow_id, entry_id)
),
care_progress AS (
  SELECT
    ce.workflow_id,
    COUNT(row_item.row_value)::INT AS total,
    COUNT(row_item.row_value) FILTER (
      WHERE
        state.value ? 'completedAt'
        OR state.value ? 'outcome'
        OR state.value ? 'decision'
        OR state.value ? 'checkOutAt'
        OR LOWER(COALESCE(state.value->>'completed', '')) IN ('true', 't', '1', 'yes')
    )::INT AS completed,
    COALESCE(
      GREATEST(ops_row.computed_at, ops_row.updated_at),
      ops_row.updated_at,
      ops_row.computed_at
    ) AS updated_at
  FROM care_entries ce
  LEFT JOIN public.lite_daily_ops ops_row
    ON ops_row.location_id = (SELECT location_id FROM params)
   AND ops_row.id = ce.entry_id
  LEFT JOIN LATERAL JSONB_ARRAY_ELEMENTS(COALESCE(ops_row.computed_items->'rows', '[]'::JSONB)) row_item(row_value)
    ON row_item.row_value->>'statusBucket' = 'checked_in'
  LEFT JOIN LATERAL (
    SELECT COALESCE(ops_row.items, '{}'::JSONB) -> (row_item.row_value->>'id') AS value
  ) state ON TRUE
  GROUP BY ce.workflow_id, ops_row.computed_at, ops_row.updated_at
)
SELECT
  legacy.workflow_id,
  legacy.title,
  CASE WHEN care_progress.workflow_id IS NOT NULL
    THEN COALESCE(care_progress.completed, 0)
    ELSE legacy.completed
  END AS completed,
  CASE WHEN care_progress.workflow_id IS NOT NULL
    THEN COALESCE(care_progress.total, 0)
    ELSE legacy.total
  END AS total,
  CASE
    WHEN care_progress.workflow_id IS NULL THEN legacy.status
    WHEN COALESCE(care_progress.total, 0) = 0 THEN 'empty'
    WHEN COALESCE(care_progress.completed, 0) <= 0 THEN 'not_started'
    WHEN COALESCE(care_progress.completed, 0) >= COALESCE(care_progress.total, 0) THEN 'complete'
    ELSE 'in_progress'
  END AS status,
  CASE
    WHEN care_progress.workflow_id IS NULL THEN legacy.status_text
    WHEN COALESCE(care_progress.total, 0) = 0 THEN 'No checked-in work'
    WHEN COALESCE(care_progress.completed, 0) <= 0 THEN 'Not started'
    WHEN COALESCE(care_progress.completed, 0) >= COALESCE(care_progress.total, 0) THEN 'Complete'
    ELSE 'In progress'
  END AS status_text,
  legacy.sort_order,
  COALESCE(GREATEST(care_progress.updated_at, legacy.updated_at), care_progress.updated_at, legacy.updated_at) AS updated_at
FROM legacy
LEFT JOIN care_progress
  ON care_progress.workflow_id = legacy.workflow_id
ORDER BY legacy.sort_order;
$$;
