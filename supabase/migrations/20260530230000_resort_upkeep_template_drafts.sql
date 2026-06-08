-- Draft workflow for maintenance checklist templates. A draft is a
-- template_versions row with status='draft'. SECURITY DEFINER (the table does
-- not force RLS for the owner) with an explicit can_manage check authorized by
-- the editing location. Additive and non-destructive.
-- Applied live to project YOUR_SUPABASE_PROJECT_REF on 2026-05-30.

CREATE OR REPLACE FUNCTION public.resort_upkeep_save_template_draft(p_template_id uuid, p_location_id uuid, p_items jsonb, p_changelog text DEFAULT ''::text, p_actor_name text DEFAULT NULL::text)
 RETURNS public.resort_upkeep_template_versions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor text := COALESCE(NULLIF(p_actor_name,''), auth.jwt() ->> 'email');
  v_draft public.resort_upkeep_template_versions%ROWTYPE;
  v_next integer;
BEGIN
  IF p_template_id IS NULL OR p_location_id IS NULL THEN
    RAISE EXCEPTION 'template_id and location_id are required' USING ERRCODE='22023';
  END IF;
  IF NOT public.resort_upkeep_can_manage(p_location_id) THEN
    RAISE EXCEPTION 'Not authorized to edit templates' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.resort_upkeep_templates WHERE id = p_template_id) THEN
    RAISE EXCEPTION 'Template not found' USING ERRCODE='22023';
  END IF;
  IF jsonb_typeof(COALESCE(p_items,'[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'items must be an array' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_draft
  FROM public.resort_upkeep_template_versions
  WHERE template_id = p_template_id AND status = 'draft'
  ORDER BY version_number DESC
  LIMIT 1;

  IF FOUND THEN
    UPDATE public.resort_upkeep_template_versions
    SET items = p_items,
        changelog = COALESCE(NULLIF(p_changelog,''), changelog),
        created_by_name = v_actor,
        created_by_user_id = auth.uid(),
        created_at = now()
    WHERE id = v_draft.id
    RETURNING * INTO v_draft;
  ELSE
    SELECT COALESCE(MAX(version_number),0)+1 INTO v_next
    FROM public.resort_upkeep_template_versions
    WHERE template_id = p_template_id;

    INSERT INTO public.resort_upkeep_template_versions
      (template_id, version_number, status, items, changelog, created_by_user_id, created_by_name, created_at)
    VALUES
      (p_template_id, v_next, 'draft', p_items, NULLIF(p_changelog,''), auth.uid(), v_actor, now())
    RETURNING * INTO v_draft;
  END IF;

  RETURN v_draft;
END;
$function$;

CREATE OR REPLACE FUNCTION public.resort_upkeep_delete_template_draft(p_template_id uuid, p_location_id uuid, p_actor_name text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.resort_upkeep_can_manage(p_location_id) THEN
    RAISE EXCEPTION 'Not authorized to edit templates' USING ERRCODE='42501';
  END IF;
  DELETE FROM public.resort_upkeep_template_versions
  WHERE template_id = p_template_id AND status = 'draft';
END;
$function$;

GRANT EXECUTE ON FUNCTION public.resort_upkeep_save_template_draft(uuid, uuid, jsonb, text, text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.resort_upkeep_delete_template_draft(uuid, uuid, text) TO authenticated, anon;
