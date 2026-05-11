-- Cherry Hill QA 23 follow-up: production lite_profiles.location_id may store
-- the UUID text, not only the location slug. Keep the privacy helpers aligned
-- with both historical shapes.

BEGIN;

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

GRANT EXECUTE ON FUNCTION public.labor_has_lite_permission(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.labor_can_access_interview_identity(uuid) TO authenticated;

COMMIT;
