-- Ensure the mobile MOD role surface can launch the canonical Training module.
-- Mobile treats role_page_config as authoritative when rows exist, so the
-- workflow must be present in the Supabase-backed role layout, not only in
-- the mobile fallback card list.

WITH target_role_layouts AS (
  SELECT DISTINCT location_id, role
  FROM public.role_page_config
  WHERE role IN ('supervisor', 'manager', 'location_admin', 'multi_location_admin', 'enterprise_admin')
),
role_sort AS (
  SELECT location_id, role, COALESCE(MAX(sort_order), 0) AS max_sort_order
  FROM public.role_page_config
  GROUP BY location_id, role
)
INSERT INTO public.role_page_config (
  location_id,
  role,
  section,
  task_id,
  task_label,
  task_time,
  task_description,
  sort_order,
  source,
  day_of_week,
  is_active
)
SELECT
  layout.location_id,
  layout.role,
  'as_needed',
  'wf_training',
  'Training',
  NULL,
  'Team readiness, records, trainee progress, and training history.',
  role_sort.max_sort_order + 10,
  'workflow',
  NULL,
  true
FROM target_role_layouts layout
JOIN role_sort
  ON role_sort.location_id = layout.location_id
 AND role_sort.role = layout.role
WHERE NOT EXISTS (
  SELECT 1
  FROM public.role_page_config existing
  WHERE existing.location_id = layout.location_id
    AND existing.role = layout.role
    AND existing.task_id = 'wf_training'
);

UPDATE public.role_page_config
SET
  task_label = 'Training',
  task_description = COALESCE(task_description, 'Team readiness, records, trainee progress, and training history.'),
  source = 'workflow',
  is_active = true,
  updated_at = NOW()
WHERE task_id = 'wf_training'
  AND role IN ('supervisor', 'manager', 'location_admin', 'multi_location_admin', 'enterprise_admin');
