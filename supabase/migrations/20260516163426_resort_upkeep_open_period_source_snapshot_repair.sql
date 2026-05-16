BEGIN;

WITH source_items AS (
  SELECT
    t.slug,
    tv.items,
    tv.source_file_name
  FROM public.resort_upkeep_templates t
  JOIN public.resort_upkeep_template_versions tv ON tv.id = t.active_version_id
  WHERE t.location_id IS NULL
    AND t.module = 'building_maintenance'
    AND t.slug IN (
      'building-maintenance-monthly',
      'building-maintenance-quarterly',
      'building-maintenance-semi-annual',
      'building-maintenance-annual'
    )
),
template_targets AS (
  SELECT
    t.id AS template_id,
    t.slug,
    s.items,
    s.source_file_name,
    active_version.items AS current_items
  FROM public.resort_upkeep_templates t
  JOIN source_items s ON s.slug = t.slug
  LEFT JOIN public.resort_upkeep_template_versions active_version ON active_version.id = t.active_version_id
  WHERE t.module = 'building_maintenance'
    AND t.location_id IS NULL
    AND t.is_active = true
),
templates_needing_versions AS (
  SELECT *
  FROM template_targets
  WHERE current_items IS DISTINCT FROM items
),
latest_versions AS (
  SELECT
    t.template_id,
    COALESCE(max(v.version_number), 0) + 1 AS next_version_number
  FROM templates_needing_versions t
  LEFT JOIN public.resort_upkeep_template_versions v ON v.template_id = t.template_id
  GROUP BY t.template_id
),
inserted_versions AS (
  INSERT INTO public.resort_upkeep_template_versions (
    template_id,
    version_number,
    status,
    items,
    source_file_name,
    changelog,
    published_at
  )
  SELECT
    t.template_id,
    lv.next_version_number,
    'published',
    t.items,
    t.source_file_name,
    'Repaired active template source wording for open period snapshots.',
    now()
  FROM templates_needing_versions t
  JOIN latest_versions lv ON lv.template_id = t.template_id
  RETURNING id, template_id, items
),
activated_inserted AS (
  UPDATE public.resort_upkeep_templates t
  SET active_version_id = v.id,
      updated_at = now()
  FROM inserted_versions v
  WHERE t.id = v.template_id
  RETURNING t.id AS template_id, t.slug, v.id AS version_id, v.items
),
active_versions AS (
  SELECT * FROM activated_inserted
  UNION ALL
  SELECT
    t.template_id,
    t.slug,
    active_version.id AS version_id,
    t.items
  FROM template_targets t
  JOIN public.resort_upkeep_template_versions active_version ON active_version.template_id = t.template_id
  WHERE active_version.id = (
    SELECT tv.id
    FROM public.resort_upkeep_template_versions tv
    WHERE tv.template_id = t.template_id
      AND tv.status = 'published'
      AND tv.items = t.items
    ORDER BY
      CASE WHEN tv.id = (SELECT active_version_id FROM public.resort_upkeep_templates WHERE id = t.template_id) THEN 0 ELSE 1 END,
      tv.version_number DESC,
      tv.published_at DESC NULLS LAST
    LIMIT 1
  )
)
UPDATE public.resort_upkeep_periods p
SET
  template_version_id = av.version_id,
  items_snapshot = av.items,
  updated_at = now(),
  lock_version = lock_version + 1
FROM active_versions av
WHERE p.template_id = av.template_id
  AND p.template_slug = av.slug
  AND p.status IN ('open', 'in_progress', 'amending')
  AND p.first_submitted_at IS NULL
  AND p.items_snapshot IS DISTINCT FROM av.items;

COMMIT;
