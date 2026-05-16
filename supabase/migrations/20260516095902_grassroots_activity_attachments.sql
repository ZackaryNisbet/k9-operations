BEGIN;

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'grassroots-activity-attachments',
  'grassroots-activity-attachments',
  false,
  20971520,
  ARRAY[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/heic',
    'image/heif'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE TABLE IF NOT EXISTS public.grassroots_activity_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  target_id uuid NOT NULL REFERENCES public.grassroots_targets(id) ON DELETE CASCADE,
  activity_id uuid NOT NULL REFERENCES public.grassroots_activity(id) ON DELETE CASCADE,
  attachment_type text NOT NULL DEFAULT 'drop_photo'
    CHECK (attachment_type IN ('drop_photo', 'drop_attachment')),
  file_name text NOT NULL,
  storage_bucket text NOT NULL DEFAULT 'grassroots-activity-attachments',
  storage_path text NOT NULL,
  mime_type text NOT NULL,
  file_size_bytes bigint NOT NULL CHECK (file_size_bytes > 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  uploaded_by_user_id uuid,
  uploaded_by_name text,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by_user_id uuid,
  deleted_by_name text,
  delete_reason text,
  CONSTRAINT grassroots_activity_attachments_storage_uidx UNIQUE (storage_bucket, storage_path)
);

CREATE INDEX IF NOT EXISTS grassroots_activity_attachments_activity_idx
  ON public.grassroots_activity_attachments (activity_id, uploaded_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS grassroots_activity_attachments_target_idx
  ON public.grassroots_activity_attachments (target_id, uploaded_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS grassroots_activity_attachments_location_idx
  ON public.grassroots_activity_attachments (location_id, uploaded_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS grassroots_activity_attachments_storage_path_idx
  ON public.grassroots_activity_attachments (storage_bucket, storage_path);

ALTER TABLE public.grassroots_activity_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS grassroots_activity_attachments_read ON public.grassroots_activity_attachments;
CREATE POLICY grassroots_activity_attachments_read
  ON public.grassroots_activity_attachments
  FOR SELECT
  TO authenticated
  USING (public.labor_has_location_access(location_id));

DROP POLICY IF EXISTS grassroots_activity_attachments_insert ON public.grassroots_activity_attachments;
CREATE POLICY grassroots_activity_attachments_insert
  ON public.grassroots_activity_attachments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.labor_has_management_access(location_id)
    AND storage_bucket = 'grassroots-activity-attachments'
    AND EXISTS (
      SELECT 1
      FROM public.grassroots_targets t
      WHERE t.id = target_id
        AND t.location_id = location_id
        AND t.category = 'drops'
    )
    AND EXISTS (
      SELECT 1
      FROM public.grassroots_activity a
      WHERE a.id = activity_id
        AND a.target_id = target_id
        AND a.location_id = location_id
        AND a.activity_type = 'drop'
    )
  );

DROP POLICY IF EXISTS grassroots_activity_attachments_update ON public.grassroots_activity_attachments;
CREATE POLICY grassroots_activity_attachments_update
  ON public.grassroots_activity_attachments
  FOR UPDATE
  TO authenticated
  USING (public.labor_has_management_access(location_id))
  WITH CHECK (public.labor_has_management_access(location_id));

GRANT SELECT, INSERT, UPDATE ON public.grassroots_activity_attachments TO authenticated;

DROP POLICY IF EXISTS grassroots_activity_attachments_storage_select ON storage.objects;
CREATE POLICY grassroots_activity_attachments_storage_select
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'grassroots-activity-attachments'
    AND array_length(storage.foldername(name), 1) >= 5
    AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND CASE
      WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN public.labor_has_location_access(((storage.foldername(name))[1])::uuid)
      ELSE false
    END
  );

DROP POLICY IF EXISTS grassroots_activity_attachments_storage_insert ON storage.objects;
CREATE POLICY grassroots_activity_attachments_storage_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'grassroots-activity-attachments'
    AND array_length(storage.foldername(name), 1) >= 5
    AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND (storage.foldername(name))[2] = 'targets'
    AND (storage.foldername(name))[3] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND (storage.foldername(name))[4] = 'activities'
    AND (storage.foldername(name))[5] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND CASE
      WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN public.labor_has_management_access(((storage.foldername(name))[1])::uuid)
      ELSE false
    END
    AND CASE
      WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND (storage.foldername(name))[3] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN EXISTS (
        SELECT 1
        FROM public.grassroots_targets t
        WHERE t.location_id = ((storage.foldername(name))[1])::uuid
          AND t.id = ((storage.foldername(name))[3])::uuid
          AND t.category = 'drops'
      )
      ELSE false
    END
  );

CREATE OR REPLACE FUNCTION public.log_grassroots_drop_activity_with_attachments(
  p_activity jsonb,
  p_attachments jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_activity_id uuid := COALESCE(NULLIF(p_activity->>'id', '')::uuid, gen_random_uuid());
  v_location_id uuid := NULLIF(p_activity->>'location_id', '')::uuid;
  v_target_id uuid := NULLIF(p_activity->>'target_id', '')::uuid;
  v_activity_date date := COALESCE(NULLIF(p_activity->>'activity_date', '')::date, CURRENT_DATE);
  v_next_contact_date date := NULLIF(p_activity->>'next_contact_date', '')::date;
  v_notes text := trim(COALESCE(p_activity->>'notes', ''));
  v_metadata jsonb := CASE
    WHEN jsonb_typeof(p_activity->'metadata') = 'object' THEN p_activity->'metadata'
    ELSE '{}'::jsonb
  END;
  v_created_by_user_id uuid := NULLIF(p_activity->>'created_by_user_id', '')::uuid;
  v_created_by_name text := NULLIF(trim(COALESCE(p_activity->>'created_by_name', '')), '');
  v_target public.grassroots_targets%ROWTYPE;
  v_activity public.grassroots_activity%ROWTYPE;
  v_attachment jsonb;
  v_attachment_id uuid;
  v_attachment_type text;
  v_file_name text;
  v_storage_bucket text;
  v_storage_path text;
  v_mime_type text;
  v_file_size_bytes bigint;
  v_attachment_metadata jsonb;
  v_inserted_attachment public.grassroots_activity_attachments%ROWTYPE;
  v_saved_attachments jsonb := '[]'::jsonb;
BEGIN
  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'location_id is required' USING ERRCODE = '22023';
  END IF;

  IF v_target_id IS NULL THEN
    RAISE EXCEPTION 'target_id is required' USING ERRCODE = '22023';
  END IF;

  IF v_notes = '' THEN
    RAISE EXCEPTION 'notes are required' USING ERRCODE = '22023';
  END IF;

  IF NOT public.labor_has_management_access(v_location_id) THEN
    RAISE EXCEPTION 'Not authorized to log drop activity for this location' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_target
  FROM public.grassroots_targets
  WHERE id = v_target_id
    AND location_id = v_location_id
    AND category = 'drops';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Drop business target was not found for this location' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(COALESCE(p_attachments, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'attachments must be an array' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.grassroots_activity (
    id,
    location_id,
    target_id,
    activity_type,
    activity_date,
    notes,
    next_contact_date,
    metadata,
    created_by_user_id,
    created_by_name
  )
  VALUES (
    v_activity_id,
    v_location_id,
    v_target_id,
    'drop',
    v_activity_date,
    v_notes,
    v_next_contact_date,
    v_metadata,
    v_created_by_user_id,
    v_created_by_name
  )
  RETURNING * INTO v_activity;

  FOR v_attachment IN SELECT * FROM jsonb_array_elements(COALESCE(p_attachments, '[]'::jsonb))
  LOOP
    v_attachment_id := COALESCE(NULLIF(v_attachment->>'id', '')::uuid, gen_random_uuid());
    v_attachment_type := COALESCE(NULLIF(v_attachment->>'attachment_type', ''), 'drop_photo');
    v_file_name := trim(COALESCE(v_attachment->>'file_name', 'attachment'));
    v_storage_bucket := COALESCE(NULLIF(v_attachment->>'storage_bucket', ''), 'grassroots-activity-attachments');
    v_storage_path := trim(COALESCE(v_attachment->>'storage_path', ''));
    v_mime_type := trim(COALESCE(v_attachment->>'mime_type', 'application/octet-stream'));
    v_file_size_bytes := COALESCE(NULLIF(v_attachment->>'file_size_bytes', '')::bigint, 0);
    v_attachment_metadata := CASE
      WHEN jsonb_typeof(v_attachment->'metadata') = 'object' THEN v_attachment->'metadata'
      ELSE '{}'::jsonb
    END;

    IF v_attachment_type NOT IN ('drop_photo', 'drop_attachment') THEN
      RAISE EXCEPTION 'Unsupported attachment type: %', v_attachment_type USING ERRCODE = '22023';
    END IF;

    IF v_storage_bucket <> 'grassroots-activity-attachments' OR v_storage_path = '' THEN
      RAISE EXCEPTION 'Invalid attachment storage path' USING ERRCODE = '22023';
    END IF;

    IF v_file_size_bytes <= 0 THEN
      RAISE EXCEPTION 'Attachment file size is required' USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM storage.objects o
      WHERE o.bucket_id = v_storage_bucket
        AND o.name = v_storage_path
    ) THEN
      RAISE EXCEPTION 'Uploaded attachment object was not found: %', v_storage_path USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.grassroots_activity_attachments (
      id,
      location_id,
      target_id,
      activity_id,
      attachment_type,
      file_name,
      storage_bucket,
      storage_path,
      mime_type,
      file_size_bytes,
      metadata,
      uploaded_by_user_id,
      uploaded_by_name
    )
    VALUES (
      v_attachment_id,
      v_location_id,
      v_target_id,
      v_activity_id,
      v_attachment_type,
      v_file_name,
      v_storage_bucket,
      v_storage_path,
      v_mime_type,
      v_file_size_bytes,
      v_attachment_metadata,
      COALESCE(NULLIF(v_attachment->>'uploaded_by_user_id', '')::uuid, v_created_by_user_id),
      COALESCE(NULLIF(trim(COALESCE(v_attachment->>'uploaded_by_name', '')), ''), v_created_by_name)
    )
    RETURNING * INTO v_inserted_attachment;

    v_saved_attachments := v_saved_attachments || jsonb_build_array(to_jsonb(v_inserted_attachment));
  END LOOP;

  RETURN jsonb_build_object(
    'activity',
    to_jsonb(v_activity),
    'attachments',
    v_saved_attachments
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_grassroots_drop_activity_with_attachments(jsonb, jsonb) TO authenticated;

COMMIT;
