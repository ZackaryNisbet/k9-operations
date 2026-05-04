-- Team Management account operations:
-- - Track Lite account activity separately for web and mobile while preserving
--   last_active as the canonical "most recent usage" value.
-- - Let authorized managers reset a team member password server-side without
--   exposing service_role credentials to web or mobile clients.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

ALTER TABLE public.lite_profiles
  ADD COLUMN IF NOT EXISTS last_web_active TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_mobile_active TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_active_source TEXT,
  ADD COLUMN IF NOT EXISTS last_password_reset_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_password_reset_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS password_reset_required BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_lite_profiles_location_last_active
  ON public.lite_profiles (location_id, last_active DESC)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_lite_profiles_password_reset_required
  ON public.lite_profiles (location_id, password_reset_required)
  WHERE is_active = TRUE AND password_reset_required = TRUE;

UPDATE public.lite_profiles lp
SET last_web_active = COALESCE(lp.last_web_active, lp.last_active, au.last_sign_in_at),
    last_active = NULLIF(GREATEST(
      COALESCE(lp.last_active, '-infinity'::timestamptz),
      COALESCE(au.last_sign_in_at, '-infinity'::timestamptz)
    ), '-infinity'::timestamptz),
    last_active_source = COALESCE(lp.last_active_source, 'web')
FROM auth.users au
WHERE au.id = lp.user_id
  AND (
    lp.last_web_active IS NULL
    OR lp.last_active IS NULL
    OR (
      au.last_sign_in_at IS NOT NULL
      AND (lp.last_active IS NULL OR au.last_sign_in_at > lp.last_active)
    )
  );

CREATE OR REPLACE FUNCTION public.lite_role_rank(p_role public.lite_role)
RETURNS INTEGER
LANGUAGE SQL
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_role
    WHEN 'enterprise_admin' THEN 60
    WHEN 'location_admin' THEN 50
    WHEN 'manager' THEN 40
    WHEN 'supervisor' THEN 30
    WHEN 'csr' THEN 20
    WHEN 'pct' THEN 10
    ELSE 0
  END;
$$;

CREATE OR REPLACE FUNCTION public.record_lite_app_activity(p_surface TEXT DEFAULT 'web')
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_surface TEXT;
  v_now TIMESTAMPTZ := now();
  v_count INTEGER := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated.');
  END IF;

  v_surface := lower(trim(COALESCE(p_surface, 'web')));
  IF v_surface IN ('mobile', 'ios', 'android', 'capacitor') THEN
    v_surface := 'mobile';
  ELSE
    v_surface := 'web';
  END IF;

  UPDATE public.lite_profiles
  SET last_active = v_now,
      last_web_active = CASE WHEN v_surface = 'web' THEN v_now ELSE last_web_active END,
      last_mobile_active = CASE WHEN v_surface = 'mobile' THEN v_now ELSE last_mobile_active END,
      last_active_source = v_surface,
      updated_at = v_now
  WHERE user_id = auth.uid()
    AND is_active = TRUE;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'surface', v_surface,
    'profile_count', v_count,
    'last_active', v_now
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_lite_app_activity(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.complete_lite_password_setup()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated.');
  END IF;

  UPDATE auth.users
  SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb)
      || jsonb_build_object('force_password_change', false),
      updated_at = now()
  WHERE id = auth.uid();

  UPDATE public.lite_profiles
  SET password_reset_required = FALSE,
      updated_at = now()
  WHERE user_id = auth.uid()
    AND is_active = TRUE;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'profile_count', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_lite_password_setup() TO authenticated;

