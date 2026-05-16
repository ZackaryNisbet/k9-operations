CREATE OR REPLACE FUNCTION public.resort_upkeep_ensure_period_window(
  p_location_id uuid,
  p_template_slug text,
  p_anchor_date date DEFAULT CURRENT_DATE,
  p_periods_back integer DEFAULT 1
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_frequency public.resort_upkeep_frequency;
  v_months integer;
  v_back integer := LEAST(GREATEST(COALESCE(p_periods_back, 1), 0), 60);
  v_offset integer;
  v_anchor date;
BEGIN
  IF p_location_id IS NULL THEN
    RAISE EXCEPTION 'location_id is required' USING ERRCODE = '22023';
  END IF;

  IF NOT public.resort_upkeep_can_access(p_location_id) THEN
    RAISE EXCEPTION 'Not authorized for this location' USING ERRCODE = '42501';
  END IF;

  SELECT frequency
  INTO v_frequency
  FROM public.resort_upkeep_templates
  WHERE slug = p_template_slug
    AND is_active = true
    AND (location_id = p_location_id OR location_id IS NULL)
  ORDER BY
    CASE WHEN location_id = p_location_id THEN 0 ELSE 1 END,
    location_id NULLS LAST
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Resort upkeep template % was not found', p_template_slug USING ERRCODE = '22023';
  END IF;

  v_months := CASE v_frequency
    WHEN 'monthly' THEN 1
    WHEN 'quarterly' THEN 3
    WHEN 'semi_annual' THEN 6
    WHEN 'annual' THEN 12
    ELSE 1
  END;

  FOR v_offset IN 0..v_back LOOP
    v_anchor := (COALESCE(p_anchor_date, CURRENT_DATE) - ((v_offset * v_months) || ' months')::interval)::date;
    PERFORM public.resort_upkeep_ensure_period(p_location_id, p_template_slug, v_anchor);
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resort_upkeep_ensure_period_window(uuid, text, date, integer) TO authenticated;
