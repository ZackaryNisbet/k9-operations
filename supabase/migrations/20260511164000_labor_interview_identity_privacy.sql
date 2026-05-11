-- Cherry Hill QA 23: protect Labor Interviews identity/contact artifacts.
-- Rollback path:
-- 1. Existing interview table/storage policy definitions are copied into
--    app_private.labor_interview_policy_backup_20260511164000 before replacement.
-- 2. To rollback, recreate the saved policies from that table and drop the
--    redacted RPC/helpers below.

BEGIN;

CREATE SCHEMA IF NOT EXISTS app_private;

CREATE TABLE IF NOT EXISTS app_private.labor_interview_policy_backup_20260511164000 AS
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE (schemaname = 'public' AND tablename IN (
    'labor_interview_records',
    'labor_interview_responses',
    'labor_interview_artifacts'
  ))
  OR (schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE 'labor_interview_documents_%');

CREATE OR REPLACE FUNCTION public.labor_lite_role_has_default_permission(
  p_role text,
  p_permission_key text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN lower(coalesce(p_role, '')) IN ('enterprise_admin', 'owner', 'developer', 'role_enterprise_admin', 'role_owner') THEN true
    WHEN p_permission_key IN ('Labor Interviews', 'Labor Manage Interviews', 'Labor Management') THEN
      lower(coalesce(p_role, '')) IN (
        'supervisor',
        'manager',
        'location_admin',
        'admin',
        'multi_location_admin',
        'regional',
        'enterprise_admin',
        'owner',
        'developer',
        'role_enterprise_admin',
        'role_owner'
      )
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.labor_normalize_lite_role_key(p_role text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(coalesce(p_role, ''))
    WHEN 'owner' THEN 'enterprise_admin'
    WHEN 'developer' THEN 'enterprise_admin'
    WHEN 'role_owner' THEN 'enterprise_admin'
    WHEN 'role_enterprise_admin' THEN 'enterprise_admin'
    WHEN 'regional' THEN 'multi_location_admin'
    WHEN 'admin' THEN 'location_admin'
    WHEN 'staff' THEN 'csr'
    WHEN 'role_staff' THEN 'csr'
    WHEN 'role_manager' THEN 'manager'
    ELSE lower(coalesce(p_role, ''))
  END;
$$;

CREATE OR REPLACE FUNCTION public.labor_has_lite_permission(
  p_location_id uuid,
  p_permission_key text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH caller_profiles AS (
    SELECT
      lp.role::text AS raw_role,
      public.labor_normalize_lite_role_key(lp.role::text) AS role_key
    FROM public.lite_profiles lp
    LEFT JOIN public.locations l
      ON l.slug = lp.location_id
      OR l.id::text = lp.location_id
    WHERE lp.user_id = auth.uid()
      AND lp.is_active = true
      AND (
        public.labor_normalize_lite_role_key(lp.role::text) = 'enterprise_admin'
        OR l.id = p_location_id
      )
  )
  SELECT EXISTS (
    SELECT 1
    FROM caller_profiles caller
    WHERE COALESCE(
      (
        SELECT perm.granted
        FROM public.lite_permissions perm
        WHERE public.labor_normalize_lite_role_key(perm.role_id::text) = caller.role_key
          AND perm.permission_key = p_permission_key
        ORDER BY perm.updated_at DESC NULLS LAST
        LIMIT 1
      ),
      public.labor_lite_role_has_default_permission(caller.raw_role, p_permission_key)
    ) = true
  );
$$;

CREATE OR REPLACE FUNCTION public.labor_can_access_interview_identity(
  p_interview_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH interview AS (
    SELECT
      r.id,
      r.location_id,
      r.created_by_user_id,
      r.interviewer_user_id
    FROM public.labor_interview_records r
    WHERE r.id = p_interview_id
  ),
  caller_profiles AS (
    SELECT
      public.labor_normalize_lite_role_key(lp.role::text) AS role_key,
      l.id AS resolved_location_id
    FROM public.lite_profiles lp
    LEFT JOIN public.locations l
      ON l.slug = lp.location_id
      OR l.id::text = lp.location_id
    WHERE lp.user_id = auth.uid()
      AND lp.is_active = true
  )
  SELECT EXISTS (
    SELECT 1
    FROM interview r
    WHERE r.created_by_user_id = auth.uid()
      OR r.interviewer_user_id = auth.uid()
      OR public.labor_has_lite_permission(r.location_id, 'Labor Manage Interviews')
      OR EXISTS (
        SELECT 1
        FROM caller_profiles caller
        WHERE caller.role_key IN ('enterprise_admin', 'location_admin')
          AND (caller.role_key = 'enterprise_admin' OR caller.resolved_location_id = r.location_id)
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.mask_labor_interview_candidate_label(
  p_interview_id uuid
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 'Candidate ' || upper(substr(replace(p_interview_id::text, '-', ''), 1, 6));
$$;

CREATE OR REPLACE FUNCTION public.get_labor_interview_records_redacted(
  p_location_id uuid
)
RETURNS TABLE (
  id uuid,
  location_id uuid,
  labor_employee_id uuid,
  template_id uuid,
  template_version_id uuid,
  candidate_full_name text,
  candidate_email text,
  candidate_phone text,
  candidate_position text,
  interview_date date,
  interview_time time,
  status public.labor_interview_status,
  interviewer_user_id uuid,
  interviewer_name text,
  zoom_recording_url text,
  zoom_passcode text,
  transcript_text text,
  transcript_file_bucket text,
  transcript_file_path text,
  template_snapshot jsonb,
  pdf_field_manifest_snapshot jsonb,
  question_snapshot jsonb,
  metadata jsonb,
  created_by_user_id uuid,
  updated_by_user_id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  masked_candidate_label text,
  can_access_identity boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    r.id,
    r.location_id,
    CASE WHEN access.can_view_identity THEN r.labor_employee_id ELSE NULL END AS labor_employee_id,
    r.template_id,
    r.template_version_id,
    CASE WHEN access.can_view_identity THEN r.candidate_full_name ELSE public.mask_labor_interview_candidate_label(r.id) END AS candidate_full_name,
    CASE WHEN access.can_view_identity THEN r.candidate_email ELSE NULL END AS candidate_email,
    CASE WHEN access.can_view_identity THEN r.candidate_phone ELSE NULL END AS candidate_phone,
    r.candidate_position,
    r.interview_date,
    r.interview_time,
    r.status,
    CASE WHEN access.can_view_identity THEN r.interviewer_user_id ELSE NULL END AS interviewer_user_id,
    CASE WHEN access.can_view_identity THEN r.interviewer_name ELSE NULL END AS interviewer_name,
    CASE WHEN access.can_view_identity THEN r.zoom_recording_url ELSE NULL END AS zoom_recording_url,
    CASE WHEN access.can_view_identity THEN r.zoom_passcode ELSE NULL END AS zoom_passcode,
    CASE WHEN access.can_view_identity THEN r.transcript_text ELSE NULL END AS transcript_text,
    CASE WHEN access.can_view_identity THEN r.transcript_file_bucket ELSE NULL END AS transcript_file_bucket,
    CASE WHEN access.can_view_identity THEN r.transcript_file_path ELSE NULL END AS transcript_file_path,
    CASE WHEN access.can_view_identity THEN coalesce(r.template_snapshot, '{}'::jsonb) ELSE '{}'::jsonb END AS template_snapshot,
    CASE WHEN access.can_view_identity THEN coalesce(r.pdf_field_manifest_snapshot, '[]'::jsonb) ELSE '[]'::jsonb END AS pdf_field_manifest_snapshot,
    CASE WHEN access.can_view_identity THEN coalesce(r.question_snapshot, '[]'::jsonb) ELSE '[]'::jsonb END AS question_snapshot,
    CASE
      WHEN access.can_view_identity THEN coalesce(r.metadata, '{}'::jsonb)
      ELSE jsonb_build_object(
        'hiring_recommendation',
        coalesce(nullif(r.metadata ->> 'hiring_recommendation', ''), nullif(r.metadata ->> 'next_step', ''), 'pending'),
        'next_step',
        coalesce(nullif(r.metadata ->> 'next_step', ''), nullif(r.metadata ->> 'hiring_recommendation', ''), 'pending')
      )
    END AS metadata,
    CASE WHEN access.can_view_identity THEN r.created_by_user_id ELSE NULL END AS created_by_user_id,
    CASE WHEN access.can_view_identity THEN r.updated_by_user_id ELSE NULL END AS updated_by_user_id,
    r.created_at,
    r.updated_at,
    public.mask_labor_interview_candidate_label(r.id) AS masked_candidate_label,
    access.can_view_identity AS can_access_identity
  FROM public.labor_interview_records r
  CROSS JOIN LATERAL (
    SELECT public.labor_can_access_interview_identity(r.id) AS can_view_identity
  ) access
  WHERE r.location_id = p_location_id
    AND (
      public.labor_has_lite_permission(p_location_id, 'Labor Interviews')
      OR public.labor_has_lite_permission(p_location_id, 'Labor Manage Interviews')
    )
  ORDER BY r.interview_date DESC NULLS LAST, r.created_at DESC;
$$;

DROP POLICY IF EXISTS labor_interview_records_select ON public.labor_interview_records;
CREATE POLICY labor_interview_records_select ON public.labor_interview_records
  FOR SELECT TO authenticated
  USING (public.labor_can_access_interview_identity(id));

DROP POLICY IF EXISTS labor_interview_records_write ON public.labor_interview_records;
CREATE POLICY labor_interview_records_write ON public.labor_interview_records
  FOR ALL TO authenticated
  USING (public.labor_has_lite_permission(location_id, 'Labor Manage Interviews'))
  WITH CHECK (public.labor_has_lite_permission(location_id, 'Labor Manage Interviews'));

DROP POLICY IF EXISTS labor_interview_responses_select ON public.labor_interview_responses;
CREATE POLICY labor_interview_responses_select ON public.labor_interview_responses
  FOR SELECT TO authenticated
  USING (public.labor_can_access_interview_identity(interview_id));

DROP POLICY IF EXISTS labor_interview_responses_write ON public.labor_interview_responses;
CREATE POLICY labor_interview_responses_write ON public.labor_interview_responses
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.labor_interview_records r
      WHERE r.id = labor_interview_responses.interview_id
        AND public.labor_has_lite_permission(r.location_id, 'Labor Manage Interviews')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.labor_interview_records r
      WHERE r.id = labor_interview_responses.interview_id
        AND public.labor_has_lite_permission(r.location_id, 'Labor Manage Interviews')
    )
  );

DROP POLICY IF EXISTS labor_interview_artifacts_select ON public.labor_interview_artifacts;
CREATE POLICY labor_interview_artifacts_select ON public.labor_interview_artifacts
  FOR SELECT TO authenticated
  USING (public.labor_can_access_interview_identity(interview_id));

DROP POLICY IF EXISTS labor_interview_artifacts_write ON public.labor_interview_artifacts;
CREATE POLICY labor_interview_artifacts_write ON public.labor_interview_artifacts
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.labor_interview_records r
      WHERE r.id = labor_interview_artifacts.interview_id
        AND public.labor_has_lite_permission(r.location_id, 'Labor Manage Interviews')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.labor_interview_records r
      WHERE r.id = labor_interview_artifacts.interview_id
        AND public.labor_has_lite_permission(r.location_id, 'Labor Manage Interviews')
    )
  );

DROP POLICY IF EXISTS labor_interview_documents_select ON storage.objects;
CREATE POLICY labor_interview_documents_select
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'labor-interview-documents'
    AND array_length(storage.foldername(name), 1) >= 1
    AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND (
      (
        array_length(storage.foldername(name), 1) >= 3
        AND (storage.foldername(name))[2] = 'interviews'
        AND (storage.foldername(name))[3] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND public.labor_can_access_interview_identity(((storage.foldername(name))[3])::uuid)
      )
      OR (
        (array_length(storage.foldername(name), 1) < 3 OR (storage.foldername(name))[2] <> 'interviews')
        AND public.labor_has_lite_permission(((storage.foldername(name))[1])::uuid, 'Labor Manage Interviews')
      )
    )
  );

DROP POLICY IF EXISTS labor_interview_documents_insert ON storage.objects;
CREATE POLICY labor_interview_documents_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'labor-interview-documents'
    AND array_length(storage.foldername(name), 1) >= 1
    AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.labor_has_lite_permission(((storage.foldername(name))[1])::uuid, 'Labor Manage Interviews')
  );

DROP POLICY IF EXISTS labor_interview_documents_update ON storage.objects;
CREATE POLICY labor_interview_documents_update
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'labor-interview-documents'
    AND array_length(storage.foldername(name), 1) >= 1
    AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.labor_has_lite_permission(((storage.foldername(name))[1])::uuid, 'Labor Manage Interviews')
  )
  WITH CHECK (
    bucket_id = 'labor-interview-documents'
    AND array_length(storage.foldername(name), 1) >= 1
    AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.labor_has_lite_permission(((storage.foldername(name))[1])::uuid, 'Labor Manage Interviews')
  );

REVOKE ALL ON FUNCTION public.labor_has_lite_permission(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.labor_can_access_interview_identity(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_labor_interview_records_redacted(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.labor_has_lite_permission(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.labor_can_access_interview_identity(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_labor_interview_records_redacted(uuid) TO authenticated;

COMMIT;
