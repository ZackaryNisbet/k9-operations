CREATE OR REPLACE FUNCTION public.resort_upkeep_period_can_edit(
  p_status public.resort_upkeep_period_status,
  p_period_end date,
  p_first_submitted_at timestamptz DEFAULT NULL,
  p_as_of_date date DEFAULT CURRENT_DATE
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_status IN ('submitted', 'late_submitted') THEN false
    WHEN p_first_submitted_at IS NOT NULL
      AND COALESCE(p_as_of_date, CURRENT_DATE) > p_period_end
      THEN false
    ELSE true
  END;
$$;

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
  v_index integer;
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

  FOR v_index IN 0..v_back LOOP
    v_anchor := (COALESCE(p_anchor_date, CURRENT_DATE) - ((v_index * v_months) || ' months')::interval)::date;
    PERFORM public.resort_upkeep_ensure_period(p_location_id, p_template_slug, v_anchor);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.resort_upkeep_get_dashboard(
  p_location_id uuid,
  p_as_of_date date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_template record;
  v_dashboard jsonb;
BEGIN
  IF p_location_id IS NULL THEN
    RAISE EXCEPTION 'location_id is required' USING ERRCODE = '22023';
  END IF;

  IF NOT public.resort_upkeep_can_access(p_location_id) THEN
    RAISE EXCEPTION 'Not authorized for this location' USING ERRCODE = '42501';
  END IF;

  FOR v_template IN
    SELECT DISTINCT ON (slug) slug
    FROM public.resort_upkeep_templates
    WHERE module = 'building_maintenance'
      AND is_active = true
      AND (location_id = p_location_id OR location_id IS NULL)
    ORDER BY
      slug,
      CASE WHEN location_id = p_location_id THEN 0 ELSE 1 END,
      location_id NULLS LAST
  LOOP
    PERFORM public.resort_upkeep_ensure_period_window(p_location_id, v_template.slug, COALESCE(p_as_of_date, CURRENT_DATE), 1);
  END LOOP;

  WITH maintenance AS (
    SELECT
      p.*,
      t.name AS template_name,
      public.resort_upkeep_period_progress(p.id) AS progress
    FROM public.resort_upkeep_periods p
    JOIN public.resort_upkeep_templates t ON t.id = p.template_id
    WHERE p.location_id = p_location_id
      AND p.period_start <= COALESCE(p_as_of_date, CURRENT_DATE)
      AND p.period_end >= COALESCE(p_as_of_date, CURRENT_DATE)
    ORDER BY p.due_date, p.template_slug
  ),
  maintenance_with_status AS (
    SELECT
      maintenance.*,
      public.resort_upkeep_computed_status(maintenance.status, maintenance.due_date, maintenance.period_end, maintenance.progress, COALESCE(p_as_of_date, CURRENT_DATE)) AS computed_status,
      public.resort_upkeep_period_can_edit(maintenance.status, maintenance.period_end, maintenance.first_submitted_at, COALESCE(p_as_of_date, CURRENT_DATE)) AS can_edit,
      public.resort_upkeep_period_can_reopen(maintenance.status, maintenance.period_end, COALESCE(p_as_of_date, CURRENT_DATE)) AS can_reopen
    FROM maintenance
  ),
  maintenance_summary AS (
    SELECT
      count(*)::integer AS active,
      count(*) FILTER (WHERE computed_status = 'overdue')::integer AS overdue,
      count(*) FILTER (WHERE computed_status = 'ready_to_submit')::integer AS ready_to_submit,
      count(*) FILTER (WHERE computed_status IN ('submitted', 'submitted_late'))::integer AS submitted,
      count(*) FILTER (WHERE computed_status IN ('open', 'amending'))::integer AS open
    FROM maintenance_with_status
  ),
  vendor_counts AS (
    SELECT
      count(*) FILTER (WHERE is_archived = false)::integer AS active,
      count(*) FILTER (WHERE is_archived = true)::integer AS archived
    FROM public.resort_upkeep_vendors
    WHERE location_id = p_location_id
  ),
  license_counts AS (
    SELECT
      count(*) FILTER (WHERE is_active = true)::integer AS active,
      count(*) FILTER (WHERE is_active = true AND status = 'non_compliant')::integer AS non_compliant,
      count(*) FILTER (WHERE is_active = true AND expiration_date IS NOT NULL AND expiration_date <= COALESCE(p_as_of_date, CURRENT_DATE) + 45)::integer AS expiring_soon
    FROM public.resort_upkeep_licenses
    WHERE location_id = p_location_id
  )
  SELECT jsonb_build_object(
    'maintenance', COALESCE((
      SELECT jsonb_agg(
        to_jsonb(maintenance_with_status)
        || jsonb_build_object(
          'computed_status', maintenance_with_status.computed_status,
          'can_edit', maintenance_with_status.can_edit,
          'can_reopen', maintenance_with_status.can_reopen
        )
      )
      FROM maintenance_with_status
    ), '[]'::jsonb),
    'maintenance_summary', to_jsonb((SELECT maintenance_summary FROM maintenance_summary)),
    'vendors', to_jsonb((SELECT vendor_counts FROM vendor_counts)),
    'licenses', to_jsonb((SELECT license_counts FROM license_counts)),
    'troubleshooting', COALESCE((
      SELECT jsonb_agg(to_jsonb(a) ORDER BY a.sort_order, a.title)
      FROM public.resort_upkeep_troubleshooting_articles a
      WHERE a.is_active = true
    ), '[]'::jsonb)
  ) INTO v_dashboard;

  RETURN v_dashboard;
END;
$$;

CREATE OR REPLACE FUNCTION public.resort_upkeep_list_periods(
  p_location_id uuid,
  p_template_slug text DEFAULT NULL,
  p_limit integer DEFAULT 48
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_template record;
  v_back integer;
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 48), 1), 120);
  v_result jsonb;
