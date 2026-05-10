BEGIN;

-- Grassroots event workflow cleanup:
-- - collapse legacy Outreach/Closing/Active statuses into Identified/Booked
-- - add normalized, non-consecutive event date rows with per-day times
-- Rollback path: restore the old status check/default, drop grassroots_event_dates,
-- and redeploy the previous update_pct_readiness_cell definition from
-- 20260510013419_pct_team_readiness_board.sql.

ALTER TABLE public.grassroots_targets
  DROP CONSTRAINT IF EXISTS grassroots_targets_status_check;

UPDATE public.grassroots_targets
SET status = CASE
  WHEN status = 'outreach' THEN 'identified'
  WHEN status = 'closing' THEN 'booked'
  WHEN status = 'active' THEN 'booked'
  WHEN status = 'corresponding' THEN 'corresponding'
  ELSE 'identified'
END
WHERE status IS DISTINCT FROM CASE
  WHEN status = 'outreach' THEN 'identified'
  WHEN status = 'closing' THEN 'booked'
  WHEN status = 'active' THEN 'booked'
  WHEN status = 'corresponding' THEN 'corresponding'
  ELSE 'identified'
END;

ALTER TABLE public.grassroots_targets
  ALTER COLUMN status SET DEFAULT 'identified';

ALTER TABLE public.grassroots_targets
  ADD CONSTRAINT grassroots_targets_status_check
  CHECK (status IN ('identified', 'corresponding', 'booked'));

CREATE TABLE IF NOT EXISTS public.grassroots_event_dates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  target_id uuid NOT NULL REFERENCES public.grassroots_targets(id) ON DELETE CASCADE,
  event_date date NOT NULL,
  start_time time,
  end_time time,
  sequence_order integer NOT NULL DEFAULT 1,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid,
  created_by_name text,
  updated_by_user_id uuid,
  updated_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT grassroots_event_dates_time_order_check
    CHECK (end_time IS NULL OR start_time IS NULL OR end_time >= start_time)
);

CREATE INDEX IF NOT EXISTS grassroots_event_dates_target_idx
  ON public.grassroots_event_dates (target_id, event_date, sequence_order);

CREATE INDEX IF NOT EXISTS grassroots_event_dates_location_date_idx
  ON public.grassroots_event_dates (location_id, event_date);

DROP TRIGGER IF EXISTS trg_grassroots_event_dates_updated ON public.grassroots_event_dates;
CREATE TRIGGER trg_grassroots_event_dates_updated
  BEFORE UPDATE ON public.grassroots_event_dates
  FOR EACH ROW EXECUTE FUNCTION public.grassroots_updated_at_trigger();

ALTER TABLE public.grassroots_event_dates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS grassroots_event_dates_read ON public.grassroots_event_dates;
CREATE POLICY grassroots_event_dates_read ON public.grassroots_event_dates
  FOR SELECT TO authenticated
  USING (public.labor_has_location_access(location_id));

DROP POLICY IF EXISTS grassroots_event_dates_insert ON public.grassroots_event_dates;
CREATE POLICY grassroots_event_dates_insert ON public.grassroots_event_dates
  FOR INSERT TO authenticated
  WITH CHECK (
    public.labor_has_management_access(location_id)
    AND EXISTS (
      SELECT 1
      FROM public.grassroots_targets t
      WHERE t.id = grassroots_event_dates.target_id
        AND t.location_id = grassroots_event_dates.location_id
        AND t.category = 'events'
    )
  );

DROP POLICY IF EXISTS grassroots_event_dates_update ON public.grassroots_event_dates;
CREATE POLICY grassroots_event_dates_update ON public.grassroots_event_dates
  FOR UPDATE TO authenticated
  USING (public.labor_has_management_access(location_id))
  WITH CHECK (
    public.labor_has_management_access(location_id)
    AND EXISTS (
      SELECT 1
      FROM public.grassroots_targets t
      WHERE t.id = grassroots_event_dates.target_id
        AND t.location_id = grassroots_event_dates.location_id
        AND t.category = 'events'
    )
  );

