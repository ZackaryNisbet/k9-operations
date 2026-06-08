-- Fix: the period-write RPCs (save_item_state, submit_period, reopen_period) ran
-- `SELECT ... FOR UPDATE` on resort_upkeep_periods BEFORE setting the
-- `app.resort_upkeep_rpc_write` session GUC. Under RLS, a locking SELECT also
-- applies the table's UPDATE policy, whose USING clause requires that GUC to be
-- 'on'. Because it was not set yet, the row was filtered out of the locking
-- read and the function raised "Checklist period was not found" — so checking
-- off items, submitting, and reopening all failed. The fix sets the write GUC
-- as the first statement after BEGIN. Function bodies are otherwise unchanged.
--
-- Applied live to project YOUR_SUPABASE_PROJECT_REF on 2026-05-30 via the Supabase
-- tooling; this file mirrors that change for the repo history. Additive only.

CREATE OR REPLACE FUNCTION public.resort_upkeep_save_item_state(p_period_id uuid, p_item_key text, p_checked boolean, p_notes text DEFAULT ''::text, p_actor_name text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_period public.resort_upkeep_periods%ROWTYPE;
  v_before public.resort_upkeep_item_states%ROWTYPE;
  v_after public.resort_upkeep_item_states%ROWTYPE;
  v_progress jsonb;
BEGIN
  PERFORM set_config('app.resort_upkeep_rpc_write', 'on', true);

  SELECT *
  INTO v_period
  FROM public.resort_upkeep_periods
  WHERE id = p_period_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Checklist period was not found' USING ERRCODE = '22023';
  END IF;

  IF NOT public.resort_upkeep_can_complete(v_period.location_id) THEN
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
$function$;

CREATE OR REPLACE FUNCTION public.resort_upkeep_submit_period(p_period_id uuid, p_actor_name text DEFAULT NULL::text, p_note text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_period public.resort_upkeep_periods%ROWTYPE;
  v_before public.resort_upkeep_periods%ROWTYPE;
  v_progress jsonb;
  v_status public.resort_upkeep_period_status;
BEGIN
  PERFORM set_config('app.resort_upkeep_rpc_write', 'on', true);

  SELECT *
  INTO v_period
  FROM public.resort_upkeep_periods
  WHERE id = p_period_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Checklist period was not found' USING ERRCODE = '22023';
  END IF;

  IF NOT public.resort_upkeep_can_complete(v_period.location_id) THEN
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
$function$;

CREATE OR REPLACE FUNCTION public.resort_upkeep_reopen_period(p_period_id uuid, p_reason text, p_actor_name text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_before public.resort_upkeep_periods%ROWTYPE;
  v_after public.resort_upkeep_periods%ROWTYPE;
  v_progress jsonb;
BEGIN
  PERFORM set_config('app.resort_upkeep_rpc_write', 'on', true);

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
$function$;
