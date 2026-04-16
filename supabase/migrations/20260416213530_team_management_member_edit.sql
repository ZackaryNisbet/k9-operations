-- Team Management: edit Lite team members safely from the app.
-- Email edits update both auth.users and public.lite_profiles so login and
-- displayed team data stay congruent.

CREATE OR REPLACE FUNCTION public.manage_lite_team_member(
  p_profile_id UUID,
  p_full_name TEXT DEFAULT NULL,
  p_email TEXT DEFAULT NULL,
  p_role public.lite_role DEFAULT NULL,
  p_is_active BOOLEAN DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_target public.lite_profiles%ROWTYPE;
  v_updated public.lite_profiles%ROWTYPE;
  v_caller_role public.lite_role;
  v_caller_rank INTEGER;
  v_target_rank INTEGER;
  v_new_role public.lite_role;
  v_new_rank INTEGER;
  v_email TEXT;
  v_name TEXT;
BEGIN
  SELECT *
    INTO v_target
  FROM public.lite_profiles
  WHERE id = p_profile_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Team member not found.');
  END IF;

  SELECT caller.role
    INTO v_caller_role
  FROM public.lite_profiles caller
  WHERE caller.user_id = auth.uid()
    AND caller.is_active = TRUE
    AND (
      caller.role = 'enterprise_admin'
      OR caller.location_id IS NOT DISTINCT FROM v_target.location_id
    )
  ORDER BY CASE caller.role
    WHEN 'enterprise_admin' THEN 60
    WHEN 'location_admin' THEN 50
    WHEN 'manager' THEN 40
    WHEN 'supervisor' THEN 30
    WHEN 'csr' THEN 20
    WHEN 'pct' THEN 10
    ELSE 0
  END DESC
  LIMIT 1;

  IF v_caller_role IS NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('owner', 'role_owner', 'developer')
    ) THEN
      v_caller_role := 'enterprise_admin';
    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'Insufficient permissions.');
    END IF;
  END IF;

  v_caller_rank := CASE v_caller_role
    WHEN 'enterprise_admin' THEN 60
    WHEN 'location_admin' THEN 50
    WHEN 'manager' THEN 40
    WHEN 'supervisor' THEN 30
    WHEN 'csr' THEN 20
    WHEN 'pct' THEN 10
    ELSE 0
  END;

  IF v_caller_rank < 40 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient permissions. Must be Manager or above.');
  END IF;

  v_target_rank := CASE v_target.role
    WHEN 'enterprise_admin' THEN 60
    WHEN 'location_admin' THEN 50
    WHEN 'manager' THEN 40
    WHEN 'supervisor' THEN 30
    WHEN 'csr' THEN 20
    WHEN 'pct' THEN 10
    ELSE 0
  END;

  v_new_role := COALESCE(p_role, v_target.role);
  v_new_rank := CASE v_new_role
    WHEN 'enterprise_admin' THEN 60
    WHEN 'location_admin' THEN 50
    WHEN 'manager' THEN 40
    WHEN 'supervisor' THEN 30
    WHEN 'csr' THEN 20
    WHEN 'pct' THEN 10
    ELSE 0
  END;

  IF auth.uid() = v_target.user_id AND (v_new_role IS DISTINCT FROM v_target.role OR p_is_active = FALSE) THEN
    RETURN jsonb_build_object('success', false, 'error', 'You cannot change your own role or deactivate your own account.');
  END IF;

  IF v_caller_role <> 'enterprise_admin' AND v_target_rank >= v_caller_rank THEN
    RETURN jsonb_build_object('success', false, 'error', 'You cannot edit a team member with the same or higher access level.');
  END IF;

  IF v_caller_role <> 'enterprise_admin' AND v_new_rank >= v_caller_rank THEN
    RETURN jsonb_build_object('success', false, 'error', 'You cannot assign that role.');
  END IF;

  IF v_new_role = 'enterprise_admin' AND v_caller_role <> 'enterprise_admin' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only Enterprise Admins can assign Enterprise Admin.');
  END IF;

  v_email := lower(trim(COALESCE(p_email, v_target.email, '')));
  v_name := trim(COALESCE(p_full_name, v_target.full_name, ''));

  IF v_email = '' OR position('@' IN v_email) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'A valid email is required.');
  END IF;

  IF v_name = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Full name is required.');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.lite_profiles lp
    WHERE lp.id <> v_target.id
      AND lp.is_active = TRUE
      AND lower(lp.email) = v_email
      AND lp.location_id IS NOT DISTINCT FROM v_target.location_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Another active team member already uses that email at this location.');
  END IF;

  IF lower(COALESCE(v_target.email, '')) <> v_email THEN
    IF EXISTS (
      SELECT 1
      FROM auth.users au
      WHERE au.id <> v_target.user_id
        AND lower(au.email) = v_email
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Another Supabase Auth user already uses that email.');
    END IF;

    UPDATE auth.users
    SET email = v_email,
        raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('full_name', v_name),
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        updated_at = now()
    WHERE id = v_target.user_id;
  ELSE
    UPDATE auth.users
    SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('full_name', v_name),
        updated_at = now()
    WHERE id = v_target.user_id;
  END IF;

  UPDATE public.profiles
  SET email = v_email,
      full_name = v_name
  WHERE id = v_target.user_id;

  UPDATE public.lite_profiles
  SET email = v_email,
      full_name = v_name,
      role = v_new_role,
      is_active = COALESCE(p_is_active, is_active),
      updated_at = now()
  WHERE id = v_target.id
  RETURNING * INTO v_updated;

  RETURN jsonb_build_object('success', true, 'profile', to_jsonb(v_updated));
END;
$$;

GRANT EXECUTE ON FUNCTION public.manage_lite_team_member(UUID, TEXT, TEXT, public.lite_role, BOOLEAN) TO authenticated;

UPDATE public.lite_profiles lp
SET last_active = COALESCE(lp.last_active, au.last_sign_in_at, lp.updated_at, lp.created_at)
FROM auth.users au
WHERE au.id = lp.user_id
  AND lp.last_active IS NULL;

-- Existing send_lite_invite uses crypt/gen_salt when re-inviting an existing
-- auth user. In production pgcrypto lives under extensions, so pin the search
-- path or that branch fails with "function gen_salt(unknown) does not exist".
ALTER FUNCTION public.send_lite_invite(TEXT, TEXT, public.lite_role, TEXT)
  SET search_path = public, auth, vault, extensions, net;
