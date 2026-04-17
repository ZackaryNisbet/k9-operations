-- Employee record history and note soft-delete support.

ALTER TABLE public.labor_employee_notes
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS deleted_by_name text,
  ADD COLUMN IF NOT EXISTS delete_reason text;

CREATE INDEX IF NOT EXISTS labor_employee_notes_active_employee_idx
  ON public.labor_employee_notes (labor_employee_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.labor_employee_history_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  labor_employee_id uuid NOT NULL REFERENCES public.labor_employees(id) ON DELETE RESTRICT,
  event_category text NOT NULL DEFAULT 'employee',
  event_type text NOT NULL,
  source_table text,
  source_id uuid,
  field_name text,
  title text NOT NULL,
  summary text,
  old_value text,
  new_value text,
  old_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  new_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id uuid,
  actor_name text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS labor_employee_history_events_employee_idx
  ON public.labor_employee_history_events (labor_employee_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS labor_employee_history_events_source_idx
  ON public.labor_employee_history_events (source_table, source_id);

ALTER TABLE public.labor_employee_history_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS labor_employee_history_events_read ON public.labor_employee_history_events;
CREATE POLICY labor_employee_history_events_read ON public.labor_employee_history_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.labor_employees e
      WHERE e.id = labor_employee_history_events.labor_employee_id
        AND public.labor_has_management_access(e.location_id)
    )
  );

DROP POLICY IF EXISTS labor_employee_history_events_insert ON public.labor_employee_history_events;
CREATE POLICY labor_employee_history_events_insert ON public.labor_employee_history_events
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.labor_employees e
      WHERE e.id = labor_employee_history_events.labor_employee_id
        AND public.labor_has_management_access(e.location_id)
    )
  );

DROP POLICY IF EXISTS labor_employee_notes_update ON public.labor_employee_notes;
CREATE POLICY labor_employee_notes_update ON public.labor_employee_notes
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.labor_employees e
      WHERE e.id = labor_employee_notes.labor_employee_id
        AND public.labor_has_management_access(e.location_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.labor_employees e
      WHERE e.id = labor_employee_notes.labor_employee_id
        AND public.labor_has_management_access(e.location_id)
    )
  );

