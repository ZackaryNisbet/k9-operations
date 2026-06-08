-- Version history for building-maintenance templates, via a canonical
-- SECURITY DEFINER RPC (avoids the legacy templates/locations RLS recursion the
-- template-list RPC was created to sidestep). Auth by can_access. Additive.
-- Applied live to project YOUR_SUPABASE_PROJECT_REF on 2026-05-30.

CREATE OR REPLACE FUNCTION public.resort_upkeep_list_template_versions(p_location_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_slugs text[] := ARRAY['building-maintenance-monthly','building-maintenance-quarterly','building-maintenance-semi-annual','building-maintenance-annual'];
  v_result jsonb;
BEGIN
  IF NOT public.resort_upkeep_can_access(p_location_id) THEN
    RAISE EXCEPTION 'Not authorized for this location' USING ERRCODE='42501';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', v.id,
    'template_id', v.template_id,
    'version_number', v.version_number,
    'status', v.status,
    'items', v.items,
    'changelog', v.changelog,
    'published_at', v.published_at,
    'created_by_name', v.created_by_name,
    'created_at', v.created_at
  ) ORDER BY v.template_id, v.version_number DESC), '[]'::jsonb)
  INTO v_result
  FROM public.resort_upkeep_template_versions v
  JOIN public.resort_upkeep_templates t ON t.id = v.template_id
  WHERE t.module = 'building_maintenance'
    AND t.slug = ANY(v_slugs)
    AND (t.location_id = p_location_id OR t.location_id IS NULL);

  RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.resort_upkeep_list_template_versions(uuid) TO authenticated, anon;
