BEGIN;

CREATE TABLE IF NOT EXISTS public.grassroots_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  target_id uuid,
  activity_id uuid,
  category text NOT NULL CHECK (
    category IN (
      'events',
      'drops',
      'corporate_partnerships',
      'apartments',
      'pet_professional_partnerships'
    )
  ),
  event_type text NOT NULL CHECK (
    event_type IN (
      'target_created',
      'target_updated',
      'target_moved',
      'target_deleted',
      'development_logged',
      'drop_logged'
    )
  ),
  target_name text NOT NULL DEFAULT '',
  summary text NOT NULL DEFAULT '',
  actor_user_id uuid,
  actor_name text,
  before_snapshot jsonb,
  after_snapshot jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  event_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS grassroots_history_location_category_idx
  ON public.grassroots_history (location_id, category, event_at DESC);

CREATE INDEX IF NOT EXISTS grassroots_history_target_idx
  ON public.grassroots_history (target_id, event_at DESC)
  WHERE target_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS grassroots_history_activity_idx
  ON public.grassroots_history (activity_id)
  WHERE activity_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS grassroots_history_target_created_uidx
  ON public.grassroots_history (target_id)
  WHERE event_type = 'target_created' AND target_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS grassroots_history_activity_uidx
  ON public.grassroots_history (activity_id)
  WHERE activity_id IS NOT NULL;

ALTER TABLE public.grassroots_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS grassroots_history_read ON public.grassroots_history;
CREATE POLICY grassroots_history_read ON public.grassroots_history
  FOR SELECT TO authenticated
  USING (public.labor_has_location_access(location_id));

DROP POLICY IF EXISTS grassroots_history_insert ON public.grassroots_history;
CREATE POLICY grassroots_history_insert ON public.grassroots_history
  FOR INSERT TO authenticated
  WITH CHECK (public.labor_has_management_access(location_id));

GRANT SELECT, INSERT ON public.grassroots_history TO authenticated;

CREATE OR REPLACE FUNCTION public.grassroots_target_history_trigger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_event_type text;
  v_summary text;
  v_before jsonb;
  v_after jsonb;
  v_metadata jsonb := '{}'::jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_event_type := 'target_deleted';
    v_summary := 'Deleted row';
    v_before := to_jsonb(OLD);
    v_after := NULL;
    v_metadata := jsonb_build_object('deleted_target_id', OLD.id);
  ELSIF TG_OP = 'INSERT' THEN
    v_event_type := 'target_created';
    v_summary := 'Created row';
    v_before := NULL;
    v_after := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    v_before := to_jsonb(OLD);
    v_after := to_jsonb(NEW);

    IF (v_before - 'last_contact_date' - 'next_contact_date' - 'updated_at' - 'updated_by_user_id' - 'updated_by_name')
       = (v_after - 'last_contact_date' - 'next_contact_date' - 'updated_at' - 'updated_by_user_id' - 'updated_by_name') THEN
      RETURN NEW;
    END IF;

    IF NEW.category IS DISTINCT FROM OLD.category THEN
      v_event_type := 'target_moved';
      v_summary := 'Moved row from ' || OLD.category || ' to ' || NEW.category;
      v_metadata := jsonb_build_object('from_category', OLD.category, 'to_category', NEW.category);
    ELSE
      v_event_type := 'target_updated';
      v_summary := 'Edited row';
    END IF;
  ELSE
    RETURN NEW;
  END IF;

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
    CASE WHEN TG_OP = 'DELETE' THEN OLD.location_id ELSE NEW.location_id END,
    CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END,
    CASE WHEN TG_OP = 'DELETE' THEN OLD.category ELSE NEW.category END,
    v_event_type,
    CASE WHEN TG_OP = 'DELETE' THEN COALESCE(OLD.name, '') ELSE COALESCE(NEW.name, '') END,
    v_summary,
    CASE
      WHEN TG_OP = 'DELETE' THEN COALESCE(OLD.updated_by_user_id, auth.uid(), OLD.created_by_user_id)
      ELSE COALESCE(NEW.updated_by_user_id, NEW.created_by_user_id)
    END,
    CASE
      WHEN TG_OP = 'DELETE' THEN COALESCE(OLD.updated_by_name, OLD.created_by_name, auth.jwt() ->> 'email')
      ELSE COALESCE(NEW.updated_by_name, NEW.created_by_name)
    END,
    v_before,
    v_after,
    v_metadata
  )
  ON CONFLICT DO NOTHING;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_grassroots_target_history ON public.grassroots_targets;
CREATE TRIGGER trg_grassroots_target_history
  AFTER INSERT OR UPDATE OR DELETE ON public.grassroots_targets
  FOR EACH ROW EXECUTE FUNCTION public.grassroots_target_history_trigger();

CREATE OR REPLACE FUNCTION public.grassroots_activity_history_trigger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_target public.grassroots_targets%ROWTYPE;
  v_event_type text;
BEGIN
  SELECT *
  INTO v_target
  FROM public.grassroots_targets
  WHERE id = NEW.target_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_event_type := CASE WHEN NEW.activity_type = 'drop' THEN 'drop_logged' ELSE 'development_logged' END;

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
    CASE WHEN NEW.activity_type = 'drop' THEN 'Logged drop' ELSE 'Logged development' END,
    NEW.created_by_user_id,
    NEW.created_by_name,
    to_jsonb(NEW),
    jsonb_build_object(
      'activity_date', NEW.activity_date,
      'next_contact_date', NEW.next_contact_date
    )
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_grassroots_activity_history ON public.grassroots_activity;
CREATE TRIGGER trg_grassroots_activity_history
  AFTER INSERT ON public.grassroots_activity
  FOR EACH ROW EXECUTE FUNCTION public.grassroots_activity_history_trigger();

INSERT INTO public.grassroots_history (
  location_id,
  target_id,
  category,
  event_type,
  target_name,
  summary,
  actor_user_id,
  actor_name,
  after_snapshot,
  event_at
)
SELECT
  t.location_id,
  t.id,
  t.category,
  'target_created',
  COALESCE(t.name, ''),
  'Imported existing row',
  t.created_by_user_id,
  t.created_by_name,
  to_jsonb(t),
  COALESCE(t.created_at, now())
FROM public.grassroots_targets t
ON CONFLICT DO NOTHING;

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
  after_snapshot,
  metadata,
  event_at
)
SELECT
  a.location_id,
  a.target_id,
  a.id,
  t.category,
  CASE WHEN a.activity_type = 'drop' THEN 'drop_logged' ELSE 'development_logged' END,
  COALESCE(t.name, ''),
  CASE WHEN a.activity_type = 'drop' THEN 'Imported existing drop' ELSE 'Imported existing development' END,
  a.created_by_user_id,
  a.created_by_name,
  to_jsonb(a),
  jsonb_build_object(
    'activity_date', a.activity_date,
    'next_contact_date', a.next_contact_date
  ),
  COALESCE(a.created_at, now())
FROM public.grassroots_activity a
JOIN public.grassroots_targets t
  ON t.id = a.target_id
ON CONFLICT DO NOTHING;

COMMIT;
