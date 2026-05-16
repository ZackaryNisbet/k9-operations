CREATE OR REPLACE FUNCTION public.resort_upkeep_period_can_reopen(
  p_status public.resort_upkeep_period_status,
  p_period_end date,
  p_as_of_date date DEFAULT CURRENT_DATE
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT p_status IN ('submitted', 'late_submitted')
    AND COALESCE(p_as_of_date, CURRENT_DATE) <= p_period_end;
$$;

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
    WHEN p_first_submitted_at IS NOT NULL
      AND COALESCE(p_as_of_date, CURRENT_DATE) > p_period_end
      THEN false
    WHEN p_status IN ('submitted', 'late_submitted')
      THEN COALESCE(p_as_of_date, CURRENT_DATE) <= p_period_end
    ELSE true
  END;
$$;

CREATE OR REPLACE FUNCTION public.resort_upkeep_get_period_snapshot(p_period_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
WITH period_row AS (
  SELECT p.*, t.name AS template_name
  FROM public.resort_upkeep_periods p
  JOIN public.resort_upkeep_templates t ON t.id = p.template_id
  WHERE p.id = p_period_id
    AND public.resort_upkeep_can_access(p.location_id)
),
progress AS (
  SELECT public.resort_upkeep_period_progress(p_period_id) AS value
)
SELECT jsonb_build_object(
  'period', to_jsonb(p),
  'progress', pr.value,
  'computedStatus', public.resort_upkeep_computed_status(p.status, p.due_date, p.period_end, pr.value, CURRENT_DATE),
  'canEdit', public.resort_upkeep_period_can_edit(p.status, p.period_end, p.first_submitted_at, CURRENT_DATE),
  'canReopen', public.resort_upkeep_period_can_reopen(p.status, p.period_end, CURRENT_DATE),
  'items', COALESCE((
    SELECT jsonb_agg(
      item
      || jsonb_build_object(
        'state', CASE WHEN s.id IS NULL THEN NULL ELSE to_jsonb(s) END,
        'attachments', COALESCE((
          SELECT jsonb_agg(to_jsonb(a) ORDER BY a.uploaded_at DESC)
          FROM public.resort_upkeep_attachments a
          WHERE a.item_state_id = s.id
            AND a.deleted_at IS NULL
        ), '[]'::jsonb)
      )
      ORDER BY COALESCE((item->>'sort_order')::integer, 0)
    )
    FROM jsonb_array_elements(p.items_snapshot) item
    LEFT JOIN public.resort_upkeep_item_states s
      ON s.period_id = p.id
     AND s.item_key = item->>'key'
  ), '[]'::jsonb)
)
FROM period_row p
CROSS JOIN progress pr;
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
    SELECT slug
    FROM public.resort_upkeep_templates
    WHERE module = 'building_maintenance'
      AND is_active = true
      AND (location_id = p_location_id OR location_id IS NULL)
    ORDER BY location_id NULLS LAST, slug
  LOOP
    PERFORM public.resort_upkeep_ensure_period(p_location_id, v_template.slug, COALESCE(p_as_of_date, CURRENT_DATE));
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
        to_jsonb(maintenance)
        || jsonb_build_object(
          'computed_status',
          public.resort_upkeep_computed_status(maintenance.status, maintenance.due_date, maintenance.period_end, maintenance.progress, COALESCE(p_as_of_date, CURRENT_DATE)),
          'can_edit',
          public.resort_upkeep_period_can_edit(maintenance.status, maintenance.period_end, maintenance.first_submitted_at, COALESCE(p_as_of_date, CURRENT_DATE)),
          'can_reopen',
          public.resort_upkeep_period_can_reopen(maintenance.status, maintenance.period_end, COALESCE(p_as_of_date, CURRENT_DATE))
        )
      )
      FROM maintenance
    ), '[]'::jsonb),
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
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
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
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 48), 1), 120)
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
FROM scoped;
$$;