BEGIN
  IF p_location_id IS NULL THEN
    RAISE EXCEPTION 'location_id is required' USING ERRCODE = '22023';
  END IF;

  IF NOT public.resort_upkeep_can_access(p_location_id) THEN
    RAISE EXCEPTION 'Not authorized for this location' USING ERRCODE = '42501';
  END IF;

  FOR v_template IN
    SELECT DISTINCT ON (slug) slug, frequency
    FROM public.resort_upkeep_templates
    WHERE module = 'building_maintenance'
      AND is_active = true
      AND (location_id = p_location_id OR location_id IS NULL)
      AND (p_template_slug IS NULL OR slug = p_template_slug)
    ORDER BY
      slug,
      CASE WHEN location_id = p_location_id THEN 0 ELSE 1 END,
      location_id NULLS LAST
  LOOP
    v_back := CASE v_template.frequency
      WHEN 'monthly' THEN 13
      WHEN 'quarterly' THEN 8
      WHEN 'semi_annual' THEN 6
      WHEN 'annual' THEN 4
      ELSE 6
    END;
    PERFORM public.resort_upkeep_ensure_period_window(p_location_id, v_template.slug, CURRENT_DATE, LEAST(v_back, v_limit - 1));
  END LOOP;

  WITH scoped AS (
    SELECT
      p.*,
      t.name AS template_name,
      public.resort_upkeep_period_progress(p.id) AS progress
    FROM public.resort_upkeep_periods p
    JOIN public.resort_upkeep_templates t ON t.id = p.template_id
    WHERE p.location_id = p_location_id
      AND public.resort_upkeep_can_access(p.location_id)
      AND (p_template_slug IS NULL OR p.template_slug = p_template_slug)
    ORDER BY p.period_start DESC, p.template_slug ASC
    LIMIT v_limit
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'location_id', location_id,
        'template_id', template_id,
        'template_version_id', template_version_id,
        'template_slug', template_slug,
        'template_name', template_name,
        'frequency', frequency,
        'period_start', period_start,
        'period_end', period_end,
        'due_date', due_date,
        'status', status,
        'computed_status', public.resort_upkeep_computed_status(status, due_date, period_end, progress, CURRENT_DATE),
        'can_edit', public.resort_upkeep_period_can_edit(status, period_end, first_submitted_at, CURRENT_DATE),
        'can_reopen', public.resort_upkeep_period_can_reopen(status, period_end, CURRENT_DATE),
        'completed_late', completed_late,
        'first_submitted_at', first_submitted_at,
        'last_submitted_at', last_submitted_at,
        'submitted_by_name', submitted_by_name,
        'revision_number', revision_number,
        'lock_version', lock_version,
        'progress', progress
      )
      ORDER BY period_start DESC, template_slug ASC
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM scoped;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.resort_upkeep_submit_period(
  p_period_id uuid,
  p_actor_name text DEFAULT NULL,
  p_note text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_period public.resort_upkeep_periods%ROWTYPE;
  v_before public.resort_upkeep_periods%ROWTYPE;
  v_progress jsonb;
  v_status public.resort_upkeep_period_status;
BEGIN
  SELECT *
  INTO v_period
  FROM public.resort_upkeep_periods
  WHERE id = p_period_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Checklist period was not found' USING ERRCODE = '22023';
  END IF;

  IF NOT public.resort_upkeep_can_manage(v_period.location_id) THEN
    RAISE EXCEPTION 'Not authorized to submit this checklist' USING ERRCODE = '42501';
  END IF;

  IF v_period.first_submitted_at IS NOT NULL
    AND CURRENT_DATE > v_period.period_end
  THEN
    RAISE EXCEPTION 'Submitted prior checklist periods are immutable' USING ERRCODE = '42501';
  END IF;

  IF v_period.status IN ('submitted', 'late_submitted') THEN
    RAISE EXCEPTION 'Checklist is already submitted. Use Make edits before submitting another revision.' USING ERRCODE = '22023';
  END IF;

  v_progress := public.resort_upkeep_period_progress(p_period_id);
  IF NOT COALESCE((v_progress->>'isComplete')::boolean, false) THEN
    RAISE EXCEPTION 'Checklist cannot be submitted until all required items are complete' USING ERRCODE = '22023';
  END IF;

  v_before := v_period;
  v_status := CASE WHEN CURRENT_DATE > v_period.due_date THEN 'late_submitted'::public.resort_upkeep_period_status ELSE 'submitted'::public.resort_upkeep_period_status END;

  PERFORM set_config('app.resort_upkeep_rpc_write', 'on', true);

  UPDATE public.resort_upkeep_periods
  SET
    status = v_status,
    first_submitted_at = COALESCE(first_submitted_at, now()),
    last_submitted_at = now(),
    submitted_by_user_id = auth.uid(),
    submitted_by_name = COALESCE(NULLIF(p_actor_name, ''), auth.jwt() ->> 'email'),
    completed_late = completed_late OR CURRENT_DATE > due_date,
    revision_number = revision_number + 1,
    lock_version = lock_version + 1,
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('last_submit_note', COALESCE(p_note, ''))
  WHERE id = p_period_id
  RETURNING * INTO v_period;

  INSERT INTO public.resort_upkeep_audit_events (
    location_id,
    entity_type,
    entity_id,
    event_type,
    summary,
    actor_user_id,
    actor_name,
    before_snapshot,
    after_snapshot,
    metadata
  )
  VALUES (
    v_period.location_id,
    'resort_upkeep_period',
    v_period.id,
    CASE WHEN v_period.revision_number > 1 THEN 'period_resubmitted' ELSE 'period_submitted' END,
    CASE WHEN v_status = 'late_submitted' THEN 'Checklist submitted late' ELSE 'Checklist submitted' END,
    auth.uid(),
    COALESCE(NULLIF(p_actor_name, ''), auth.jwt() ->> 'email'),
    to_jsonb(v_before),
    to_jsonb(v_period),
    jsonb_build_object('progress', v_progress, 'note', COALESCE(p_note, ''))
  );

  RETURN jsonb_build_object(
    'period', to_jsonb(v_period),
    'progress', v_progress,
    'computedStatus', public.resort_upkeep_computed_status(v_period.status, v_period.due_date, v_period.period_end, v_progress, CURRENT_DATE),
    'canEdit', public.resort_upkeep_period_can_edit(v_period.status, v_period.period_end, v_period.first_submitted_at, CURRENT_DATE),
    'canReopen', public.resort_upkeep_period_can_reopen(v_period.status, v_period.period_end, CURRENT_DATE)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.resort_upkeep_period_can_edit(public.resort_upkeep_period_status, date, timestamptz, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resort_upkeep_ensure_period_window(uuid, text, date, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resort_upkeep_get_dashboard(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resort_upkeep_list_periods(uuid, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resort_upkeep_submit_period(uuid, text, text) TO authenticated;