DROP POLICY IF EXISTS grassroots_event_dates_delete ON public.grassroots_event_dates;
CREATE POLICY grassroots_event_dates_delete ON public.grassroots_event_dates
  FOR DELETE TO authenticated
  USING (public.labor_has_management_access(location_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.grassroots_event_dates TO authenticated;

INSERT INTO public.grassroots_event_dates (
  location_id,
  target_id,
  event_date,
  sequence_order,
  metadata,
  created_by_user_id,
  created_by_name,
  updated_by_user_id,
  updated_by_name,
  created_at,
  updated_at
)
SELECT
  t.location_id,
  t.id,
  t.event_start_date,
  1,
  jsonb_build_object('source', 'legacy_event_start_date', 'legacy_event_time', t.event_time),
  t.created_by_user_id,
  t.created_by_name,
  t.updated_by_user_id,
  t.updated_by_name,
  COALESCE(t.created_at, now()),
  COALESCE(t.updated_at, now())
FROM public.grassroots_targets t
WHERE t.category = 'events'
  AND t.event_start_date IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.grassroots_event_dates d
    WHERE d.target_id = t.id
  );

CREATE OR REPLACE FUNCTION public.grassroots_event_date_history_trigger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_target public.grassroots_targets%ROWTYPE;
  v_row public.grassroots_event_dates%ROWTYPE;
  v_summary text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_row := OLD;
  ELSE
    v_row := NEW;
  END IF;

  SELECT *
  INTO v_target
  FROM public.grassroots_targets
  WHERE id = v_row.target_id;

  IF NOT FOUND THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  v_summary := CASE
    WHEN TG_OP = 'INSERT' THEN 'Added event date'
    WHEN TG_OP = 'DELETE' THEN 'Removed event date'
    ELSE 'Updated event date'
  END;

  INSERT INTO public.grassroots_history (
    location_id,
    target_id,
    category,
    event_type,
    target_name,
    summary,
    actor_user_id,
    actor_name,
    before_snapshot,
    after_snapshot,
    metadata
  )
  VALUES (
    v_target.location_id,
    v_target.id,
    v_target.category,
    'target_updated',
    COALESCE(v_target.name, ''),
    v_summary,
    CASE
      WHEN TG_OP = 'DELETE' THEN COALESCE(OLD.updated_by_user_id, OLD.created_by_user_id)
      ELSE COALESCE(NEW.updated_by_user_id, NEW.created_by_user_id)
    END,
    CASE
      WHEN TG_OP = 'DELETE' THEN COALESCE(OLD.updated_by_name, OLD.created_by_name)
      ELSE COALESCE(NEW.updated_by_name, NEW.created_by_name)
    END,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END,
    jsonb_build_object('event_date_id', v_row.id, 'event_date', v_row.event_date)
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_grassroots_event_date_history ON public.grassroots_event_dates;
CREATE TRIGGER trg_grassroots_event_date_history
  AFTER INSERT OR UPDATE OR DELETE ON public.grassroots_event_dates
  FOR EACH ROW EXECUTE FUNCTION public.grassroots_event_date_history_trigger();

-- Training readiness board actor attribution. New updates are stamped from the
-- authenticated actor and client-provided trainer display strings are ignored.

CREATE OR REPLACE FUNCTION public.update_pct_readiness_cell(
  p_record_id uuid,
  p_template_item_id uuid,
  p_readiness_status text,
  p_demonstrated_by text DEFAULT NULL,
  p_verified_by text DEFAULT NULL,
  p_comment text DEFAULT NULL,
  p_actor_user_id uuid DEFAULT NULL,
  p_actor_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_record public.training_records%ROWTYPE;
  v_result public.training_record_item_results%ROWTYPE;
  v_before jsonb;
  v_readiness_status text := lower(regexp_replace(trim(COALESCE(p_readiness_status, 'not_started')), '[^a-z0-9]+', '_', 'g'));
  v_item_status public.training_item_status;
  v_actor_user_id uuid := COALESCE(auth.uid(), p_actor_user_id);
  v_actor_name text;
  v_note_text text := NULLIF(trim(COALESCE(p_comment, '')), '');
  v_updated_record public.training_records%ROWTYPE;
  v_actor_metadata jsonb;
BEGIN
  IF v_readiness_status IN ('verified', 'qualified', 'verified_qualified') THEN
    v_readiness_status := 'verified';
    v_item_status := 'complete';
  ELSIF v_readiness_status = 'demonstrated' THEN
    v_item_status := 'in_progress';
  ELSIF v_readiness_status = 'needs_coaching' THEN
    v_item_status := 'needs_coaching';
  ELSIF v_readiness_status = 'blocked' THEN
    v_item_status := 'blocked';
  ELSIF v_readiness_status = 'waived' THEN
    v_item_status := 'waived';
  ELSIF v_readiness_status = 'not_started' THEN
    v_item_status := 'not_started';
  ELSE
    RAISE EXCEPTION 'Unsupported PCT readiness status %', p_readiness_status;
  END IF;

  SELECT record.*
  INTO v_record
  FROM public.training_records record
  JOIN public.training_templates template ON template.id = record.template_id
  WHERE record.id = p_record_id
    AND template.slug = 'pct_team_readiness_board'
    AND record.overall_status <> 'archived';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PCT readiness record % was not found', p_record_id;
  END IF;

  SELECT COALESCE(NULLIF(trim(lp.full_name), ''), NULLIF(trim(lp.email), ''))
  INTO v_actor_name
  FROM public.lite_profiles lp
  LEFT JOIN public.locations loc ON loc.slug = lp.location_id
  WHERE lp.user_id = v_actor_user_id
    AND lp.is_active = true
    AND (
      loc.id = v_record.location_id
      OR lp.role = 'enterprise_admin'
    )
  ORDER BY CASE WHEN loc.id = v_record.location_id THEN 0 ELSE 1 END, lp.updated_at DESC
  LIMIT 1;

  v_actor_name := COALESCE(v_actor_name, auth.jwt() ->> 'email', NULLIF(trim(COALESCE(p_actor_name, '')), ''), 'System');
  v_actor_metadata := jsonb_build_object(
    'last_updated_by_name', v_actor_name,
    'last_updated_by_user_id', v_actor_user_id,
    'last_updated_at', now(),
    'attribution_source', 'authenticated_actor'
  );

  SELECT *
  INTO v_result
  FROM public.training_record_item_results
  WHERE record_id = p_record_id
    AND template_item_id = p_template_item_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PCT readiness item % was not found for record %', p_template_item_id, p_record_id;
  END IF;

  v_before := to_jsonb(v_result);

  IF v_readiness_status = 'demonstrated' THEN
    v_actor_metadata := v_actor_metadata || jsonb_build_object(
      'demonstrated_by_name', v_actor_name,
      'demonstrated_by_user_id', v_actor_user_id
    );
  ELSIF v_readiness_status IN ('verified', 'waived') THEN
    v_actor_metadata := v_actor_metadata || jsonb_build_object(
      'verified_by_name', v_actor_name,
      'verified_by_user_id', v_actor_user_id
    );
  END IF;

  UPDATE public.training_record_item_results
  SET
    status = v_item_status,
    completed_by_user_id = CASE WHEN v_item_status IN ('complete', 'passed', 'waived') THEN v_actor_user_id ELSE NULL END,
    completed_by_name = CASE WHEN v_item_status IN ('complete', 'passed', 'waived') THEN v_actor_name ELSE NULL END,
    completed_at = CASE WHEN v_item_status IN ('complete', 'passed', 'waived') THEN COALESCE(completed_at, now()) ELSE NULL END,
    evaluated_by_user_id = CASE WHEN v_item_status <> 'not_started' THEN v_actor_user_id ELSE NULL END,
    evaluated_by_name = CASE WHEN v_item_status <> 'not_started' THEN v_actor_name ELSE NULL END,
    metadata = COALESCE(metadata, '{}'::jsonb)
      || jsonb_build_object('pct_readiness_status', v_readiness_status)
      || v_actor_metadata,
    updated_at = now()
  WHERE id = v_result.id
  RETURNING * INTO v_result;

  IF v_note_text IS NOT NULL THEN
    INSERT INTO public.training_record_notes (
      record_id,
      template_section_id,
      template_item_id,
      note_text,
      initials,
      created_by_user_id,
      created_by_name
    )
    VALUES (
      p_record_id,
      v_result.template_section_id,
      p_template_item_id,
      v_note_text,
      public.labor_initials(v_actor_name),
      v_actor_user_id,
      v_actor_name
    );
  END IF;

  v_updated_record := public.recalculate_pct_readiness_record(p_record_id, v_actor_user_id);

  INSERT INTO public.training_record_events (
    record_id,
    template_item_id,
    event_type,
    actor_user_id,
    actor_name,
    before_state,
    after_state
  )
  VALUES (
    p_record_id,
    p_template_item_id,
    'item_status_changed',
    v_actor_user_id,
    v_actor_name,
    v_before,
    to_jsonb(v_result)
  );

  RETURN jsonb_build_object(
    'result', to_jsonb(v_result),
    'record', to_jsonb(v_updated_record)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_pct_readiness_cell(uuid, uuid, text, text, text, text, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.pct_readiness_legacy_actor_match(
  p_raw_name text,
  p_location_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_name text := NULLIF(trim(COALESCE(p_raw_name, '')), '');
  v_key text;
  v_employee public.labor_employees%ROWTYPE;
  v_method text := 'known_alias';
BEGIN
  IF v_name IS NULL THEN
    RETURN NULL;
  END IF;

  IF lower(v_name) LIKE '%need%' OR lower(v_name) LIKE '%quality%' OR lower(v_name) LIKE '%walkie%' OR length(v_name) > 34 THEN
    RETURN jsonb_build_object('matched', false, 'kind', 'note', 'legacy_name', v_name);
  END IF;

  v_key := regexp_replace(lower(v_name), '[^a-z0-9]+', '', 'g');

  IF v_key IN ('angelinad', 'anglelinad', 'angleinad') THEN
    SELECT *
    INTO v_employee
    FROM public.labor_employees
    WHERE location_id = p_location_id
      AND lower(full_name) LIKE 'angelina d%'
    ORDER BY CASE WHEN employment_status = 'active' THEN 0 ELSE 1 END, full_name
    LIMIT 1;
  ELSIF v_key IN ('zachc', 'zackc') THEN
    SELECT *
    INTO v_employee
    FROM public.labor_employees
    WHERE location_id = p_location_id
      AND lower(full_name) LIKE 'zach%c%ruz%'
    ORDER BY CASE WHEN employment_status = 'active' THEN 0 ELSE 1 END, full_name
    LIMIT 1;
  ELSIF v_key = 'juliaz' THEN
    SELECT *
    INTO v_employee
    FROM public.labor_employees
    WHERE location_id = p_location_id
      AND lower(full_name) LIKE 'julia %'
    ORDER BY CASE WHEN employment_status = 'active' THEN 0 ELSE 1 END, full_name
    LIMIT 1;
  ELSE
    v_method := 'first_name_last_initial';
    SELECT *
    INTO v_employee
    FROM public.labor_employees
    WHERE location_id = p_location_id
      AND regexp_replace(lower(full_name), '[^a-z0-9]+', '', 'g') = v_key
    ORDER BY CASE WHEN employment_status = 'active' THEN 0 ELSE 1 END, full_name
    LIMIT 1;
  END IF;

  IF v_employee.id IS NULL THEN
    RETURN jsonb_build_object('matched', false, 'kind', 'person', 'legacy_name', v_name);
  END IF;

  RETURN jsonb_build_object(
    'matched', true,
    'kind', 'person',
    'legacy_name', v_name,
    'labor_employee_id', v_employee.id,
    'display_name', v_employee.full_name,
    'match_method', v_method
  );
END;
$$;

WITH readiness_results AS (
  SELECT
    result.id,
    record.location_id,
    result.metadata,
    public.pct_readiness_legacy_actor_match(result.metadata->>'demonstrated_by_name', record.location_id) AS demonstrated_match,
    public.pct_readiness_legacy_actor_match(result.metadata->>'verified_by_name', record.location_id) AS verified_match
  FROM public.training_record_item_results result
  JOIN public.training_records record ON record.id = result.record_id
  JOIN public.training_templates template ON template.id = record.template_id
  WHERE template.slug = 'pct_team_readiness_board'
    AND (
      result.metadata ? 'demonstrated_by_name'
      OR result.metadata ? 'verified_by_name'
    )
)
UPDATE public.training_record_item_results result
SET metadata =
  COALESCE(result.metadata, '{}'::jsonb)
  || CASE
    WHEN readiness_results.demonstrated_match->>'matched' = 'true' THEN jsonb_build_object(
      'legacy_demonstrated_by_name', result.metadata->>'demonstrated_by_name',
      'demonstrated_by_name', readiness_results.demonstrated_match->>'display_name',
      'demonstrated_by_labor_employee_id', readiness_results.demonstrated_match->>'labor_employee_id',
      'demonstrated_by_match_method', readiness_results.demonstrated_match->>'match_method'
    )
    WHEN readiness_results.demonstrated_match IS NOT NULL THEN jsonb_build_object(
      'legacy_demonstrated_by_name', result.metadata->>'demonstrated_by_name',
      'demonstrated_by_match_status', readiness_results.demonstrated_match->>'kind'
    )
    ELSE '{}'::jsonb
  END
  || CASE
    WHEN readiness_results.verified_match->>'matched' = 'true' THEN jsonb_build_object(
      'legacy_verified_by_name', result.metadata->>'verified_by_name',
      'verified_by_name', readiness_results.verified_match->>'display_name',
      'verified_by_labor_employee_id', readiness_results.verified_match->>'labor_employee_id',
      'verified_by_match_method', readiness_results.verified_match->>'match_method'
    )
    WHEN readiness_results.verified_match IS NOT NULL THEN jsonb_build_object(
      'legacy_verified_by_name', result.metadata->>'verified_by_name',
      'verified_by_match_status', readiness_results.verified_match->>'kind'
    )
    ELSE '{}'::jsonb
  END,
  updated_at = now()
FROM readiness_results
WHERE result.id = readiness_results.id;

DROP FUNCTION public.pct_readiness_legacy_actor_match(text, uuid);

COMMIT;
