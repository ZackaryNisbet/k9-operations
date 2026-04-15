BEGIN;

-- ============================================================================
-- Resource library sections + labor position hierarchy
-- - canonical section tabs for Resources
-- - server-backed per-resort labor hierarchy ordering
-- - backfill legacy resource blob rows into canonical tables
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.resource_library_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id text NOT NULL,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by_user_id uuid,
  created_by_name text,
  updated_by_user_id uuid,
  updated_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT resource_library_sections_name_not_blank CHECK (length(trim(name)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS resource_library_sections_location_name_uidx
  ON public.resource_library_sections (location_id, lower(trim(name)));

CREATE INDEX IF NOT EXISTS resource_library_sections_location_sort_idx
  ON public.resource_library_sections (location_id, is_active, sort_order, created_at DESC);

ALTER TABLE public.resource_library_sections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS resource_library_sections_read ON public.resource_library_sections;
CREATE POLICY resource_library_sections_read ON public.resource_library_sections
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS resource_library_sections_write ON public.resource_library_sections;
CREATE POLICY resource_library_sections_write ON public.resource_library_sections
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS resource_library_sections_service ON public.resource_library_sections;
CREATE POLICY resource_library_sections_service ON public.resource_library_sections
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.resource_library_sections TO authenticated;

DROP TRIGGER IF EXISTS trg_resource_library_sections_updated_at ON public.resource_library_sections;
CREATE TRIGGER trg_resource_library_sections_updated_at
  BEFORE UPDATE ON public.resource_library_sections
  FOR EACH ROW EXECUTE FUNCTION public.update_platform_settings_updated_at();

ALTER TABLE public.resource_library_items
  ADD COLUMN IF NOT EXISTS section_id uuid REFERENCES public.resource_library_sections(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS resource_library_items_section_idx
  ON public.resource_library_items (section_id, sort_order, created_at DESC);

WITH legacy_section_candidates AS (
  SELECT
    ls.location_id,
    trim(resource_item.value->>'category') AS name,
    (resource_item.ordinality * 10)::integer AS seed_sort
  FROM public.lite_settings ls
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(ls.setting_value->'items', '[]'::jsonb)) WITH ORDINALITY AS resource_item(value, ordinality)
  WHERE ls.setting_key = 'resource_library_items'
    AND trim(COALESCE(resource_item.value->>'category', '')) <> ''
  UNION ALL
  SELECT
    rli.location_id,
    trim(rli.category) AS name,
    COALESCE(rli.sort_order, 0) AS seed_sort
  FROM public.resource_library_items rli
  WHERE trim(COALESCE(rli.category, '')) <> ''
),
grouped_sections AS (
  SELECT
    location_id,
    name,
    MIN(seed_sort) AS first_sort
  FROM legacy_section_candidates
  GROUP BY location_id, name
),
ranked_sections AS (
  SELECT
    location_id,
    name,
    ROW_NUMBER() OVER (
      PARTITION BY location_id
      ORDER BY first_sort, lower(name)
    ) * 10 AS sort_order
  FROM grouped_sections
)
INSERT INTO public.resource_library_sections (
  location_id,
  name,
  sort_order
)
SELECT
  rs.location_id,
  rs.name,
  rs.sort_order
FROM ranked_sections rs
ON CONFLICT DO NOTHING;

WITH legacy_blob_items AS (
  SELECT
    ls.location_id,
    resource_item.value AS item,
    resource_item.ordinality,
    section_row.id AS section_id
  FROM public.lite_settings ls
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(ls.setting_value->'items', '[]'::jsonb)) WITH ORDINALITY AS resource_item(value, ordinality)
  LEFT JOIN public.resource_library_sections section_row
    ON section_row.location_id = ls.location_id
   AND lower(trim(section_row.name)) = lower(trim(COALESCE(resource_item.value->>'category', '')))
  WHERE ls.setting_key = 'resource_library_items'
    AND trim(COALESCE(resource_item.value->>'title', '')) <> ''
)
INSERT INTO public.resource_library_items (
  location_id,
  title,
  resource_kind,
  url,
  file_path,
  mime_type,
  description,
  category,
  section_id,
  sort_order,
  is_active,
  metadata,
  created_by_name,
  updated_by_name,
  created_at,
  updated_at
)
SELECT
  legacy.location_id,
  trim(legacy.item->>'title') AS title,
  CASE
    WHEN trim(COALESCE(legacy.item->'file'->>'path', '')) <> '' THEN 'file'
    ELSE 'link'
  END AS resource_kind,
  NULLIF(trim(COALESCE(legacy.item->>'linkUrl', '')), '') AS url,
  NULLIF(trim(COALESCE(legacy.item->'file'->>'path', '')), '') AS file_path,
  NULLIF(trim(COALESCE(legacy.item->'file'->>'type', '')), '') AS mime_type,
  NULLIF(trim(COALESCE(legacy.item->>'description', '')), '') AS description,
  NULLIF(trim(COALESCE(legacy.item->>'category', '')), '') AS category,
  legacy.section_id,
  (legacy.ordinality * 10)::integer AS sort_order,
  true AS is_active,
  jsonb_strip_nulls(jsonb_build_object(
    'legacy_id', NULLIF(trim(COALESCE(legacy.item->>'id', '')), ''),
    'legacy_updated_at', NULLIF(trim(COALESCE(legacy.item->>'updatedAt', '')), ''),
    'legacy_file_bucket', NULLIF(trim(COALESCE(legacy.item->'file'->>'bucket', '')), ''),
    'legacy_file_name', NULLIF(trim(COALESCE(legacy.item->'file'->>'name', '')), ''),
    'legacy_file_size', CASE
      WHEN trim(COALESCE(legacy.item->'file'->>'size', '')) ~ '^\d+$' THEN (legacy.item->'file'->>'size')::bigint
      ELSE NULL
    END,
    'legacy_updated_by', NULLIF(trim(COALESCE(legacy.item->>'updatedBy', '')), '')
  )) AS metadata,
  NULLIF(trim(COALESCE(legacy.item->>'updatedBy', '')), '') AS created_by_name,
  NULLIF(trim(COALESCE(legacy.item->>'updatedBy', '')), '') AS updated_by_name,
  COALESCE(NULLIF(trim(COALESCE(legacy.item->>'updatedAt', '')), ''), now()::text)::timestamptz AS created_at,
  COALESCE(NULLIF(trim(COALESCE(legacy.item->>'updatedAt', '')), ''), now()::text)::timestamptz AS updated_at
FROM legacy_blob_items legacy
WHERE NOT EXISTS (
  SELECT 1
  FROM public.resource_library_items existing
  WHERE existing.location_id = legacy.location_id
    AND COALESCE(existing.metadata->>'legacy_id', '') = COALESCE(legacy.item->>'id', '')
    AND COALESCE(legacy.item->>'id', '') <> ''
);

UPDATE public.resource_library_items rli
SET section_id = rls.id
FROM public.resource_library_sections rls
WHERE rli.section_id IS NULL
  AND rli.location_id = rls.location_id
  AND lower(trim(COALESCE(rli.category, ''))) = lower(trim(rls.name))
  AND trim(COALESCE(rli.category, '')) <> '';

CREATE TABLE IF NOT EXISTS public.labor_position_hierarchy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  position_title text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_by_user_id uuid,
  created_by_name text,
  updated_by_user_id uuid,
  updated_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT labor_position_hierarchy_title_not_blank CHECK (length(trim(position_title)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS labor_position_hierarchy_location_title_uidx
  ON public.labor_position_hierarchy (location_id, lower(trim(position_title)));

CREATE INDEX IF NOT EXISTS labor_position_hierarchy_location_sort_idx
  ON public.labor_position_hierarchy (location_id, sort_order, created_at DESC);

ALTER TABLE public.labor_position_hierarchy ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS labor_position_hierarchy_read ON public.labor_position_hierarchy;
CREATE POLICY labor_position_hierarchy_read ON public.labor_position_hierarchy
  FOR SELECT TO authenticated
  USING (public.labor_has_location_access(location_id));

DROP POLICY IF EXISTS labor_position_hierarchy_write ON public.labor_position_hierarchy;
CREATE POLICY labor_position_hierarchy_write ON public.labor_position_hierarchy
  FOR ALL TO authenticated
  USING (public.labor_has_management_access(location_id))
  WITH CHECK (public.labor_has_management_access(location_id));

DROP POLICY IF EXISTS labor_position_hierarchy_service ON public.labor_position_hierarchy;
CREATE POLICY labor_position_hierarchy_service ON public.labor_position_hierarchy
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.labor_position_hierarchy TO authenticated;

DROP TRIGGER IF EXISTS trg_labor_position_hierarchy_updated_at ON public.labor_position_hierarchy;
CREATE TRIGGER trg_labor_position_hierarchy_updated_at
  BEFORE UPDATE ON public.labor_position_hierarchy
  FOR EACH ROW EXECUTE FUNCTION public.update_platform_settings_updated_at();

WITH distinct_titles AS (
  SELECT DISTINCT
    e.location_id,
    trim(e.position_title) AS position_title
  FROM public.labor_employees e
  WHERE trim(COALESCE(e.position_title, '')) <> ''
),
ranked_titles AS (
  SELECT
    dt.location_id,
    dt.position_title,
    ROW_NUMBER() OVER (
      PARTITION BY dt.location_id
      ORDER BY
        CASE
          WHEN lower(dt.position_title) ~ '(director|regional)' THEN 100
          WHEN lower(dt.position_title) ~ '(general manager|\bgm\b)' THEN 90
          WHEN lower(dt.position_title) ~ '(assistant manager|\bagm\b)' THEN 80
          WHEN lower(dt.position_title) ~ '(manager)' THEN 70
          WHEN lower(dt.position_title) ~ '(supervisor|lead)' THEN 60
          WHEN lower(dt.position_title) ~ '(customer service representative|\bcsr\b)' THEN 40
          WHEN lower(dt.position_title) ~ '(pet care technician|\bpct\b|technician)' THEN 30
          ELSE 0
        END DESC,
        lower(dt.position_title)
    ) * 10 AS sort_order
  FROM distinct_titles dt
)
INSERT INTO public.labor_position_hierarchy (
  location_id,
  position_title,
  sort_order
)
SELECT
  rt.location_id,
  rt.position_title,
  rt.sort_order
FROM ranked_titles rt
ON CONFLICT DO NOTHING;

COMMIT;
