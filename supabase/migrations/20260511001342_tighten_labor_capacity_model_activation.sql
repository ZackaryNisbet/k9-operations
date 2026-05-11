BEGIN;

CREATE OR REPLACE FUNCTION public.activate_labor_capacity_model(p_model_id uuid)
RETURNS public.labor_capacity_models
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_model public.labor_capacity_models;
BEGIN
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
    updated_at = now()
  WHERE id = v_model.id
  RETURNING * INTO v_model;

  RETURN v_model;
END;
$$;

GRANT EXECUTE ON FUNCTION public.activate_labor_capacity_model(uuid) TO authenticated;

COMMIT;
