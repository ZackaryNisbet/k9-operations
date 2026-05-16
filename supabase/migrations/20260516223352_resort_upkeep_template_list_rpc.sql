CREATE OR REPLACE FUNCTION public.resort_upkeep_list_maintenance_templates(
  p_location_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_slugs text[] := ARRAY[
    'building-maintenance-monthly',
    'building-maintenance-quarterly',
    'building-maintenance-semi-annual',
    'building-maintenance-annual'
  ];
  v_templates jsonb;
BEGIN
  IF NOT public.resort_upkeep_can_access(p_location_id) THEN
    RAISE EXCEPTION 'Not authorized for this location' USING ERRCODE = '42501';
  END IF;

  WITH ranked_templates AS (
    SELECT
      t.*,
      row_number() OVER (
        PARTITION BY t.slug
        ORDER BY
          CASE WHEN t.location_id = p_location_id THEN 0 ELSE 1 END,
          t.created_at DESC,
          t.id
      ) AS template_rank
    FROM public.resort_upkeep_templates t
    WHERE t.module = 'building_maintenance'
      AND t.slug = ANY(v_slugs)
      AND (t.location_id = p_location_id OR t.location_id IS NULL)
  ),
  chosen_templates AS (
    SELECT *
    FROM ranked_templates
    WHERE template_rank = 1
  ),
  latest_versions AS (
    SELECT DISTINCT ON (v.template_id)
      v.*
    FROM public.resort_upkeep_template_versions v
    JOIN chosen_templates t ON t.id = v.template_id
    ORDER BY v.template_id, v.version_number DESC, v.created_at DESC, v.id DESC
  )
  SELECT COALESCE(
    jsonb_agg(
      to_jsonb(t) - 'template_rank' || jsonb_build_object('latest_version', to_jsonb(v))
      ORDER BY array_position(v_slugs, t.slug)
    ),
    '[]'::jsonb
  )
  INTO v_templates
  FROM chosen_templates t
  LEFT JOIN latest_versions v ON v.template_id = t.id;

  RETURN v_templates;
END;
$$;

REVOKE ALL ON FUNCTION public.resort_upkeep_list_maintenance_templates(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resort_upkeep_list_maintenance_templates(uuid) TO authenticated;
