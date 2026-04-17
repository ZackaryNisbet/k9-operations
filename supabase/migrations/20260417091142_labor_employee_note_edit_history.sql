-- Employee note editing support plus explicit grants for history reads.

ALTER TABLE public.labor_employee_notes
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS updated_by_name text;

CREATE INDEX IF NOT EXISTS labor_employee_notes_updated_idx
  ON public.labor_employee_notes (labor_employee_id, updated_at DESC);

GRANT SELECT, INSERT ON TABLE public.labor_employee_history_events TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.labor_employee_notes TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.labor_employee_documents TO authenticated;

CREATE OR REPLACE FUNCTION public.labor_employee_notes_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.updated_at IS NOT DISTINCT FROM OLD.updated_at THEN
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_labor_employee_notes_touch_updated_at ON public.labor_employee_notes;
CREATE TRIGGER trg_labor_employee_notes_touch_updated_at
  BEFORE UPDATE ON public.labor_employee_notes
  FOR EACH ROW EXECUTE FUNCTION public.labor_employee_notes_touch_updated_at();

CREATE OR REPLACE FUNCTION public.labor_employee_note_update_history_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_changed_fields text[] := ARRAY[]::text[];
  v_actor_user_id uuid;
  v_actor_name text;
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.note_type IS DISTINCT FROM OLD.note_type THEN
    v_changed_fields := array_append(v_changed_fields, 'note_type');
  END IF;

  IF NEW.note_text IS DISTINCT FROM OLD.note_text THEN
    v_changed_fields := array_append(v_changed_fields, 'note_text');
  END IF;

  IF array_length(v_changed_fields, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  v_actor_user_id := COALESCE(NEW.updated_by_user_id, NEW.created_by_user_id);
  v_actor_name := public.labor_history_actor_name(v_actor_user_id, COALESCE(NEW.updated_by_name, NEW.created_by_name));

  INSERT INTO public.labor_employee_history_events (
    labor_employee_id, event_category, event_type, source_table, source_id,
    title, summary, old_values, new_values, metadata,
    actor_user_id, actor_name, occurred_at
  )
  VALUES (
    NEW.labor_employee_id,
    'notes',
    'employee_note_updated',
    'labor_employee_notes',
    NEW.id,
    'Employee note edited',
    left(NEW.note_text, 240),
    jsonb_build_object(
      'note_type', OLD.note_type,
      'note_text', OLD.note_text
    ),
    jsonb_build_object(
      'note_type', NEW.note_type,
      'note_text', NEW.note_text
    ),
    jsonb_build_object('changed_fields', v_changed_fields),
    v_actor_user_id,
    v_actor_name,
    COALESCE(NEW.updated_at, now())
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_labor_employee_note_update_history ON public.labor_employee_notes;
CREATE TRIGGER trg_labor_employee_note_update_history
  AFTER UPDATE OF note_type, note_text ON public.labor_employee_notes
  FOR EACH ROW EXECUTE FUNCTION public.labor_employee_note_update_history_trigger();
