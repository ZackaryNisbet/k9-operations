-- Avoid legacy locations/profiles RLS while authorizing global Resort Upkeep
-- rows such as shared templates and troubleshooting articles. Production Lite
-- environments may not have public.profiles, and public.locations policies can
-- still reference that legacy table.

CREATE OR REPLACE FUNCTION public.resort_upkeep_has_any_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH caller_profiles AS (
    SELECT
      lp.role::text AS raw_role,
      public.labor_normalize_lite_role_key(lp.role::text) AS role_key
    FROM public.lite_profiles lp
    WHERE lp.user_id = auth.uid()
      AND lp.is_active = true
  )
  SELECT EXISTS (
    SELECT 1
    FROM caller_profiles caller
    WHERE
      COALESCE(
        (
          SELECT perm.granted
          FROM public.lite_permissions perm
          WHERE public.labor_normalize_lite_role_key(perm.role_id::text) = caller.role_key
            AND perm.permission_key = 'Resort Upkeep Access'
          ORDER BY perm.updated_at DESC NULLS LAST
          LIMIT 1
        ),
        public.labor_lite_role_has_default_permission(caller.raw_role, 'Resort Upkeep Access')
      ) = true
      OR COALESCE(
        (
          SELECT perm.granted
          FROM public.lite_permissions perm
          WHERE public.labor_normalize_lite_role_key(perm.role_id::text) = caller.role_key
            AND perm.permission_key = 'Resort Upkeep Complete'
          ORDER BY perm.updated_at DESC NULLS LAST
          LIMIT 1
        ),
        public.labor_lite_role_has_default_permission(caller.raw_role, 'Resort Upkeep Complete')
      ) = true
      OR COALESCE(
        (
          SELECT perm.granted
          FROM public.lite_permissions perm
          WHERE public.labor_normalize_lite_role_key(perm.role_id::text) = caller.role_key
            AND perm.permission_key = 'Resort Upkeep Manage'
          ORDER BY perm.updated_at DESC NULLS LAST
          LIMIT 1
        ),
        public.labor_lite_role_has_default_permission(caller.raw_role, 'Resort Upkeep Manage')
      ) = true
  );
$$;

REVOKE ALL ON FUNCTION public.resort_upkeep_has_any_access() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resort_upkeep_has_any_access() TO authenticated;
