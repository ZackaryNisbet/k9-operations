BEGIN;

-- Saved operating models for Labor Capacity Planning.
-- This is additive: the legacy lite_settings labor_hour_analysis row is copied
-- into the first active model, but is not deleted or overwritten.

CREATE TABLE IF NOT EXISTS public.labor_capacity_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  model_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  activated_at timestamptz,
  created_by_user_id uuid,
  created_by_name text,
  updated_by_user_id uuid,
  updated_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT labor_capacity_models_name_not_blank CHECK (length(trim(name)) > 0)
);

CREATE INDEX IF NOT EXISTS labor_capacity_models_location_updated_idx
  ON public.labor_capacity_models (location_id, archived_at, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS labor_capacity_models_one_active_uidx
  ON public.labor_capacity_models (location_id)
  WHERE is_active IS TRUE AND archived_at IS NULL;

ALTER TABLE public.labor_capacity_models ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS labor_capacity_models_read ON public.labor_capacity_models;
CREATE POLICY labor_capacity_models_read ON public.labor_capacity_models
  FOR SELECT TO authenticated
  USING (public.labor_has_location_access(location_id));

DROP POLICY IF EXISTS labor_capacity_models_insert ON public.labor_capacity_models;
CREATE POLICY labor_capacity_models_insert ON public.labor_capacity_models
  FOR INSERT TO authenticated
  WITH CHECK (public.labor_has_management_access(location_id));

DROP POLICY IF EXISTS labor_capacity_models_update ON public.labor_capacity_models;
CREATE POLICY labor_capacity_models_update ON public.labor_capacity_models
  FOR UPDATE TO authenticated
  USING (public.labor_has_management_access(location_id))
  WITH CHECK (public.labor_has_management_access(location_id));

DROP POLICY IF EXISTS labor_capacity_models_service ON public.labor_capacity_models;
CREATE POLICY labor_capacity_models_service ON public.labor_capacity_models
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON public.labor_capacity_models TO authenticated;

DROP TRIGGER IF EXISTS trg_labor_capacity_models_updated_at ON public.labor_capacity_models;
CREATE TRIGGER trg_labor_capacity_models_updated_at
  BEFORE UPDATE ON public.labor_capacity_models
  FOR EACH ROW EXECUTE FUNCTION public.update_platform_settings_updated_at();

WITH legacy_models AS (
  SELECT DISTINCT ON (l.id)
    l.id AS location_id,
    l.name AS location_name,
    ls.setting_value,
    ls.updated_by,
    ls.created_at,
    ls.updated_at
  FROM public.lite_settings ls
  JOIN public.locations l
    ON ls.location_id = l.id::text
    OR ls.location_id = l.slug
  WHERE ls.setting_key = 'labor_hour_analysis'
  ORDER BY
    l.id,
    CASE WHEN ls.location_id = l.id::text THEN 0 ELSE 1 END,
    ls.updated_at DESC,
    ls.created_at DESC
)
INSERT INTO public.labor_capacity_models (
  location_id,
  name,
  model_settings,
  is_active,
  activated_at,
  created_by_user_id,
  updated_by_user_id,
  created_by_name,
  updated_by_name,
  created_at,
  updated_at
)
SELECT
  lm.location_id,
  CASE
    WHEN lower(COALESCE(lm.location_name, '')) LIKE '%cherry hill%' THEN 'Current Cherry Hill Operating Model'
    ELSE 'Current Operating Model'
  END,
  COALESCE(lm.setting_value, '{}'::jsonb),
  true,
  COALESCE(lm.updated_at, now()),
  lm.updated_by,
  lm.updated_by,
  'Legacy Labor Model',
  'Legacy Labor Model',
  COALESCE(lm.created_at, now()),
  COALESCE(lm.updated_at, now())
FROM legacy_models lm
WHERE NOT EXISTS (
  SELECT 1
  FROM public.labor_capacity_models existing
  WHERE existing.location_id = lm.location_id
    AND existing.is_active IS TRUE
    AND existing.archived_at IS NULL
);

CREATE OR REPLACE FUNCTION public.activate_labor_capacity_model(p_model_id uuid)
RETURNS public.labor_capacity_models
LANGUAGE plpgsql
SECURITY DEFINER
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
