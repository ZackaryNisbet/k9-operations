-- Labor RLS owner-access fix
-- Labor uses lite_profiles for most staff access, but owner-style accounts still
-- resolve through the legacy public.profiles table in this codebase.

CREATE OR REPLACE FUNCTION public.labor_has_location_access(p_location_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.lite_profiles lp
      LEFT JOIN public.locations l
        ON l.slug = lp.location_id
      WHERE lp.user_id = auth.uid()
        AND lp.is_active = true
        AND (
          lp.role = 'enterprise_admin'
          OR l.id = p_location_id
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role IN ('owner', 'role_owner', 'enterprise_admin', 'role_enterprise_admin')
          OR p.location_id = p_location_id
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.labor_has_management_access(p_location_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.lite_profiles lp
      LEFT JOIN public.locations l
        ON l.slug = lp.location_id
      WHERE lp.user_id = auth.uid()
        AND lp.is_active = true
        AND (
          lp.role = 'enterprise_admin'
          OR (
            lp.role IN ('supervisor', 'manager', 'location_admin')
            AND l.id = p_location_id
          )
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role IN ('owner', 'role_owner', 'enterprise_admin', 'role_enterprise_admin')
          OR (
            p.role IN ('manager', 'location_admin')
            AND p.location_id = p_location_id
          )
        )
    );
$$;
