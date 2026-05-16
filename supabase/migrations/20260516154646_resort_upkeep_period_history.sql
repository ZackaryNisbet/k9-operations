CREATE OR REPLACE FUNCTION public.labor_lite_role_has_default_permission(
  p_role text,
  p_permission_key text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN lower(coalesce(p_role, '')) IN ('enterprise_admin', 'owner', 'developer', 'role_enterprise_admin', 'role_owner') THEN true
    WHEN p_permission_key = 'Resort Upkeep Access' THEN
      lower(coalesce(p_role, '')) IN (
        'supervisor',
        'manager',
        'location_admin',
        'admin',
        'multi_location_admin',
        'regional',
        'enterprise_admin',
        'owner',
        'developer',
        'role_enterprise_admin',
        'role_owner'
      )
    WHEN p_permission_key = 'Resort Upkeep Manage' THEN
      lower(coalesce(p_role, '')) IN (
        'manager',
        'location_admin',
        'admin',
        'multi_location_admin',
        'regional',
        'enterprise_admin',
        'owner',
        'developer',
        'role_enterprise_admin',
        'role_owner'
      )
    WHEN p_permission_key IN ('Labor Interviews', 'Labor Manage Interviews', 'Labor Management') THEN
      lower(coalesce(p_role, '')) IN (
        'supervisor',
        'manager',
        'location_admin',
        'admin',
        'multi_location_admin',
        'regional',
        'enterprise_admin',
        'owner',
        'developer',
        'role_enterprise_admin',
        'role_owner'
      )
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.resort_upkeep_can_access(p_location_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    public.labor_has_lite_permission(p_location_id, 'Resort Upkeep Access')
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role IN ('owner', 'role_owner', 'enterprise_admin', 'role_enterprise_admin')
          OR p.location_id = p_location_id
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.resort_upkeep_can_manage(p_location_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    public.labor_has_lite_permission(p_location_id, 'Resort Upkeep Manage')
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role IN ('owner', 'role_owner', 'enterprise_admin', 'role_enterprise_admin')
          OR (
            p.role IN ('manager', 'location_admin')
            AND p.location_id = p_location_id
          )
        )
    );
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

GRANT EXECUTE ON FUNCTION public.resort_upkeep_list_periods(uuid, text, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.labor_lite_role_has_default_permission(
  p_role text,
  p_permission_key text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN lower(coalesce(p_role, '')) IN ('enterprise_admin', 'owner', 'developer', 'role_enterprise_admin', 'role_owner') THEN true
    WHEN p_permission_key = 'Resort Upkeep Access' THEN
      lower(coalesce(p_role, '')) IN (
        'supervisor',
        'manager',
        'location_admin',
        'admin',
        'multi_location_admin',
        'regional',
        'enterprise_admin',
        'owner',
        'developer',
        'role_enterprise_admin',
        'role_owner'
      )
    WHEN p_permission_key = 'Resort Upkeep Manage' THEN
      lower(coalesce(p_role, '')) IN (
        'manager',
        'location_admin',
        'admin',
        'multi_location_admin',
        'regional',
        'enterprise_admin',
        'owner',
        'developer',
        'role_enterprise_admin',
        'role_owner'
      )
    WHEN p_permission_key IN ('Labor Interviews', 'Labor Manage Interviews', 'Labor Management') THEN
      lower(coalesce(p_role, '')) IN (
        'supervisor',
        'manager',
        'location_admin',
        'admin',
        'multi_location_admin',
        'regional',
        'enterprise_admin',
        'owner',
        'developer',
        'role_enterprise_admin',
        'role_owner'
      )
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.resort_upkeep_can_access(p_location_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    public.labor_has_lite_permission(p_location_id, 'Resort Upkeep Access')
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role IN ('owner', 'role_owner', 'enterprise_admin', 'role_enterprise_admin')
          OR p.location_id = p_location_id
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.resort_upkeep_can_manage(p_location_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    public.labor_has_lite_permission(p_location_id, 'Resort Upkeep Manage')
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role IN ('owner', 'role_owner', 'enterprise_admin', 'role_enterprise_admin')
          OR (
            p.role IN ('manager', 'location_admin')
            AND p.location_id = p_location_id
          )
        )
    );
$$;

GRANT EXECUTE ON FUNCTION public.resort_upkeep_can_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resort_upkeep_can_manage(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.resort_upkeep_audit_row_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row jsonb := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  v_location uuid := COALESCE((v_row->>'location_id')::uuid, NULL);
  v_entity_id uuid := COALESCE((v_row->>'id')::uuid, NULL);
  v_summary text;
BEGIN
  IF v_location IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_TABLE_NAME = 'resort_upkeep_item_states' AND TG_OP = 'UPDATE' THEN
    RETURN NEW;
  END IF;

  v_summary := initcap(replace(TG_TABLE_NAME, '_', ' ')) || ' ' || lower(TG_OP);

  INSERT INTO public.resort_upkeep_audit_events (
    location_id,
    entity_type,
    entity_id,
    event_type,
    summary,
    actor_user_id,
    actor_name,
    before_snapshot,
    after_snapshot
  )
  VALUES (
    v_location,
    TG_TABLE_NAME,
    v_entity_id,
    lower(TG_OP),
    v_summary,
    auth.uid(),
    COALESCE(v_row->>'updated_by_name', v_row->>'created_by_name', auth.jwt() ->> 'email'),
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

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
  v_version public.resort_upkeep_template_versions%ROWTYPE;
  v_bounds record;
  v_period public.resort_upkeep_periods%ROWTYPE;
BEGIN
  IF p_location_id IS NULL THEN
    RAISE EXCEPTION 'location_id is required' USING ERRCODE = '22023';
  END IF;

  IF NOT public.resort_upkeep_can_access(p_location_id) THEN
    RAISE EXCEPTION 'Not authorized for this location' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_template
  FROM public.resort_upkeep_templates
  WHERE slug = p_template_slug
    AND is_active = true
    AND (location_id = p_location_id OR location_id IS NULL)
  ORDER BY location_id NULLS LAST
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Resort upkeep template % was not found', p_template_slug USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_version
  FROM public.resort_upkeep_template_versions
  WHERE id = v_template.active_version_id
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

  IF v_period.status IN ('submitted', 'late_submitted')
    AND CURRENT_DATE > v_period.period_end
  THEN
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
    'computedStatus', public.resort_upkeep_computed_status(v_period.status, v_period.due_date, v_period.period_end, v_progress, CURRENT_DATE)
  );
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
    'computedStatus', public.resort_upkeep_computed_status(v_period.status, v_period.due_date, v_period.period_end, v_progress, CURRENT_DATE)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.resort_upkeep_reopen_period(
  p_period_id uuid,
  p_reason text,
  p_actor_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_before public.resort_upkeep_periods%ROWTYPE;
  v_after public.resort_upkeep_periods%ROWTYPE;
  v_progress jsonb;
BEGIN
  SELECT *
  INTO v_before
  FROM public.resort_upkeep_periods
  WHERE id = p_period_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Checklist period was not found' USING ERRCODE = '22023';
  END IF;

  IF NOT public.resort_upkeep_can_manage(v_before.location_id) THEN
    RAISE EXCEPTION 'Not authorized to reopen this checklist' USING ERRCODE = '42501';
  END IF;

  IF trim(COALESCE(p_reason, '')) = '' THEN
    RAISE EXCEPTION 'A reopen reason is required' USING ERRCODE = '22023';
  END IF;

  IF v_before.status NOT IN ('submitted', 'late_submitted') THEN
    RAISE EXCEPTION 'Only submitted checklist periods can be reopened' USING ERRCODE = '22023';
  END IF;

  IF CURRENT_DATE > v_before.period_end THEN
    RAISE EXCEPTION 'Submitted prior checklist periods are immutable' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.resort_upkeep_rpc_write', 'on', true);

  UPDATE public.resort_upkeep_periods
  SET
    status = 'amending',
    lock_version = lock_version + 1,
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('last_reopen_reason', trim(p_reason))
  WHERE id = p_period_id
  RETURNING * INTO v_after;

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
    v_after.location_id,
    'resort_upkeep_period',
    v_after.id,
    'period_reopened',
    'Checklist reopened for edits',
    auth.uid(),
    COALESCE(NULLIF(p_actor_name, ''), auth.jwt() ->> 'email'),
    to_jsonb(v_before),
    to_jsonb(v_after),
    jsonb_build_object('reason', trim(p_reason), 'progress', v_progress)
  );

  RETURN jsonb_build_object(
    'period', to_jsonb(v_after),
    'progress', v_progress,
    'computedStatus', public.resort_upkeep_computed_status(v_after.status, v_after.due_date, v_after.period_end, v_progress, CURRENT_DATE)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.resort_upkeep_publish_template_version(
  p_template_id uuid,
  p_location_id uuid,
  p_items jsonb,
  p_changelog text DEFAULT '',
  p_actor_name text DEFAULT NULL,
  p_template_name text DEFAULT NULL,
  p_start_month integer DEFAULT NULL,
  p_description text DEFAULT NULL
)
RETURNS public.resort_upkeep_template_versions
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_source_template public.resort_upkeep_templates%ROWTYPE;
  v_target_template public.resort_upkeep_templates%ROWTYPE;
  v_new_version public.resort_upkeep_template_versions%ROWTYPE;
  v_next_version integer;
  v_effective_name text;
  v_effective_start_month integer;
  v_effective_description text;
BEGIN
  IF p_location_id IS NULL THEN
    RAISE EXCEPTION 'location_id is required' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(COALESCE(p_items, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'items must be a JSON array' USING ERRCODE = '22023';
  END IF;

  IF p_start_month IS NOT NULL AND (p_start_month < 1 OR p_start_month > 12) THEN
    RAISE EXCEPTION 'start_month must be between 1 and 12' USING ERRCODE = '22023';
  END IF;

  IF NOT public.resort_upkeep_can_manage(p_location_id) THEN
    RAISE EXCEPTION 'Not authorized to publish this template' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_source_template
  FROM public.resort_upkeep_templates
  WHERE id = p_template_id
    AND module = 'building_maintenance'
    AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template was not found' USING ERRCODE = '22023';
  END IF;

  IF v_source_template.location_id IS NOT NULL AND v_source_template.location_id <> p_location_id THEN
    RAISE EXCEPTION 'Template belongs to a different location' USING ERRCODE = '42501';
  END IF;

  v_effective_name := COALESCE(NULLIF(trim(p_template_name), ''), v_source_template.name);
  v_effective_start_month := COALESCE(p_start_month, v_source_template.start_month);
  v_effective_description := COALESCE(p_description, v_source_template.description);

  PERFORM set_config('app.resort_upkeep_rpc_write', 'on', true);

  IF v_source_template.location_id IS NULL THEN
    INSERT INTO public.resort_upkeep_templates (
      location_id,
      module,
      slug,
      name,
      frequency,
      start_month,
      description,
      metadata,
      is_active
    )
    VALUES (
      p_location_id,
      v_source_template.module,
      v_source_template.slug,
      v_effective_name,
      v_source_template.frequency,
      v_effective_start_month,
      v_effective_description,
      v_source_template.metadata || jsonb_build_object('derived_from_template_id', v_source_template.id),
      true
    )
    ON CONFLICT (location_id, slug) DO UPDATE
    SET
      name = EXCLUDED.name,
      frequency = EXCLUDED.frequency,
      start_month = EXCLUDED.start_month,
      description = EXCLUDED.description,
      metadata = EXCLUDED.metadata,
      is_active = true,
      updated_at = now()
    RETURNING * INTO v_target_template;
  ELSE
    UPDATE public.resort_upkeep_templates
    SET
      name = v_effective_name,
      start_month = v_effective_start_month,
      description = v_effective_description,
      updated_at = now()
    WHERE id = v_source_template.id
    RETURNING * INTO v_target_template;
  END IF;

  SELECT COALESCE(max(version_number), 0) + 1
  INTO v_next_version
  FROM public.resort_upkeep_template_versions
  WHERE template_id = v_target_template.id;

  INSERT INTO public.resort_upkeep_template_versions (
    template_id,
    version_number,
    status,
    items,
    changelog,
    created_by_user_id,
    created_by_name,
    published_at
  )
  VALUES (
    v_target_template.id,
    v_next_version,
    'published',
    p_items,
    COALESCE(p_changelog, ''),
    auth.uid(),
    COALESCE(NULLIF(p_actor_name, ''), auth.jwt() ->> 'email'),
    now()
  )
  RETURNING * INTO v_new_version;

  UPDATE public.resort_upkeep_templates
  SET active_version_id = v_new_version.id,
      updated_at = now()
  WHERE id = v_target_template.id
  RETURNING * INTO v_target_template;

  UPDATE public.resort_upkeep_periods
  SET
    template_id = v_target_template.id,
    template_version_id = v_new_version.id,
    items_snapshot = p_items,
    updated_at = now(),
    lock_version = lock_version + 1
  WHERE location_id = p_location_id
    AND template_slug = v_target_template.slug
    AND status IN ('open', 'in_progress', 'amending')
    AND first_submitted_at IS NULL;

  INSERT INTO public.resort_upkeep_audit_events (
    location_id,
    entity_type,
    entity_id,
    event_type,
    summary,
    actor_user_id,
    actor_name,
    after_snapshot,
    metadata
  )
  VALUES (
    p_location_id,
    'resort_upkeep_template_versions',
    v_new_version.id,
    'template_published',
    'Building maintenance template version published',
    auth.uid(),
    COALESCE(NULLIF(p_actor_name, ''), auth.jwt() ->> 'email'),
    to_jsonb(v_new_version),
    jsonb_build_object(
      'template_id', v_target_template.id,
      'template_name', v_target_template.name,
      'start_month', v_target_template.start_month
    )
  );

  RETURN v_new_version;
END;
$$;

CREATE OR REPLACE FUNCTION public.resort_upkeep_publish_template_version(
  p_template_id uuid,
  p_location_id uuid,
  p_items jsonb,
  p_changelog text DEFAULT '',
  p_actor_name text DEFAULT NULL
)
RETURNS public.resort_upkeep_template_versions
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT public.resort_upkeep_publish_template_version(
    p_template_id,
    p_location_id,
    p_items,
    p_changelog,
    p_actor_name,
    NULL::text,
    NULL::integer,
    NULL::text
  );
$$;

GRANT EXECUTE ON FUNCTION public.resort_upkeep_publish_template_version(uuid, uuid, jsonb, text, text, text, integer, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.resort_upkeep_archive_vendor(
  p_vendor_id uuid,
  p_reason text DEFAULT '',
  p_actor_name text DEFAULT NULL
)
RETURNS public.resort_upkeep_vendors
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_vendor public.resort_upkeep_vendors%ROWTYPE;
BEGIN
  SELECT *
  INTO v_vendor
  FROM public.resort_upkeep_vendors
  WHERE id = p_vendor_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vendor was not found' USING ERRCODE = '22023';
  END IF;

  IF NOT public.resort_upkeep_can_manage(v_vendor.location_id) THEN
    RAISE EXCEPTION 'Not authorized to archive this vendor' USING ERRCODE = '42501';
  END IF;

  UPDATE public.resort_upkeep_vendors
  SET
    is_archived = true,
    archived_at = now(),
    updated_by_user_id = auth.uid(),
    updated_by_name = COALESCE(NULLIF(p_actor_name, ''), auth.jwt() ->> 'email'),
    notes = trim(concat_ws(E'\n', NULLIF(notes, ''), NULLIF('Archive note: ' || COALESCE(p_reason, ''), 'Archive note: '))),
    updated_at = now()
  WHERE id = p_vendor_id
  RETURNING * INTO v_vendor;

  RETURN v_vendor;
END;
$$;

CREATE OR REPLACE FUNCTION public.resort_upkeep_deactivate_license(
  p_license_id uuid,
  p_reason text DEFAULT '',
  p_actor_name text DEFAULT NULL
)
RETURNS public.resort_upkeep_licenses
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_license public.resort_upkeep_licenses%ROWTYPE;
BEGIN
  SELECT *
  INTO v_license
  FROM public.resort_upkeep_licenses
  WHERE id = p_license_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'License was not found' USING ERRCODE = '22023';
  END IF;

  IF NOT public.resort_upkeep_can_manage(v_license.location_id) THEN
    RAISE EXCEPTION 'Not authorized to deactivate this license' USING ERRCODE = '42501';
  END IF;

  UPDATE public.resort_upkeep_licenses
  SET
    is_active = false,
    deactivated_at = now(),
    updated_by_user_id = auth.uid(),
    updated_by_name = COALESCE(NULLIF(p_actor_name, ''), auth.jwt() ->> 'email'),
    notes = trim(concat_ws(E'\n', NULLIF(notes, ''), NULLIF('Deactivation note: ' || COALESCE(p_reason, ''), 'Deactivation note: '))),
    updated_at = now()
  WHERE id = p_license_id
  RETURNING * INTO v_license;

  RETURN v_license;
END;
$$;

DROP POLICY IF EXISTS resort_upkeep_templates_read ON public.resort_upkeep_templates;
CREATE POLICY resort_upkeep_templates_read ON public.resort_upkeep_templates
  FOR SELECT
  USING (location_id IS NULL OR public.resort_upkeep_can_access(location_id));

DROP POLICY IF EXISTS resort_upkeep_templates_write ON public.resort_upkeep_templates;
CREATE POLICY resort_upkeep_templates_write ON public.resort_upkeep_templates
  FOR ALL
  USING (location_id IS NOT NULL AND public.resort_upkeep_can_manage(location_id))
  WITH CHECK (location_id IS NOT NULL AND public.resort_upkeep_can_manage(location_id));

DROP POLICY IF EXISTS resort_upkeep_template_versions_read ON public.resort_upkeep_template_versions;
CREATE POLICY resort_upkeep_template_versions_read ON public.resort_upkeep_template_versions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.resort_upkeep_templates t
      WHERE t.id = template_id
        AND (t.location_id IS NULL OR public.resort_upkeep_can_access(t.location_id))
    )
  );

DROP POLICY IF EXISTS resort_upkeep_template_versions_write ON public.resort_upkeep_template_versions;
CREATE POLICY resort_upkeep_template_versions_write ON public.resort_upkeep_template_versions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.resort_upkeep_templates t
      WHERE t.id = template_id
        AND t.location_id IS NOT NULL
        AND public.resort_upkeep_can_manage(t.location_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.resort_upkeep_templates t
      WHERE t.id = template_id
        AND t.location_id IS NOT NULL
        AND public.resort_upkeep_can_manage(t.location_id)
    )
  );

DROP POLICY IF EXISTS resort_upkeep_periods_read ON public.resort_upkeep_periods;
CREATE POLICY resort_upkeep_periods_read ON public.resort_upkeep_periods
  FOR SELECT
  USING (public.resort_upkeep_can_access(location_id));

DROP POLICY IF EXISTS resort_upkeep_periods_insert ON public.resort_upkeep_periods;
CREATE POLICY resort_upkeep_periods_insert ON public.resort_upkeep_periods
  FOR INSERT
  WITH CHECK (
    current_setting('app.resort_upkeep_rpc_write', true) = 'on'
    AND public.resort_upkeep_can_access(location_id)
  );

DROP POLICY IF EXISTS resort_upkeep_periods_update ON public.resort_upkeep_periods;
CREATE POLICY resort_upkeep_periods_update ON public.resort_upkeep_periods
  FOR UPDATE
  USING (
    current_setting('app.resort_upkeep_rpc_write', true) = 'on'
    AND public.resort_upkeep_can_access(location_id)
  )
  WITH CHECK (
    current_setting('app.resort_upkeep_rpc_write', true) = 'on'
    AND public.resort_upkeep_can_access(location_id)
  );

DROP POLICY IF EXISTS resort_upkeep_item_states_read ON public.resort_upkeep_item_states;
CREATE POLICY resort_upkeep_item_states_read ON public.resort_upkeep_item_states
  FOR SELECT
  USING (public.resort_upkeep_can_access(location_id));

DROP POLICY IF EXISTS resort_upkeep_item_states_write ON public.resort_upkeep_item_states;
CREATE POLICY resort_upkeep_item_states_write ON public.resort_upkeep_item_states
  FOR INSERT
  WITH CHECK (
    current_setting('app.resort_upkeep_rpc_write', true) = 'on'
    AND public.resort_upkeep_can_manage(location_id)
    AND EXISTS (
      SELECT 1
      FROM public.resort_upkeep_periods p
      WHERE p.id = period_id
        AND p.location_id = location_id
    )
  );

DROP POLICY IF EXISTS resort_upkeep_item_states_update ON public.resort_upkeep_item_states;
CREATE POLICY resort_upkeep_item_states_update ON public.resort_upkeep_item_states
  FOR UPDATE
  USING (
    current_setting('app.resort_upkeep_rpc_write', true) = 'on'
    AND public.resort_upkeep_can_manage(location_id)
  )
  WITH CHECK (
    current_setting('app.resort_upkeep_rpc_write', true) = 'on'
    AND public.resort_upkeep_can_manage(location_id)
    AND EXISTS (
      SELECT 1
      FROM public.resort_upkeep_periods p
      WHERE p.id = period_id
        AND p.location_id = location_id
    )
  );

DROP POLICY IF EXISTS resort_upkeep_vendors_read ON public.resort_upkeep_vendors;
CREATE POLICY resort_upkeep_vendors_read ON public.resort_upkeep_vendors
  FOR SELECT
  USING (public.resort_upkeep_can_access(location_id));

DROP POLICY IF EXISTS resort_upkeep_vendors_write ON public.resort_upkeep_vendors;
CREATE POLICY resort_upkeep_vendors_write ON public.resort_upkeep_vendors
  FOR INSERT
  WITH CHECK (public.resort_upkeep_can_manage(location_id));

DROP POLICY IF EXISTS resort_upkeep_vendors_update ON public.resort_upkeep_vendors;
CREATE POLICY resort_upkeep_vendors_update ON public.resort_upkeep_vendors
  FOR UPDATE
  USING (public.resort_upkeep_can_manage(location_id))
  WITH CHECK (public.resort_upkeep_can_manage(location_id));

DROP POLICY IF EXISTS resort_upkeep_vendor_logs_read ON public.resort_upkeep_vendor_logs;
CREATE POLICY resort_upkeep_vendor_logs_read ON public.resort_upkeep_vendor_logs
  FOR SELECT
  USING (public.resort_upkeep_can_access(location_id));

DROP POLICY IF EXISTS resort_upkeep_vendor_logs_write ON public.resort_upkeep_vendor_logs;
CREATE POLICY resort_upkeep_vendor_logs_write ON public.resort_upkeep_vendor_logs
  FOR INSERT
  WITH CHECK (
    public.resort_upkeep_can_manage(location_id)
    AND EXISTS (
      SELECT 1
      FROM public.resort_upkeep_vendors v
      WHERE v.id = vendor_id
        AND v.location_id = location_id
    )
  );

DROP POLICY IF EXISTS resort_upkeep_licenses_read ON public.resort_upkeep_licenses;
CREATE POLICY resort_upkeep_licenses_read ON public.resort_upkeep_licenses
  FOR SELECT
  USING (public.resort_upkeep_can_access(location_id));

DROP POLICY IF EXISTS resort_upkeep_licenses_write ON public.resort_upkeep_licenses;
CREATE POLICY resort_upkeep_licenses_write ON public.resort_upkeep_licenses
  FOR INSERT
  WITH CHECK (public.resort_upkeep_can_manage(location_id));

DROP POLICY IF EXISTS resort_upkeep_licenses_update ON public.resort_upkeep_licenses;
CREATE POLICY resort_upkeep_licenses_update ON public.resort_upkeep_licenses
  FOR UPDATE
  USING (public.resort_upkeep_can_manage(location_id))
  WITH CHECK (public.resort_upkeep_can_manage(location_id));

DROP POLICY IF EXISTS resort_upkeep_license_logs_read ON public.resort_upkeep_license_logs;
CREATE POLICY resort_upkeep_license_logs_read ON public.resort_upkeep_license_logs
  FOR SELECT
  USING (public.resort_upkeep_can_access(location_id));

DROP POLICY IF EXISTS resort_upkeep_license_logs_write ON public.resort_upkeep_license_logs;
CREATE POLICY resort_upkeep_license_logs_write ON public.resort_upkeep_license_logs
  FOR INSERT
  WITH CHECK (
    public.resort_upkeep_can_manage(location_id)
    AND EXISTS (
      SELECT 1
      FROM public.resort_upkeep_licenses l
      WHERE l.id = license_id
        AND l.location_id = location_id
    )
  );

DROP POLICY IF EXISTS resort_upkeep_attachments_read ON public.resort_upkeep_attachments;
CREATE POLICY resort_upkeep_attachments_read ON public.resort_upkeep_attachments
  FOR SELECT
  USING (public.resort_upkeep_can_access(location_id));

DROP POLICY IF EXISTS resort_upkeep_attachments_insert ON public.resort_upkeep_attachments;
CREATE POLICY resort_upkeep_attachments_insert ON public.resort_upkeep_attachments
  FOR INSERT
  WITH CHECK (
    public.resort_upkeep_can_manage(location_id)
    AND storage_bucket = 'resort-upkeep-attachments'
    AND split_part(storage_path, '/', 1) = location_id::text
    AND (period_id IS NULL OR EXISTS (SELECT 1 FROM public.resort_upkeep_periods p WHERE p.id = period_id AND p.location_id = location_id))
    AND (item_state_id IS NULL OR EXISTS (SELECT 1 FROM public.resort_upkeep_item_states s WHERE s.id = item_state_id AND s.location_id = location_id AND (period_id IS NULL OR s.period_id = period_id)))
    AND (vendor_id IS NULL OR EXISTS (SELECT 1 FROM public.resort_upkeep_vendors v WHERE v.id = vendor_id AND v.location_id = location_id))
    AND (license_id IS NULL OR EXISTS (SELECT 1 FROM public.resort_upkeep_licenses l WHERE l.id = license_id AND l.location_id = location_id))
  );

DROP POLICY IF EXISTS resort_upkeep_attachments_update ON public.resort_upkeep_attachments;
CREATE POLICY resort_upkeep_attachments_update ON public.resort_upkeep_attachments
  FOR UPDATE
  USING (public.resort_upkeep_can_manage(location_id))
  WITH CHECK (
    public.resort_upkeep_can_manage(location_id)
    AND storage_bucket = 'resort-upkeep-attachments'
    AND split_part(storage_path, '/', 1) = location_id::text
    AND (period_id IS NULL OR EXISTS (SELECT 1 FROM public.resort_upkeep_periods p WHERE p.id = period_id AND p.location_id = location_id))
    AND (item_state_id IS NULL OR EXISTS (SELECT 1 FROM public.resort_upkeep_item_states s WHERE s.id = item_state_id AND s.location_id = location_id AND (period_id IS NULL OR s.period_id = period_id)))
    AND (vendor_id IS NULL OR EXISTS (SELECT 1 FROM public.resort_upkeep_vendors v WHERE v.id = vendor_id AND v.location_id = location_id))
    AND (license_id IS NULL OR EXISTS (SELECT 1 FROM public.resort_upkeep_licenses l WHERE l.id = license_id AND l.location_id = location_id))
  );

DROP POLICY IF EXISTS resort_upkeep_articles_read ON public.resort_upkeep_troubleshooting_articles;
CREATE POLICY resort_upkeep_articles_read ON public.resort_upkeep_troubleshooting_articles
  FOR SELECT
  USING (is_active = true);

DROP POLICY IF EXISTS resort_upkeep_articles_write ON public.resort_upkeep_troubleshooting_articles;
CREATE POLICY resort_upkeep_articles_write ON public.resort_upkeep_troubleshooting_articles
  FOR ALL
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS resort_upkeep_audit_events_read ON public.resort_upkeep_audit_events;
CREATE POLICY resort_upkeep_audit_events_read ON public.resort_upkeep_audit_events
  FOR SELECT
  USING (location_id IS NULL OR public.resort_upkeep_can_access(location_id));

DROP POLICY IF EXISTS resort_upkeep_audit_events_insert ON public.resort_upkeep_audit_events;
CREATE POLICY resort_upkeep_audit_events_insert ON public.resort_upkeep_audit_events
  FOR INSERT
  WITH CHECK (
    current_setting('app.resort_upkeep_rpc_write', true) = 'on'
    AND (location_id IS NULL OR public.resort_upkeep_can_access(location_id))
  );

DROP POLICY IF EXISTS resort_upkeep_storage_select ON storage.objects;
CREATE POLICY resort_upkeep_storage_select
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'resort-upkeep-attachments'
    AND array_length(storage.foldername(name), 1) >= 2
    AND CASE
      WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN public.resort_upkeep_can_access(((storage.foldername(name))[1])::uuid)
      ELSE false
    END
  );

DROP POLICY IF EXISTS resort_upkeep_storage_insert ON storage.objects;
CREATE POLICY resort_upkeep_storage_insert
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'resort-upkeep-attachments'
    AND array_length(storage.foldername(name), 1) >= 2
    AND CASE
      WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN public.resort_upkeep_can_manage(((storage.foldername(name))[1])::uuid)
      ELSE false
    END
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'resort_upkeep_templates'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.resort_upkeep_templates;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'resort_upkeep_template_versions'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.resort_upkeep_template_versions;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'resort_upkeep_troubleshooting_articles'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.resort_upkeep_troubleshooting_articles;
    END IF;
  END IF;
END $$;