CREATE OR REPLACE FUNCTION public.resort_upkeep_save_item_state(
  p_period_id uuid,
  p_item_key text,
  p_checked boolean,
  p_notes text DEFAULT '',
  p_actor_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_period public.resort_upkeep_periods%ROWTYPE;
  v_before public.resort_upkeep_item_states%ROWTYPE;
  v_after public.resort_upkeep_item_states%ROWTYPE;
  v_progress jsonb;
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
    RAISE EXCEPTION 'Not authorized to update this checklist' USING ERRCODE = '42501';
  END IF;

  IF NOT public.resort_upkeep_period_can_edit(v_period.status, v_period.period_end, v_period.first_submitted_at, CURRENT_DATE) THEN
    RAISE EXCEPTION 'Submitted prior checklist periods are immutable' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_period.items_snapshot) item
    WHERE item->>'key' = p_item_key
  ) THEN
    RAISE EXCEPTION 'Checklist item % is not part of this period', p_item_key USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_before
  FROM public.resort_upkeep_item_states
  WHERE period_id = p_period_id
    AND item_key = p_item_key;

  PERFORM set_config('app.resort_upkeep_rpc_write', 'on', true);

  INSERT INTO public.resort_upkeep_item_states (
    period_id,
    location_id,
    item_key,
    checked,
    notes,
    completed_at,
    completed_by_user_id,
    completed_by_name,
    updated_by_user_id,
    updated_by_name
  )
  VALUES (
    p_period_id,
    v_period.location_id,
    p_item_key,
    COALESCE(p_checked, false),
    COALESCE(p_notes, ''),
    CASE WHEN COALESCE(p_checked, false) THEN now() ELSE NULL END,
    CASE WHEN COALESCE(p_checked, false) THEN auth.uid() ELSE NULL END,
    CASE WHEN COALESCE(p_checked, false) THEN COALESCE(NULLIF(p_actor_name, ''), auth.jwt() ->> 'email') ELSE NULL END,
    auth.uid(),
    COALESCE(NULLIF(p_actor_name, ''), auth.jwt() ->> 'email')
  )
  ON CONFLICT (period_id, item_key) DO UPDATE
  SET
    checked = EXCLUDED.checked,
    notes = EXCLUDED.notes,
    completed_at = CASE WHEN EXCLUDED.checked THEN COALESCE(public.resort_upkeep_item_states.completed_at, EXCLUDED.completed_at, now()) ELSE NULL END,
    completed_by_user_id = CASE WHEN EXCLUDED.checked THEN COALESCE(public.resort_upkeep_item_states.completed_by_user_id, auth.uid()) ELSE NULL END,
    completed_by_name = CASE WHEN EXCLUDED.checked THEN COALESCE(public.resort_upkeep_item_states.completed_by_name, COALESCE(NULLIF(p_actor_name, ''), auth.jwt() ->> 'email')) ELSE NULL END,
    updated_by_user_id = auth.uid(),
    updated_by_name = COALESCE(NULLIF(p_actor_name, ''), auth.jwt() ->> 'email'),
    updated_at = now()
  RETURNING * INTO v_after;

  UPDATE public.resort_upkeep_periods
  SET
    status = CASE
      WHEN status IN ('submitted', 'late_submitted') THEN 'amending'::public.resort_upkeep_period_status
      WHEN status = 'open' THEN 'in_progress'::public.resort_upkeep_period_status
      ELSE status
    END,
    lock_version = lock_version + 1
  WHERE id = p_period_id
  RETURNING * INTO v_period;

  v_progress := public.resort_upkeep_period_progress(p_period_id);

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
    'resort_upkeep_item_state',
    v_after.id,
    CASE WHEN v_period.status = 'amending' THEN 'post_submit_item_changed' ELSE 'item_changed' END,
    'Checklist item updated',
    auth.uid(),
    COALESCE(NULLIF(p_actor_name, ''), auth.jwt() ->> 'email'),
    CASE WHEN v_before.id IS NULL THEN NULL ELSE to_jsonb(v_before) END,
    to_jsonb(v_after),
    jsonb_build_object('period_id', p_period_id, 'item_key', p_item_key, 'progress', v_progress)
  );

  RETURN jsonb_build_object(
    'period', to_jsonb(v_period),
    'itemState', to_jsonb(v_after),
    'progress', v_progress,
    'computedStatus', public.resort_upkeep_computed_status(v_period.status, v_period.due_date, v_period.period_end, v_progress, CURRENT_DATE),
    'canEdit', public.resort_upkeep_period_can_edit(v_period.status, v_period.period_end, v_period.first_submitted_at, CURRENT_DATE),
    'canReopen', public.resort_upkeep_period_can_reopen(v_period.status, v_period.period_end, CURRENT_DATE)
  );
END;
$$;

DROP TRIGGER IF EXISTS trg_resort_upkeep_attachments_audit ON public.resort_upkeep_attachments;
CREATE TRIGGER trg_resort_upkeep_attachments_audit
  AFTER INSERT OR UPDATE ON public.resort_upkeep_attachments
  FOR EACH ROW EXECUTE FUNCTION public.resort_upkeep_audit_row_change();

GRANT EXECUTE ON FUNCTION public.resort_upkeep_period_can_reopen(public.resort_upkeep_period_status, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resort_upkeep_period_can_edit(public.resort_upkeep_period_status, date, timestamptz, date) TO authenticated;
