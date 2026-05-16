BEGIN;

WITH source_versions AS (
  SELECT DISTINCT ON (t.slug)
    t.id AS template_id,
    t.slug,
    v.id AS version_id,
    v.items
  FROM public.resort_upkeep_templates t
  JOIN public.resort_upkeep_template_versions v ON v.template_id = t.id
  WHERE t.module = 'building_maintenance'
    AND t.location_id IS NULL
    AND t.slug IN (
      'building-maintenance-monthly',
      'building-maintenance-quarterly',
      'building-maintenance-semi-annual',
      'building-maintenance-annual'
    )
    AND v.status = 'published'
    AND v.changelog IN (
      'Reconciled task wording against the attached source checklist file.',
      'Repaired active template source wording for open period snapshots.'
    )
  ORDER BY t.slug, v.published_at DESC NULLS LAST, v.version_number DESC
),
activated AS (
  UPDATE public.resort_upkeep_templates t
  SET active_version_id = s.version_id,
      updated_at = now()
  FROM source_versions s
  WHERE t.slug = s.slug
    AND t.module = 'building_maintenance'
    AND t.location_id IS NULL
  RETURNING t.slug
)
UPDATE public.resort_upkeep_periods p
SET
  template_id = s.template_id,
  template_version_id = s.version_id,
  items_snapshot = s.items,
  updated_at = now(),
  lock_version = lock_version + 1
FROM source_versions s
WHERE p.template_slug = s.slug
  AND p.template_id = s.template_id
  AND p.status IN ('open', 'in_progress', 'amending')
  AND p.first_submitted_at IS NULL
  AND p.items_snapshot IS DISTINCT FROM s.items;

COMMIT;
