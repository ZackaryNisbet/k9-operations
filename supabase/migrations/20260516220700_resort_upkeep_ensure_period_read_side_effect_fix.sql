-- Keep dashboard/list reads side-effect-free for template metadata. Period
-- creation still writes canonical period snapshots, but reading a dashboard
-- should not need template-management write rights just because a template's
-- active_version_id is stale.

CREATE OR REPLACE FUNCTION public.resort_upkeep_ensure_period(
  p_location_id uuid,
  p_template_slug text,
  p_anchor_date date DEFAULT CURRENT_DATE
)
RETURNS public.resort_upkeep_periods
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_template public.resort_upkeep_templates%ROWTYPE;
  v_template_id uuid;
  v_version public.resort_upkeep_template_versions%ROWTYPE;
  v_version_id uuid;
  v_bounds record;
  v_period public.resort_upkeep_periods%ROWTYPE;
BEGIN
  IF p_location_id IS NULL THEN
    RAISE EXCEPTION 'location_id is required' USING ERRCODE = '22023';
  END IF;

  IF NOT public.resort_upkeep_can_access(p_location_id) THEN
    RAISE EXCEPTION 'Not authorized for this location' USING ERRCODE = '42501';
  END IF;

  SELECT
    t.id,
    tv.id
  INTO v_template_id, v_version_id
  FROM public.resort_upkeep_templates t
  JOIN LATERAL (
    SELECT v.id
    FROM public.resort_upkeep_template_versions v
    WHERE v.template_id = t.id
      AND v.status = 'published'
    ORDER BY
      CASE WHEN v.id = t.active_version_id THEN 0 ELSE 1 END,
      v.version_number DESC,
      v.published_at DESC NULLS LAST
    LIMIT 1
  ) tv ON true
  WHERE t.slug = p_template_slug
    AND t.is_active = true
    AND (t.location_id = p_location_id OR t.location_id IS NULL)
  ORDER BY
    CASE WHEN t.location_id = p_location_id THEN 0 ELSE 1 END,
    t.location_id NULLS LAST
  LIMIT 1;

  IF v_template_id IS NULL OR v_version_id IS NULL THEN
    RAISE EXCEPTION 'Active template version is missing for %', p_template_slug USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_template
  FROM public.resort_upkeep_templates
  WHERE id = v_template_id;

  SELECT *
  INTO v_version
  FROM public.resort_upkeep_template_versions
  WHERE id = v_version_id
    AND status = 'published';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active template version is missing for %', p_template_slug USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_bounds
  FROM public.resort_upkeep_period_bounds(v_template.frequency, v_template.start_month, COALESCE(p_anchor_date, CURRENT_DATE));

  PERFORM set_config('app.resort_upkeep_rpc_write', 'on', true);

  INSERT INTO public.resort_upkeep_periods (
    location_id,
    template_id,
    template_version_id,
    template_slug,
    frequency,
    period_start,
    period_end,
    due_date,
    items_snapshot
  )
  VALUES (
    p_location_id,
    v_template.id,
    v_version.id,
    v_template.slug,
    v_template.frequency,
    v_bounds.period_start,
    v_bounds.period_end,
    v_bounds.due_date,
    v_version.items
  )
  ON CONFLICT (location_id, template_slug, period_start) DO UPDATE
  SET updated_at = public.resort_upkeep_periods.updated_at
  RETURNING * INTO v_period;

  RETURN v_period;
END;
$$;

REVOKE ALL ON FUNCTION public.resort_upkeep_ensure_period(uuid, text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resort_upkeep_ensure_period(uuid, text, date) TO authenticated;
