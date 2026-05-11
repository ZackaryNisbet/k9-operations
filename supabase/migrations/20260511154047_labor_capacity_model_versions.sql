BEGIN;

CREATE TABLE IF NOT EXISTS public.labor_capacity_model_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id uuid NOT NULL REFERENCES public.labor_capacity_models(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  version_no integer NOT NULL,
  model_name text NOT NULL,
  model_settings_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  change_type text NOT NULL,
  change_summary text NOT NULL DEFAULT '',
  changed_by_user_id uuid,
  changed_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT labor_capacity_model_versions_version_positive CHECK (version_no > 0),
  CONSTRAINT labor_capacity_model_versions_model_name_not_blank CHECK (length(trim(model_name)) > 0),
  CONSTRAINT labor_capacity_model_versions_change_type_not_blank CHECK (length(trim(change_type)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS labor_capacity_model_versions_model_version_uidx
  ON public.labor_capacity_model_versions (model_id, version_no);

CREATE INDEX IF NOT EXISTS labor_capacity_model_versions_model_created_idx
  ON public.labor_capacity_model_versions (model_id, created_at DESC);

CREATE INDEX IF NOT EXISTS labor_capacity_model_versions_location_created_idx
  ON public.labor_capacity_model_versions (location_id, created_at DESC);

ALTER TABLE public.labor_capacity_model_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS labor_capacity_model_versions_read ON public.labor_capacity_model_versions;
CREATE POLICY labor_capacity_model_versions_read ON public.labor_capacity_model_versions
  FOR SELECT TO authenticated
  USING (public.labor_has_location_access(location_id));

DROP POLICY IF EXISTS labor_capacity_model_versions_insert ON public.labor_capacity_model_versions;
CREATE POLICY labor_capacity_model_versions_insert ON public.labor_capacity_model_versions
  FOR INSERT TO authenticated
  WITH CHECK (public.labor_has_management_access(location_id));

DROP POLICY IF EXISTS labor_capacity_model_versions_service ON public.labor_capacity_model_versions;
CREATE POLICY labor_capacity_model_versions_service ON public.labor_capacity_model_versions
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT ON public.labor_capacity_model_versions TO authenticated;

CREATE OR REPLACE FUNCTION public.create_labor_capacity_model_version(
  p_model_id uuid,
  p_change_type text,
  p_change_summary text DEFAULT '',
  p_changed_by_name text DEFAULT NULL
)
RETURNS public.labor_capacity_model_versions
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_model public.labor_capacity_models;
  v_version public.labor_capacity_model_versions;
  v_next_version integer;
BEGIN
  SELECT *
  INTO v_model
  FROM public.labor_capacity_models
  WHERE id = p_model_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Labor capacity model was not found';
  END IF;

  IF NOT public.labor_has_management_access(v_model.location_id) THEN
    RAISE EXCEPTION 'You do not have permission to version this labor capacity model';
  END IF;

  SELECT COALESCE(MAX(version_no), 0) + 1
  INTO v_next_version
  FROM public.labor_capacity_model_versions
  WHERE model_id = v_model.id;

  INSERT INTO public.labor_capacity_model_versions (
    model_id,
    location_id,
    version_no,
    model_name,
    model_settings_snapshot,
    change_type,
    change_summary,
    changed_by_user_id,
    changed_by_name
  )
  VALUES (
    v_model.id,
    v_model.location_id,
    v_next_version,
    v_model.name,
    COALESCE(v_model.model_settings, '{}'::jsonb),
    trim(COALESCE(NULLIF(p_change_type, ''), 'update')),
    trim(COALESCE(p_change_summary, '')),
    auth.uid(),
    NULLIF(trim(COALESCE(NULLIF(p_changed_by_name, ''), v_model.updated_by_name, v_model.created_by_name, '')), '')
  )
  RETURNING * INTO v_version;

  RETURN v_version;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_labor_capacity_model_with_version(
  p_location_id uuid,
  p_name text,
  p_model_settings jsonb,
  p_is_active boolean DEFAULT false,
  p_change_type text DEFAULT 'create',
  p_change_summary text DEFAULT '',
  p_changed_by_name text DEFAULT NULL
)
RETURNS public.labor_capacity_models
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_model public.labor_capacity_models;
  v_actor_name text;
BEGIN
  SELECT NULLIF(trim(COALESCE(lp.full_name, lp.email, '')), '')
  INTO v_actor_name
  FROM public.lite_profiles lp
  WHERE lp.user_id = auth.uid()
  LIMIT 1;

  IF NOT public.labor_has_management_access(p_location_id) THEN
    RAISE EXCEPTION 'You do not have permission to create this labor capacity model';
  END IF;

  IF COALESCE(p_is_active, false) IS TRUE THEN
    UPDATE public.labor_capacity_models
    SET
      is_active = false,
      updated_by_user_id = auth.uid(),
      updated_by_name = NULLIF(trim(COALESCE(NULLIF(p_changed_by_name, ''), v_actor_name, updated_by_name, '')), ''),
      updated_at = now()
    WHERE location_id = p_location_id
      AND archived_at IS NULL
      AND is_active IS TRUE;
  END IF;

  INSERT INTO public.labor_capacity_models (
    location_id,
    name,
    model_settings,
    is_active,
    activated_at,
    created_by_user_id,
    created_by_name,
    updated_by_user_id,
    updated_by_name
  )
  VALUES (
    p_location_id,
    trim(COALESCE(NULLIF(p_name, ''), 'Draft Labor Model')),
    COALESCE(p_model_settings, '{}'::jsonb),
    COALESCE(p_is_active, false),
    CASE WHEN COALESCE(p_is_active, false) IS TRUE THEN now() ELSE NULL END,
    auth.uid(),
    NULLIF(trim(COALESCE(NULLIF(p_changed_by_name, ''), v_actor_name, '')), ''),
    auth.uid(),
    NULLIF(trim(COALESCE(NULLIF(p_changed_by_name, ''), v_actor_name, '')), '')
  )
  RETURNING * INTO v_model;

  PERFORM public.create_labor_capacity_model_version(
    v_model.id,
    COALESCE(NULLIF(p_change_type, ''), 'create'),
    COALESCE(p_change_summary, 'Created labor capacity model.'),
    COALESCE(NULLIF(p_changed_by_name, ''), v_actor_name)
  );

  RETURN v_model;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_labor_capacity_model_with_version(
  p_model_id uuid,
  p_model_settings jsonb DEFAULT NULL,
  p_name text DEFAULT NULL,
  p_change_type text DEFAULT 'update',
  p_change_summary text DEFAULT '',
  p_changed_by_name text DEFAULT NULL,
  p_archived_at timestamptz DEFAULT NULL
)
RETURNS public.labor_capacity_models
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_model public.labor_capacity_models;
  v_actor_name text;
BEGIN
  SELECT NULLIF(trim(COALESCE(lp.full_name, lp.email, '')), '')
  INTO v_actor_name
  FROM public.lite_profiles lp
  WHERE lp.user_id = auth.uid()
  LIMIT 1;

  SELECT *
  INTO v_model
  FROM public.labor_capacity_models
  WHERE id = p_model_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Labor capacity model was not found';
  END IF;

  IF NOT public.labor_has_management_access(v_model.location_id) THEN
    RAISE EXCEPTION 'You do not have permission to update this labor capacity model';
  END IF;

  UPDATE public.labor_capacity_models
  SET
    name = COALESCE(NULLIF(trim(p_name), ''), name),
    model_settings = COALESCE(p_model_settings, model_settings),
    archived_at = COALESCE(p_archived_at, archived_at),
    is_active = CASE WHEN p_archived_at IS NOT NULL THEN false ELSE is_active END,
    updated_by_user_id = auth.uid(),
    updated_by_name = NULLIF(trim(COALESCE(NULLIF(p_changed_by_name, ''), v_actor_name, updated_by_name, '')), ''),
    updated_at = now()
  WHERE id = v_model.id
  RETURNING * INTO v_model;

  PERFORM public.create_labor_capacity_model_version(
    v_model.id,
    COALESCE(NULLIF(p_change_type, ''), 'update'),
    COALESCE(p_change_summary, 'Updated labor capacity model.'),
    COALESCE(NULLIF(p_changed_by_name, ''), v_actor_name)
  );

  RETURN v_model;
END;
$$;

CREATE OR REPLACE FUNCTION public.activate_labor_capacity_model(p_model_id uuid)
RETURNS public.labor_capacity_models
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_model public.labor_capacity_models;
  v_actor_name text;
BEGIN
  SELECT NULLIF(trim(COALESCE(lp.full_name, lp.email, '')), '')
  INTO v_actor_name
  FROM public.lite_profiles lp
  WHERE lp.user_id = auth.uid()
  LIMIT 1;

  SELECT *
  INTO v_model
  FROM public.labor_capacity_models
  WHERE id = p_model_id
    AND archived_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Labor capacity model was not found or is archived';
  END IF;

  IF NOT public.labor_has_management_access(v_model.location_id) THEN
    RAISE EXCEPTION 'You do not have permission to activate this labor capacity model';
  END IF;

  UPDATE public.labor_capacity_models
  SET
    is_active = false,
    updated_by_user_id = auth.uid(),
    updated_by_name = COALESCE(v_actor_name, updated_by_name),
    updated_at = now()
  WHERE location_id = v_model.location_id
    AND id <> v_model.id
    AND is_active IS TRUE;

  UPDATE public.labor_capacity_models
  SET
    is_active = true,
    archived_at = NULL,
    activated_at = now(),
    updated_by_user_id = auth.uid(),
    updated_by_name = COALESCE(v_actor_name, updated_by_name),
    updated_at = now()
  WHERE id = v_model.id
  RETURNING * INTO v_model;

  PERFORM public.create_labor_capacity_model_version(
    v_model.id,
    'activate',
    'Activated labor capacity model for Staffing Capacity.',
    COALESCE(v_actor_name, v_model.updated_by_name)
  );

  RETURN v_model;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_labor_capacity_model_version(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_labor_capacity_model_with_version(uuid, text, jsonb, boolean, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_labor_capacity_model_with_version(uuid, jsonb, text, text, text, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.activate_labor_capacity_model(uuid) TO authenticated;

COMMIT;
