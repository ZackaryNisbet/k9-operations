-- Cherry Hill QA follow-up: Grassroots saves run through labor access helpers.
-- Production Lite environments may not have the legacy public.profiles table,
-- so keep the Lite profile path canonical and only consult profiles when it
-- exists.

BEGIN;

CREATE OR REPLACE FUNCTION public.labor_has_location_access(p_location_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_has_lite_access boolean := false;
  v_has_legacy_access boolean := false;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.lite_profiles lp
    LEFT JOIN public.locations l
      ON l.slug = lp.location_id::text
      OR l.id::text = lp.location_id::text
    WHERE lp.user_id = auth.uid()
      AND lp.is_active = true
      AND (
        lower(regexp_replace(COALESCE(lp.role::text, ''), '[^a-z0-9]+', '_', 'g')) IN (
          'enterprise_admin',
          'role_enterprise_admin',
          'multi_location_admin',
          'multi_loc_admin'
        )
        OR l.id = p_location_id
      )
  )
  INTO v_has_lite_access;

  IF v_has_lite_access THEN
    RETURN true;
  END IF;

  IF to_regclass('public.profiles') IS NOT NULL THEN
    EXECUTE $sql$
      SELECT EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND (
            lower(regexp_replace(COALESCE(p.role::text, ''), '[^a-z0-9]+', '_', 'g')) IN (
              'owner',
              'role_owner',
              'enterprise_admin',
              'role_enterprise_admin'
            )
            OR p.location_id::text = $1::text
          )
      )
    $sql$
    INTO v_has_legacy_access
    USING p_location_id;
  END IF;

  RETURN COALESCE(v_has_legacy_access, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.labor_has_management_access(p_location_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_has_lite_access boolean := false;
  v_has_legacy_access boolean := false;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.lite_profiles lp
    LEFT JOIN public.locations l
      ON l.slug = lp.location_id::text
      OR l.id::text = lp.location_id::text
    WHERE lp.user_id = auth.uid()
      AND lp.is_active = true
      AND (
        lower(regexp_replace(COALESCE(lp.role::text, ''), '[^a-z0-9]+', '_', 'g')) IN (
          'enterprise_admin',
          'role_enterprise_admin',
          'multi_location_admin',
          'multi_loc_admin'
        )
        OR (
          lower(regexp_replace(COALESCE(lp.role::text, ''), '[^a-z0-9]+', '_', 'g')) IN (
            'owner',
            'role_owner',
            'location_admin',
            'manager',
            'supervisor'
          )
          AND l.id = p_location_id
        )
      )
  )
  INTO v_has_lite_access;

  IF v_has_lite_access THEN
    RETURN true;
  END IF;

  IF to_regclass('public.profiles') IS NOT NULL THEN
    EXECUTE $sql$
      SELECT EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND (
            lower(regexp_replace(COALESCE(p.role::text, ''), '[^a-z0-9]+', '_', 'g')) IN (
              'owner',
              'role_owner',
              'enterprise_admin',
              'role_enterprise_admin'
            )
            OR (
              lower(regexp_replace(COALESCE(p.role::text, ''), '[^a-z0-9]+', '_', 'g')) IN (
                'location_admin',
                'manager'
              )
              AND p.location_id::text = $1::text
            )
          )
      )
    $sql$
    INTO v_has_legacy_access
    USING p_location_id;
  END IF;

  RETURN COALESCE(v_has_legacy_access, false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.labor_has_location_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.labor_has_management_access(uuid) TO authenticated;

COMMIT;
