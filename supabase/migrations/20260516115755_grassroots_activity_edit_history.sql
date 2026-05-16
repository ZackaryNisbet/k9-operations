BEGIN;

ALTER TABLE public.grassroots_activity
  ADD COLUMN IF NOT EXISTS updated_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS updated_by_name text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

DROP INDEX IF EXISTS public.grassroots_history_activity_uidx;

ALTER TABLE public.grassroots_history
  DROP CONSTRAINT IF EXISTS grassroots_history_event_type_check;

ALTER TABLE public.grassroots_history
  ADD CONSTRAINT grassroots_history_event_type_check
  CHECK (
    event_type IN (
      'target_created',
      'target_updated',
      'target_moved',
      'target_deleted',
      'development_logged',
      'drop_logged',
      'development_updated',
      'drop_updated'
    )
  );

CREATE OR REPLACE FUNCTION public.grassroots_sync_target_activity_rollup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_target_id uuid := COALESCE(NEW.target_id, OLD.target_id);
BEGIN
  UPDATE public.grassroots_targets t
  SET
    last_contact_date = (
      SELECT max(a.activity_date)
      FROM public.grassroots_activity a
      WHERE a.target_id = v_target_id
    ),
    next_contact_date = (
      SELECT a.next_contact_date
      FROM public.grassroots_activity a
      WHERE a.target_id = v_target_id
        AND a.next_contact_date IS NOT NULL
      ORDER BY a.activity_date DESC, a.created_at DESC
      LIMIT 1
    ),
    updated_at = now()
  WHERE t.id = v_target_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.grassroots_activity_history_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_target public.grassroots_targets%ROWTYPE;
  v_event_type text;
  v_summary text;
  v_changed_fields text[] := ARRAY[]::text[];
