-- Period-level completion attachments for maintenance checklists: a dedicated
-- attachment scope plus a SECURITY DEFINER record/delete pair. Definer (the
-- table does not force RLS for the owner) avoids re-enumerating the large
-- attachment RLS policies; both functions do explicit auth + editable-period
-- checks, so they stay safe. Additive and non-destructive.
--
-- Applied live to project xuzvqcpthqikyroqhypw on 2026-05-30; this file mirrors
-- that change for the repo history.

ALTER TABLE public.resort_upkeep_attachments
  DROP CONSTRAINT resort_upkeep_attachments_attachment_scope_check;
ALTER TABLE public.resort_upkeep_attachments
  ADD CONSTRAINT resort_upkeep_attachments_attachment_scope_check
  CHECK (attachment_scope = ANY (ARRAY[
    'maintenance_item_photo','maintenance_item_attachment','maintenance_period_attachment',
    'vendor_contract','vendor_log_attachment','license_evidence','license_log_attachment'
  ]));

CREATE OR REPLACE FUNCTION public.resort_upkeep_record_period_attachment(p_attachment jsonb, p_actor_name text DEFAULT NULL::text)
 RETURNS public.resort_upkeep_attachments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_location_id uuid := NULLIF(p_attachment->>'location_id','')::uuid;
  v_period_id uuid := NULLIF(p_attachment->>'period_id','')::uuid;
  v_storage_bucket text := COALESCE(NULLIF(p_attachment->>'storage_bucket',''),'resort-upkeep-attachments');
  v_storage_path text := NULLIF(p_attachment->>'storage_path','');
  v_actor_name text := COALESCE(NULLIF(p_actor_name,''), auth.jwt() ->> 'email');
  v_row public.resort_upkeep_attachments%ROWTYPE;
BEGIN
  IF v_location_id IS NULL OR v_period_id IS NULL THEN
    RAISE EXCEPTION 'location_id and period_id are required' USING ERRCODE = '22023';
  END IF;
  IF NOT public.resort_upkeep_can_complete(v_location_id) THEN
    RAISE EXCEPTION 'Not authorized to add attachments' USING ERRCODE = '42501';
  END IF;
  IF v_storage_bucket <> 'resort-upkeep-attachments' THEN
    RAISE EXCEPTION 'Invalid Resort Upkeep attachment bucket' USING ERRCODE = '22023';
  END IF;
  IF v_storage_path IS NULL OR split_part(v_storage_path,'/',1) <> v_location_id::text THEN
    RAISE EXCEPTION 'Attachment path must begin with location_id' USING ERRCODE = '22023';
  END IF;
  IF split_part(v_storage_path,'/',2) <> 'maintenance' THEN
    RAISE EXCEPTION 'Maintenance attachment paths must use the maintenance folder' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.resort_upkeep_periods p
    WHERE p.id = v_period_id AND p.location_id = v_location_id
      AND public.resort_upkeep_period_can_edit(p.status, p.period_end, p.first_submitted_at, CURRENT_DATE)
  ) THEN
    RAISE EXCEPTION 'Attachments cannot be added to a locked or submitted checklist' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.resort_upkeep_attachments (
    location_id, attachment_scope, period_id, file_name, storage_bucket, storage_path,
    mime_type, file_size_bytes, uploaded_by_user_id, uploaded_by_name, metadata
  ) VALUES (
    v_location_id, 'maintenance_period_attachment', v_period_id,
    COALESCE(NULLIF(p_attachment->>'file_name',''),'attachment'),
    v_storage_bucket, v_storage_path,
    COALESCE(NULLIF(p_attachment->>'mime_type',''),'application/octet-stream'),
    GREATEST(COALESCE(NULLIF(p_attachment->>'file_size_bytes','')::bigint, 1), 1),
    auth.uid(), v_actor_name,
    CASE WHEN jsonb_typeof(p_attachment->'metadata')='object' THEN p_attachment->'metadata' ELSE '{}'::jsonb END
  ) RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;

CREATE OR REPLACE FUNCTION public.resort_upkeep_delete_period_attachment(p_attachment_id uuid, p_actor_name text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_att public.resort_upkeep_attachments%ROWTYPE;
BEGIN
  SELECT * INTO v_att FROM public.resort_upkeep_attachments
  WHERE id = p_attachment_id AND attachment_scope = 'maintenance_period_attachment' AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF NOT public.resort_upkeep_can_complete(v_att.location_id) THEN
    RAISE EXCEPTION 'Not authorized to remove attachments' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.resort_upkeep_periods p
    WHERE p.id = v_att.period_id
      AND public.resort_upkeep_period_can_edit(p.status, p.period_end, p.first_submitted_at, CURRENT_DATE)
  ) THEN
    RAISE EXCEPTION 'Attachments cannot be removed after the checklist is submitted' USING ERRCODE = '42501';
  END IF;

  UPDATE public.resort_upkeep_attachments SET deleted_at = now() WHERE id = p_attachment_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.resort_upkeep_record_period_attachment(jsonb, text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.resort_upkeep_delete_period_attachment(uuid, text) TO authenticated, anon;
