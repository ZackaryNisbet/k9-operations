-- Align Company Directory manual maintenance policies with the Lite role model.
-- The prior helper was intentionally narrow, but production Lite users can carry
-- elevated roles such as developer or multi_location_admin in lite_profiles.

BEGIN;

CREATE OR REPLACE FUNCTION public.enterprise_directory_can_manage()
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
    WHERE lp.user_id = auth.uid()
      AND COALESCE(lp.is_active, true) = true
      AND lower(regexp_replace(COALESCE(lp.role::text, ''), '[^a-z0-9]+', '_', 'g')) IN (
        'owner',
        'role_owner',
        'admin',
        'developer',
        'manager',
        'location_admin',
        'multi_location_admin',
        'multi_loc_admin',
        'enterprise_admin',
        'role_enterprise_admin'
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
          AND lower(regexp_replace(COALESCE(p.role::text, ''), '[^a-z0-9]+', '_', 'g')) IN (
            'owner',
            'role_owner',
            'admin',
            'developer',
            'manager',
            'location_admin',
            'multi_location_admin',
            'multi_loc_admin',
            'enterprise_admin',
            'role_enterprise_admin'
          )
      )
    $sql$
    INTO v_has_legacy_access;
  END IF;

  RETURN COALESCE(v_has_legacy_access, false);
END;
$$;

COMMIT;
