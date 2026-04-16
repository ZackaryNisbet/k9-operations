BEGIN;

ALTER TABLE public.grassroots_targets
  ADD COLUMN IF NOT EXISTS drop_category text;

CREATE INDEX IF NOT EXISTS grassroots_targets_drop_category_idx
  ON public.grassroots_targets (location_id, drop_category)
  WHERE category = 'drops' AND drop_category IS NOT NULL;

WITH legacy_drop_categories AS (
  SELECT DISTINCT ON (a.target_id)
    a.target_id,
    NULLIF(trim(COALESCE(
      a.metadata->'legacy_row'->>'dropCategory',
      a.metadata->'legacy_row'->>'category',
      a.metadata->'legacy_row'->>'type'
    )), '') AS drop_category
  FROM public.grassroots_activity a
  JOIN public.grassroots_targets t
    ON t.id = a.target_id
  WHERE t.category = 'drops'
    AND a.metadata ? 'legacy_row'
  ORDER BY a.target_id, a.activity_date ASC, a.created_at ASC
)
UPDATE public.grassroots_targets t
SET drop_category = c.drop_category
FROM legacy_drop_categories c
WHERE t.id = c.target_id
  AND t.category = 'drops'
  AND t.drop_category IS NULL
  AND c.drop_category IS NOT NULL;

COMMIT;
