-- Repair review checkpoints that were completed with evidence while stale waiver state remained current.

BEGIN;

WITH completed_review_requirements AS (
  SELECT
    eri.id AS review_instance_id,
    eri.labor_employee_id,
    eri.review_cycle::text AS review_cycle,
    r.id AS requirement_id,
    r.scope_location_id,
    r.parent_requirement_id,
    r.display_order,
    r.updated_at
  FROM public.employee_review_instances eri
  JOIN public.labor_employees e
    ON e.id = eri.labor_employee_id
  JOIN public.labor_compliance_requirements r
    ON r.requirement_kind = 'review_checkpoint'
   AND r.is_active = true
   AND (
      r.scope_type = 'enterprise'
      OR r.scope_location_id = e.location_id
    )
   AND (
      r.metadata->>'legacy_review_cycle' = eri.review_cycle::text
      OR COALESCE(r.metadata->'legacy_cycles', '[]'::jsonb) ? eri.review_cycle::text
      OR r.slug = eri.review_cycle::text
      OR r.slug = concat('review_', split_part(eri.review_cycle::text, '_', 1), '_day')
      OR replace(r.slug, '_day', '') = concat('review_', split_part(eri.review_cycle::text, '_', 1))
    )
  WHERE eri.status = 'completed'
    AND eri.metadata ? 'completion_evidence'
),
ranked_completed_review_requirements AS (
  SELECT
    *,
    row_number() OVER (
      PARTITION BY review_instance_id
      ORDER BY
        CASE WHEN scope_location_id IS NOT NULL THEN 0 ELSE 1 END,
        CASE WHEN parent_requirement_id IS NOT NULL THEN 0 ELSE 1 END,
        display_order,
        updated_at DESC
    ) AS match_rank
  FROM completed_review_requirements
),
repair_targets AS (
  SELECT
    review_instance_id,
    labor_employee_id,
    requirement_id
  FROM ranked_completed_review_requirements
  WHERE match_rank = 1
)
UPDATE public.labor_compliance_exceptions ex
SET
  superseded_at = COALESCE(ex.superseded_at, now()),
  updated_at = now()
FROM repair_targets rt
WHERE ex.labor_employee_id = rt.labor_employee_id
  AND ex.requirement_id = rt.requirement_id
  AND ex.exception_kind = 'waived'
  AND ex.superseded_at IS NULL;

UPDATE public.employee_review_instances
SET
  metadata = (COALESCE(metadata, '{}'::jsonb) - 'completion_waiver' - 'completion_mode') || jsonb_build_object('completion_mode', 'completed'),
  completed_at = COALESCE(((metadata->'completion_evidence'->>'completed_on')::date)::timestamptz, completed_at),
  updated_at = now()
WHERE status = 'completed'
  AND metadata ? 'completion_evidence'
  AND (
    metadata ? 'completion_waiver'
    OR metadata->>'completion_mode' = 'waived'
  );

COMMIT;