BEGIN
  SELECT *
  INTO v_target
  FROM public.grassroots_targets
  WHERE id = COALESCE(NEW.target_id, OLD.target_id);

  IF NOT FOUND THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_event_type := CASE WHEN NEW.activity_type = 'drop' THEN 'drop_logged' ELSE 'development_logged' END;
    v_summary := CASE WHEN NEW.activity_type = 'drop' THEN 'Logged drop' ELSE 'Logged development' END;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.activity_date IS DISTINCT FROM NEW.activity_date THEN
      v_changed_fields := array_append(v_changed_fields, 'activity_date');
    END IF;
    IF OLD.notes IS DISTINCT FROM NEW.notes THEN
      v_changed_fields := array_append(v_changed_fields, 'notes');
    END IF;
    IF OLD.next_contact_date IS DISTINCT FROM NEW.next_contact_date THEN
      v_changed_fields := array_append(v_changed_fields, 'next_contact_date');
    END IF;
    IF COALESCE(OLD.metadata, '{}'::jsonb) IS DISTINCT FROM COALESCE(NEW.metadata, '{}'::jsonb) THEN
      v_changed_fields := array_append(v_changed_fields, 'metadata');
    END IF;

    IF array_length(v_changed_fields, 1) IS NULL THEN
      RETURN NEW;
    END IF;

    v_event_type := CASE WHEN NEW.activity_type = 'drop' THEN 'drop_updated' ELSE 'development_updated' END;
    v_summary := CASE WHEN NEW.activity_type = 'drop' THEN 'Edited drop activity' ELSE 'Edited development' END;
  ELSE
    RETURN COALESCE(NEW, OLD);
  END IF;

  INSERT INTO public.grassroots_history (
    location_id,
    target_id,
    activity_id,
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
    NEW.location_id,
    NEW.target_id,
    NEW.id,
    v_target.category,
    v_event_type,
    COALESCE(v_target.name, ''),
    v_summary,
    CASE WHEN TG_OP = 'INSERT' THEN NEW.created_by_user_id ELSE COALESCE(NEW.updated_by_user_id, NEW.created_by_user_id) END,
    CASE WHEN TG_OP = 'INSERT' THEN NEW.created_by_name ELSE COALESCE(NEW.updated_by_name, NEW.created_by_name, auth.jwt() ->> 'email') END,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    to_jsonb(NEW),
    CASE
      WHEN TG_OP = 'INSERT' THEN jsonb_build_object(
        'activity_date', NEW.activity_date,
        'next_contact_date', NEW.next_contact_date
      )
      ELSE jsonb_build_object(
        'changed_fields', to_jsonb(v_changed_fields),
        'activity_type', NEW.activity_type,
        'activity_date', NEW.activity_date,
        'next_contact_date', NEW.next_contact_date
      )
    END
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_grassroots_activity_history ON public.grassroots_activity;
CREATE TRIGGER trg_grassroots_activity_history
  AFTER INSERT OR UPDATE ON public.grassroots_activity
  FOR EACH ROW EXECUTE FUNCTION public.grassroots_activity_history_trigger();

CREATE OR REPLACE FUNCTION public.update_grassroots_activity_with_history(
  p_activity jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_activity_id uuid := NULLIF(p_activity->>'id', '')::uuid;
  v_location_id uuid := NULLIF(p_activity->>'location_id', '')::uuid;
  v_activity_date date := NULLIF(p_activity->>'activity_date', '')::date;
  v_next_contact_date date := NULLIF(p_activity->>'next_contact_date', '')::date;
  v_notes text := trim(COALESCE(p_activity->>'notes', ''));
  v_metadata jsonb := CASE
    WHEN jsonb_typeof(p_activity->'metadata') = 'object' THEN p_activity->'metadata'
    ELSE '{}'::jsonb
  END;
  v_actor_user_id uuid := COALESCE(NULLIF(p_activity->>'updated_by_user_id', '')::uuid, auth.uid());
  v_actor_name text := NULLIF(trim(COALESCE(p_activity->>'updated_by_name', '')), '');
  v_before public.grassroots_activity%ROWTYPE;
  v_after public.grassroots_activity%ROWTYPE;
  v_target public.grassroots_targets%ROWTYPE;
  v_changed_fields text[] := ARRAY[]::text[];
  v_history public.grassroots_history%ROWTYPE;
BEGIN
  IF v_activity_id IS NULL THEN
    RAISE EXCEPTION 'activity id is required' USING ERRCODE = '22023';
  END IF;

  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'location_id is required' USING ERRCODE = '22023';
  END IF;

  IF v_notes = '' THEN
    RAISE EXCEPTION 'notes are required' USING ERRCODE = '22023';
  END IF;

  IF NOT public.labor_has_management_access(v_location_id) THEN
    RAISE EXCEPTION 'Not authorized to edit grassroots activity for this location' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_before
  FROM public.grassroots_activity
  WHERE id = v_activity_id
    AND location_id = v_location_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Grassroots activity was not found for this location' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_target
  FROM public.grassroots_targets
  WHERE id = v_before.target_id
    AND location_id = v_before.location_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Grassroots activity target was not found' USING ERRCODE = '22023';
  END IF;

  v_activity_date := COALESCE(v_activity_date, v_before.activity_date, CURRENT_DATE);

  IF v_before.activity_date IS DISTINCT FROM v_activity_date THEN
    v_changed_fields := array_append(v_changed_fields, 'activity_date');
  END IF;

  IF v_before.notes IS DISTINCT FROM v_notes THEN
    v_changed_fields := array_append(v_changed_fields, 'notes');
  END IF;

  IF v_before.next_contact_date IS DISTINCT FROM v_next_contact_date THEN
    v_changed_fields := array_append(v_changed_fields, 'next_contact_date');
  END IF;

  IF COALESCE(v_before.metadata, '{}'::jsonb) IS DISTINCT FROM COALESCE(v_metadata, '{}'::jsonb) THEN
    v_changed_fields := array_append(v_changed_fields, 'metadata');
  END IF;

  IF array_length(v_changed_fields, 1) IS NULL THEN
    RETURN jsonb_build_object(
      'activity',
      to_jsonb(v_before),
      'history',
      NULL
    );
  END IF;

  UPDATE public.grassroots_activity
  SET
    activity_date = v_activity_date,
    notes = v_notes,
    next_contact_date = v_next_contact_date,
    metadata = v_metadata,
    updated_by_user_id = v_actor_user_id,
    updated_by_name = v_actor_name,
    updated_at = now()
  WHERE id = v_before.id
    AND location_id = v_before.location_id
  RETURNING * INTO v_after;

  SELECT *
  INTO v_history
  FROM public.grassroots_history
  WHERE activity_id = v_after.id
    AND event_type IN ('drop_updated', 'development_updated')
  ORDER BY event_at DESC, created_at DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'activity',
    to_jsonb(v_after),
    'history',
    to_jsonb(v_history)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_grassroots_activity_with_history(jsonb) TO authenticated;

COMMIT;