CREATE OR REPLACE FUNCTION public.labor_history_actor_name(
  p_actor_user_id uuid,
  p_fallback text DEFAULT NULL
)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(trim(COALESCE(p_fallback, '')), ''),
    (
      SELECT COALESCE(NULLIF(trim(lp.full_name), ''), NULLIF(trim(lp.email), ''))
      FROM public.lite_profiles lp
      WHERE lp.user_id = p_actor_user_id
        AND lp.is_active = true
      ORDER BY lp.updated_at DESC NULLS LAST
      LIMIT 1
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.labor_employee_change_history_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_actor_name text;
BEGIN
  v_actor_name := public.labor_history_actor_name(NEW.updated_by_user_id);

  IF NEW.full_name IS DISTINCT FROM OLD.full_name THEN
    INSERT INTO public.labor_employee_history_events (
      labor_employee_id, event_category, event_type, source_table, source_id,
      field_name, title, summary, old_value, new_value, old_values, new_values,
      actor_user_id, actor_name, occurred_at
    )
    VALUES (
      NEW.id, 'employee', 'employee_field_changed', 'labor_employees', NEW.id,
      'full_name', 'Name changed', 'Employee name changed',
      OLD.full_name, NEW.full_name,
      jsonb_build_object('full_name', OLD.full_name),
      jsonb_build_object('full_name', NEW.full_name),
      NEW.updated_by_user_id, v_actor_name, now()
    );
  END IF;

  IF NEW.position_title IS DISTINCT FROM OLD.position_title THEN
    INSERT INTO public.labor_employee_history_events (
      labor_employee_id, event_category, event_type, source_table, source_id,
      field_name, title, summary, old_value, new_value, old_values, new_values,
      actor_user_id, actor_name, occurred_at
    )
    VALUES (
      NEW.id, 'employee', 'employee_field_changed', 'labor_employees', NEW.id,
      'position_title', 'Position title changed', 'Employee position title changed',
      OLD.position_title, NEW.position_title,
      jsonb_build_object('position_title', OLD.position_title),
      jsonb_build_object('position_title', NEW.position_title),
      NEW.updated_by_user_id, v_actor_name, now()
    );
  END IF;

  IF NEW.start_date IS DISTINCT FROM OLD.start_date THEN
    INSERT INTO public.labor_employee_history_events (
      labor_employee_id, event_category, event_type, source_table, source_id,
      field_name, title, summary, old_value, new_value, old_values, new_values,
      actor_user_id, actor_name, occurred_at
    )
    VALUES (
      NEW.id, 'employee', 'employee_field_changed', 'labor_employees', NEW.id,
      'start_date', 'Start date changed', 'Employee start date changed',
      OLD.start_date::text, NEW.start_date::text,
      jsonb_build_object('start_date', OLD.start_date),
      jsonb_build_object('start_date', NEW.start_date),
      NEW.updated_by_user_id, v_actor_name, now()
    );
  END IF;

  IF NEW.end_date IS DISTINCT FROM OLD.end_date THEN
    INSERT INTO public.labor_employee_history_events (
      labor_employee_id, event_category, event_type, source_table, source_id,
      field_name, title, summary, old_value, new_value, old_values, new_values,
      actor_user_id, actor_name, occurred_at
    )
    VALUES (
      NEW.id, 'employee', 'employee_field_changed', 'labor_employees', NEW.id,
      'end_date', 'Employment status changed', 'Employee end date changed',
      OLD.end_date::text, NEW.end_date::text,
      jsonb_build_object('end_date', OLD.end_date),
      jsonb_build_object('end_date', NEW.end_date),
      NEW.updated_by_user_id, v_actor_name, now()
    );
  END IF;

  IF (OLD.metadata ->> 'contact_email') IS DISTINCT FROM (NEW.metadata ->> 'contact_email') THEN
    INSERT INTO public.labor_employee_history_events (
      labor_employee_id, event_category, event_type, source_table, source_id,
      field_name, title, summary, old_value, new_value, old_values, new_values,
      actor_user_id, actor_name, occurred_at
    )
    VALUES (
      NEW.id, 'employee', 'employee_field_changed', 'labor_employees', NEW.id,
      'contact_email', 'Email changed', 'Employee email changed',
      OLD.metadata ->> 'contact_email', NEW.metadata ->> 'contact_email',
      jsonb_build_object('contact_email', OLD.metadata ->> 'contact_email'),
      jsonb_build_object('contact_email', NEW.metadata ->> 'contact_email'),
      NEW.updated_by_user_id, v_actor_name, now()
    );
  END IF;

  IF (OLD.metadata ->> 'contact_phone') IS DISTINCT FROM (NEW.metadata ->> 'contact_phone') THEN
    INSERT INTO public.labor_employee_history_events (
      labor_employee_id, event_category, event_type, source_table, source_id,
      field_name, title, summary, old_value, new_value, old_values, new_values,
      actor_user_id, actor_name, occurred_at
    )
    VALUES (
      NEW.id, 'employee', 'employee_field_changed', 'labor_employees', NEW.id,
      'contact_phone', 'Phone changed', 'Employee phone changed',
      OLD.metadata ->> 'contact_phone', NEW.metadata ->> 'contact_phone',
      jsonb_build_object('contact_phone', OLD.metadata ->> 'contact_phone'),
      jsonb_build_object('contact_phone', NEW.metadata ->> 'contact_phone'),
      NEW.updated_by_user_id, v_actor_name, now()
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_labor_employee_change_history ON public.labor_employees;
CREATE TRIGGER trg_labor_employee_change_history
  AFTER UPDATE ON public.labor_employees
  FOR EACH ROW EXECUTE FUNCTION public.labor_employee_change_history_trigger();

CREATE OR REPLACE FUNCTION public.labor_employee_note_delete_history_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    INSERT INTO public.labor_employee_history_events (
      labor_employee_id, event_category, event_type, source_table, source_id,
      title, summary, old_values, new_values, metadata,
      actor_user_id, actor_name, occurred_at
    )
    VALUES (
      NEW.labor_employee_id, 'notes', 'employee_note_deleted', 'labor_employee_notes', NEW.id,
      'Employee note removed', left(NEW.note_text, 240),
      jsonb_build_object('deleted_at', OLD.deleted_at),
      jsonb_build_object('deleted_at', NEW.deleted_at),
      jsonb_build_object('note_type', NEW.note_type, 'delete_reason', NEW.delete_reason),
      NEW.deleted_by_user_id,
      public.labor_history_actor_name(NEW.deleted_by_user_id, NEW.deleted_by_name),
      NEW.deleted_at
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_labor_employee_note_delete_history ON public.labor_employee_notes;
CREATE TRIGGER trg_labor_employee_note_delete_history
  AFTER UPDATE ON public.labor_employee_notes
  FOR EACH ROW EXECUTE FUNCTION public.labor_employee_note_delete_history_trigger();

CREATE OR REPLACE FUNCTION public.labor_employee_document_delete_history_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    INSERT INTO public.labor_employee_history_events (
      labor_employee_id, event_category, event_type, source_table, source_id,
      title, summary, old_values, new_values, metadata,
      actor_user_id, actor_name, occurred_at
    )
    VALUES (
      NEW.labor_employee_id, 'documents', 'employee_document_deleted', 'labor_employee_documents', NEW.id,
      'Attachment removed', NEW.file_name,
      jsonb_build_object('deleted_at', OLD.deleted_at),
      jsonb_build_object('deleted_at', NEW.deleted_at),
      jsonb_build_object('document_type', NEW.document_type, 'labor_employee_note_id', NEW.labor_employee_note_id, 'delete_reason', NEW.delete_reason),
      NEW.deleted_by_user_id,
      public.labor_history_actor_name(NEW.deleted_by_user_id, NEW.deleted_by_name),
      NEW.deleted_at
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_labor_employee_document_delete_history ON public.labor_employee_documents;
CREATE TRIGGER trg_labor_employee_document_delete_history
  AFTER UPDATE ON public.labor_employee_documents
  FOR EACH ROW EXECUTE FUNCTION public.labor_employee_document_delete_history_trigger();

CREATE OR REPLACE FUNCTION public.employee_certification_history_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_requirement_name text;
  v_actor_user_id uuid;
BEGIN
  SELECT cr.name
  INTO v_requirement_name
  FROM public.certification_requirements cr
  WHERE cr.id = NEW.requirement_id;

  v_actor_user_id := COALESCE(NEW.updated_by_user_id, NEW.created_by_user_id);

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.labor_employee_history_events (
      labor_employee_id, event_category, event_type, source_table, source_id,
      title, summary, new_values, metadata, actor_user_id, actor_name, occurred_at
    )
    VALUES (
      NEW.labor_employee_id, 'training', 'training_requirement_recorded', 'employee_certifications', NEW.id,
      'Training requirement recorded', COALESCE(v_requirement_name, 'Training requirement'),
      to_jsonb(NEW),
      jsonb_build_object('requirement_name', v_requirement_name),
      v_actor_user_id, public.labor_history_actor_name(v_actor_user_id), NEW.created_at
    );
  ELSIF NEW.completed_on IS DISTINCT FROM OLD.completed_on
    OR NEW.expires_on IS DISTINCT FROM OLD.expires_on
    OR NEW.labor_employee_document_id IS DISTINCT FROM OLD.labor_employee_document_id
    OR NEW.external_document_url IS DISTINCT FROM OLD.external_document_url
    OR NEW.source_note IS DISTINCT FROM OLD.source_note
  THEN
    INSERT INTO public.labor_employee_history_events (
      labor_employee_id, event_category, event_type, source_table, source_id,
      title, summary, old_values, new_values, metadata, actor_user_id, actor_name, occurred_at
    )
    VALUES (
      NEW.labor_employee_id, 'training', 'training_requirement_updated', 'employee_certifications', NEW.id,
      'Training requirement updated', COALESCE(v_requirement_name, 'Training requirement'),
      to_jsonb(OLD), to_jsonb(NEW),
      jsonb_build_object('requirement_name', v_requirement_name),
      v_actor_user_id, public.labor_history_actor_name(v_actor_user_id), now()
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_employee_certification_history ON public.employee_certifications;
CREATE TRIGGER trg_employee_certification_history
  AFTER INSERT OR UPDATE ON public.employee_certifications
  FOR EACH ROW EXECUTE FUNCTION public.employee_certification_history_trigger();

CREATE OR REPLACE FUNCTION public.employee_review_instance_history_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_actor_user_id uuid;
BEGIN
  v_actor_user_id := COALESCE(NEW.updated_by_user_id, NEW.created_by_user_id, NEW.reviewer_user_id);

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.labor_employee_history_events (
      labor_employee_id, event_category, event_type, source_table, source_id,
      title, summary, new_values, actor_user_id, actor_name, occurred_at
    )
    VALUES (
      NEW.labor_employee_id, 'performance', 'performance_review_scheduled', 'employee_review_instances', NEW.id,
      'Performance review scheduled', replace(NEW.review_cycle::text, '_', ' '),
      to_jsonb(NEW), v_actor_user_id, public.labor_history_actor_name(v_actor_user_id, NEW.reviewer_name), NEW.created_at
    );
  ELSIF NEW.status IS DISTINCT FROM OLD.status
    OR NEW.due_date IS DISTINCT FROM OLD.due_date
    OR NEW.completed_at IS DISTINCT FROM OLD.completed_at
    OR NEW.reviewer_user_id IS DISTINCT FROM OLD.reviewer_user_id
  THEN
    INSERT INTO public.labor_employee_history_events (
      labor_employee_id, event_category, event_type, source_table, source_id,
      title, summary, old_values, new_values, actor_user_id, actor_name, occurred_at
    )
    VALUES (
      NEW.labor_employee_id, 'performance', 'performance_review_updated', 'employee_review_instances', NEW.id,
      CASE WHEN NEW.completed_at IS NOT NULL AND OLD.completed_at IS NULL THEN 'Performance review completed' ELSE 'Performance review updated' END,
      replace(NEW.review_cycle::text, '_', ' '),
      to_jsonb(OLD), to_jsonb(NEW), v_actor_user_id, public.labor_history_actor_name(v_actor_user_id, NEW.reviewer_name), now()
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_employee_review_instance_history ON public.employee_review_instances;
CREATE TRIGGER trg_employee_review_instance_history
  AFTER INSERT OR UPDATE ON public.employee_review_instances
  FOR EACH ROW EXECUTE FUNCTION public.employee_review_instance_history_trigger();

CREATE OR REPLACE FUNCTION public.employee_review_response_history_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_instance public.employee_review_instances%ROWTYPE;
  v_item_label text;
  v_actor_user_id uuid;
BEGIN
  SELECT *
  INTO v_instance
  FROM public.employee_review_instances
  WHERE id = NEW.review_instance_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT prompt
  INTO v_item_label
  FROM public.review_items
  WHERE id = NEW.review_item_id;

  v_actor_user_id := COALESCE(NEW.updated_by_user_id, NEW.created_by_user_id);

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.labor_employee_history_events (
      labor_employee_id, event_category, event_type, source_table, source_id,
      title, summary, new_values, metadata, actor_user_id, actor_name, occurred_at
    )
    VALUES (
      v_instance.labor_employee_id, 'performance', 'performance_response_added', 'employee_review_responses', NEW.id,
      'Performance response added', COALESCE(v_item_label, 'Review item'),
      to_jsonb(NEW), jsonb_build_object('review_cycle', v_instance.review_cycle, 'review_item_label', v_item_label),
      v_actor_user_id, public.labor_history_actor_name(v_actor_user_id), NEW.created_at
    );
  ELSIF NEW.rating_value IS DISTINCT FROM OLD.rating_value
    OR NEW.response_text IS DISTINCT FROM OLD.response_text
  THEN
    INSERT INTO public.labor_employee_history_events (
      labor_employee_id, event_category, event_type, source_table, source_id,
      title, summary, old_values, new_values, metadata, actor_user_id, actor_name, occurred_at
    )
    VALUES (
      v_instance.labor_employee_id, 'performance', 'performance_response_updated', 'employee_review_responses', NEW.id,
      'Performance response updated', COALESCE(v_item_label, 'Review item'),
      to_jsonb(OLD), to_jsonb(NEW), jsonb_build_object('review_cycle', v_instance.review_cycle, 'review_item_label', v_item_label),
      v_actor_user_id, public.labor_history_actor_name(v_actor_user_id), now()
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_employee_review_response_history ON public.employee_review_responses;
CREATE TRIGGER trg_employee_review_response_history
  AFTER INSERT OR UPDATE ON public.employee_review_responses
  FOR EACH ROW EXECUTE FUNCTION public.employee_review_response_history_trigger();