CREATE OR REPLACE FUNCTION public.reset_lite_team_member_password(
  p_profile_id UUID,
  p_send_email BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, vault, extensions, net
AS $$
DECLARE
  v_target public.lite_profiles%ROWTYPE;
  v_caller public.lite_profiles%ROWTYPE;
  v_caller_role public.lite_role;
  v_caller_rank INTEGER := 0;
  v_target_rank INTEGER := 0;
  v_temp_password TEXT;
  v_now TIMESTAMPTZ := now();
  v_auth_count INTEGER := 0;
  v_resend_key TEXT;
  v_email_request_id BIGINT;
  v_login_url TEXT := 'https://k9operations.com/login';
  v_display_name TEXT;
  v_safe_name TEXT;
  v_safe_email TEXT;
  v_email_html TEXT;
  v_email_sent BOOLEAN := FALSE;
  v_sessions_revoked INTEGER := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated.');
  END IF;

  SELECT *
    INTO v_target
  FROM public.lite_profiles
  WHERE id = p_profile_id
    AND is_active = TRUE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Team member not found.');
  END IF;

  IF v_target.user_id = auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Use the normal password reset flow for your own account.');
  END IF;

  SELECT *
    INTO v_caller
  FROM public.lite_profiles caller
  WHERE caller.user_id = auth.uid()
    AND caller.is_active = TRUE
    AND (
      caller.role = 'enterprise_admin'
      OR caller.location_id IS NOT DISTINCT FROM v_target.location_id
    )
  ORDER BY public.lite_role_rank(caller.role) DESC
  LIMIT 1;

  IF FOUND THEN
    v_caller_role := v_caller.role;
  ELSE
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

  v_caller_rank := public.lite_role_rank(v_caller_role);
  v_target_rank := public.lite_role_rank(v_target.role);

  IF v_caller_rank < 40 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient permissions. Must be Manager or above.');
  END IF;

  IF v_caller_role <> 'enterprise_admin' AND v_target_rank >= v_caller_rank THEN
    RETURN jsonb_build_object('success', false, 'error', 'You cannot reset a team member with the same or higher access level.');
  END IF;

  v_temp_password := 'K9-' || substr(encode(extensions.gen_random_bytes(9), 'hex'), 1, 12);
  v_display_name := COALESCE(NULLIF(v_target.full_name, ''), split_part(v_target.email, '@', 1), 'team member');

  UPDATE auth.users
  SET encrypted_password = extensions.crypt(v_temp_password, extensions.gen_salt('bf')),
      raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
        'full_name', v_display_name,
        'force_password_change', true
      ),
      email_confirmed_at = COALESCE(email_confirmed_at, v_now),
      updated_at = v_now
  WHERE id = v_target.user_id;

  GET DIAGNOSTICS v_auth_count = ROW_COUNT;

  IF v_auth_count = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Matching Supabase Auth user was not found.');
  END IF;

  UPDATE public.lite_profiles
  SET last_password_reset_at = v_now,
      last_password_reset_by = auth.uid(),
      password_reset_required = TRUE,
      updated_at = v_now
  WHERE user_id = v_target.user_id
    AND is_active = TRUE;

  IF to_regclass('auth.sessions') IS NOT NULL THEN
    DELETE FROM auth.sessions
    WHERE user_id = v_target.user_id;

    GET DIAGNOSTICS v_sessions_revoked = ROW_COUNT;
  END IF;

  INSERT INTO public.lite_audit_log (
    location_id,
    user_id,
    user_name,
    action,
    resource_type,
    resource_id,
    details
  )
  VALUES (
    COALESCE(v_target.location_id, 'enterprise'),
    auth.uid(),
    COALESCE(
      NULLIF(v_caller.full_name, ''),
      (SELECT email FROM auth.users WHERE id = auth.uid()),
      'Account admin'
    ),
    'Team Member Password Reset',
    'lite_profile',
    v_target.id::text,
    jsonb_build_array(
      jsonb_build_object('field', 'Team member', 'oldVal', NULL, 'newVal', COALESCE(v_target.full_name, v_target.email)),
      jsonb_build_object('field', 'Email', 'oldVal', NULL, 'newVal', v_target.email),
      jsonb_build_object('field', 'Delivery', 'oldVal', NULL, 'newVal', CASE WHEN p_send_email THEN 'email_and_copy' ELSE 'copy_only' END),
      jsonb_build_object('field', 'Force password change', 'oldVal', FALSE, 'newVal', TRUE),
      jsonb_build_object('field', 'Sessions revoked', 'oldVal', NULL, 'newVal', v_sessions_revoked)
    )
  );

  IF p_send_email THEN
    SELECT decrypted_secret INTO v_resend_key
    FROM vault.decrypted_secrets
    WHERE name = 'resend_api_key'
    LIMIT 1;

    IF v_resend_key IS NOT NULL THEN
      v_safe_name := replace(replace(replace(v_display_name, '&', '&amp;'), '<', '&lt;'), '>', '&gt;');
      v_safe_email := replace(replace(replace(COALESCE(v_target.email, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;');

      v_email_html := '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>'
        || '<body style="margin:0;padding:0;background:#f1f5f0;font-family:''Outfit'',''Segoe UI'',Roboto,Helvetica,Arial,sans-serif">'
        || '<div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(20,83,45,0.10)">'
        || '<div style="background:#14532D;padding:30px 40px;text-align:center">'
        || '<img src="https://k9operations.com/k9-email-logo-white.png" width="52" height="52" alt="K9 Operations" style="display:block;margin:0 auto 12px;border:0" />'
        || '<div style="font-size:24px;font-weight:800;color:#ffffff;line-height:1">K9 Operations</div>'
        || '<div style="margin-top:10px;font-size:11px;font-weight:600;color:#84CC16;letter-spacing:2px;text-transform:uppercase">Account access reset</div>'
        || '</div>'
        || '<div style="padding:34px 40px 28px">'
        || '<h2 style="margin:0 0 8px;color:#14532D;font-size:21px;font-weight:800">Password reset for ' || v_safe_name || '</h2>'
        || '<p style="margin:0 0 22px;color:#64748b;font-size:14px;line-height:1.7">A K9 Operations manager reset your account password. Use the temporary password below to sign in, then set a permanent password.</p>'
        || '<div style="background:#F7FEE7;border:1.5px solid rgba(132,204,22,0.25);border-radius:12px;padding:20px 24px;margin-bottom:24px">'
        || '<div style="font-size:11px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px">Email</div>'
        || '<div style="background:#ffffff;border:1.5px solid #e2e8f0;border-radius:8px;padding:12px 16px;font-size:15px;font-weight:700;color:#14532D;font-family:''Courier New'',monospace;margin-bottom:16px">' || v_safe_email || '</div>'
        || '<div style="font-size:11px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px">Temporary Password</div>'
        || '<div style="background:#ffffff;border:1.5px solid #e2e8f0;border-radius:8px;padding:12px 16px;font-size:22px;font-weight:900;color:#14532D;font-family:''Courier New'',monospace;letter-spacing:2px">' || v_temp_password || '</div>'
        || '</div>'
        || '<a href="' || v_login_url || '" style="display:block;text-align:center;background:#14532D;color:#ffffff;text-decoration:none;padding:15px 24px;border-radius:10px;font-size:15px;font-weight:800">Sign In</a>'
        || '<p style="margin:12px 0 0;text-align:center;font-size:12px;color:#94a3b8">Or go to: <a href="' || v_login_url || '" style="color:#14532D;font-weight:700;text-decoration:underline">k9operations.com/login</a></p>'
        || '</div>'
        || '<div style="padding:18px 40px;background:#F7FEE7;border-top:1px solid rgba(132,204,22,0.15);text-align:center">'
        || '<p style="margin:0;color:#94a3b8;font-size:11px;line-height:1.6">If you did not expect this reset, contact your manager before signing in.</p>'
        || '</div></div></body></html>';

      SELECT net.http_post(
        url := 'https://api.resend.com/emails',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || v_resend_key,
          'Content-Type', 'application/json'
        ),
        body := jsonb_build_object(
          'from', 'K9 Operations <noreply@k9operations.com>',
          'to', v_target.email,
          'subject', 'Your K9 Operations password was reset',
          'html', v_email_html
        )
      ) INTO v_email_request_id;

      v_email_sent := TRUE;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'email', v_target.email,
    'full_name', v_target.full_name,
    'temp_password', v_temp_password,
    'password_reset_required', true,
    'email_sent', v_email_sent,
    'sessions_revoked', v_sessions_revoked,
    'message', CASE
      WHEN v_email_sent THEN 'Temporary password created and emailed to ' || v_target.email || '.'
      WHEN p_send_email THEN 'Temporary password created. Email skipped because resend_api_key is not configured.'
      ELSE 'Temporary password created.'
    END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reset_lite_team_member_password(UUID, BOOLEAN) TO authenticated;
