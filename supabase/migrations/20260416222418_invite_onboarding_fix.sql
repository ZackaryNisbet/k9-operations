-- Invite onboarding: send users to /login, force first-login password setup,
-- and keep Lite/legacy profile location data aligned for initial routing.

CREATE OR REPLACE FUNCTION public.send_lite_invite(
  invite_email    TEXT,
  invite_name     TEXT DEFAULT '',
  invite_role     public.lite_role DEFAULT 'pct',
  invite_location TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, vault, extensions, net
AS $$
DECLARE
  service_key      TEXT;
  resend_key       TEXT;
  project_url      TEXT := 'https://YOUR_SUPABASE_PROJECT_REF.supabase.co';
  login_url        TEXT := 'https://k9operations.com/login';
  temp_pass        TEXT;
  request_id       BIGINT;
  email_request_id BIGINT;
  v_user_id        UUID;
  v_caller_role    public.lite_role;
  v_email          TEXT;
  v_name           TEXT;
  v_location       TEXT;
  v_location_uuid  UUID;
  v_legacy_role    TEXT;
  display_name     TEXT;
  safe_name        TEXT;
  safe_email       TEXT;
  email_html       TEXT;
BEGIN
  v_email := lower(trim(COALESCE(invite_email, '')));
  v_name := COALESCE(NULLIF(trim(COALESCE(invite_name, '')), ''), split_part(v_email, '@', 1));
  v_location := NULLIF(trim(COALESCE(invite_location, '')), '');

  IF v_email = '' OR position('@' IN v_email) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'A valid email is required.');
  END IF;

  IF v_location ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_location_uuid := v_location::uuid;
  END IF;

  SELECT decrypted_secret INTO service_key
  FROM vault.decrypted_secrets
  WHERE name = 'service_role_key'
  LIMIT 1;

  SELECT decrypted_secret INTO resend_key
  FROM vault.decrypted_secrets
  WHERE name = 'resend_api_key'
  LIMIT 1;

  IF service_key IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'service_role_key not configured in vault.secrets.'
    );
  END IF;

  SELECT role INTO v_caller_role
  FROM public.lite_profiles
  WHERE user_id = auth.uid()
    AND is_active = TRUE
  ORDER BY
    CASE role
      WHEN 'enterprise_admin' THEN 1
      WHEN 'location_admin' THEN 2
      WHEN 'manager' THEN 3
      ELSE 4
    END
  LIMIT 1;

  IF v_caller_role IS NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('owner', 'role_owner')
    ) THEN
      v_caller_role := 'enterprise_admin';
    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'Insufficient permissions. Must be Manager or above.');
    END IF;
  END IF;

  IF v_caller_role NOT IN ('manager', 'location_admin', 'enterprise_admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient permissions. Must be Manager or above.');
  END IF;

  IF invite_role = 'enterprise_admin' AND v_caller_role != 'enterprise_admin' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only Enterprise Admins can create other Enterprise Admins.');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.lite_profiles
    WHERE lower(email) = v_email
      AND location_id IS NOT DISTINCT FROM v_location
      AND is_active = TRUE
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'A user with this email already exists at this location.');
  END IF;

  temp_pass := substr(md5(random()::text || clock_timestamp()::text), 1, 8);

  SELECT id INTO v_user_id
  FROM auth.users
  WHERE lower(email) = v_email;

  IF v_user_id IS NOT NULL THEN
    UPDATE auth.users
    SET encrypted_password = extensions.crypt(temp_pass, extensions.gen_salt('bf')),
        raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
          'full_name', v_name,
          'force_password_change', true
        ),
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        updated_at = now()
    WHERE id = v_user_id;
  ELSE
    SELECT net.http_post(
      url := project_url || '/auth/v1/admin/users',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || service_key,
        'apikey', service_key,
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
        'email', v_email,
        'password', temp_pass,
        'email_confirm', true,
        'user_metadata', jsonb_build_object(
          'full_name', v_name,
          'force_password_change', true
        )
      )
    ) INTO request_id;

    PERFORM pg_sleep(1);

    SELECT id INTO v_user_id
    FROM auth.users
    WHERE lower(email) = v_email;

    IF v_user_id IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Auth user creation may still be processing. Try again in a moment.'
      );
    END IF;
  END IF;

  UPDATE auth.users
  SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
        'full_name', v_name,
        'force_password_change', true
      ),
      updated_at = now()
  WHERE id = v_user_id;

  INSERT INTO public.lite_profiles (user_id, email, full_name, role, location_id, invited_by)
  VALUES (v_user_id, v_email, v_name, invite_role, v_location, auth.uid())
  ON CONFLICT (user_id, location_id) DO UPDATE SET
    email = EXCLUDED.email,
    role = EXCLUDED.role,
    full_name = EXCLUDED.full_name,
    is_active = TRUE,
    updated_at = now();

  v_legacy_role := CASE
    WHEN invite_role IN ('manager', 'location_admin', 'enterprise_admin') THEN 'manager'
    ELSE 'staff'
  END;

  INSERT INTO public.profiles (id, email, full_name, role, location_id)
  VALUES (v_user_id, v_email, v_name, v_legacy_role, v_location_uuid)
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    role = CASE
      WHEN public.profiles.role = 'owner' THEN public.profiles.role
      ELSE EXCLUDED.role
    END,
    location_id = COALESCE(EXCLUDED.location_id, public.profiles.location_id);

  display_name := COALESCE(NULLIF(v_name, ''), split_part(v_email, '@', 1));
  safe_name := replace(replace(replace(display_name, '&', '&amp;'), '<', '&lt;'), '>', '&gt;');
  safe_email := replace(replace(replace(v_email, '&', '&amp;'), '<', '&lt;'), '>', '&gt;');

  email_html := '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>'
    || '<body style="margin:0;padding:0;background:#f1f5f0;font-family:''Outfit'',''Segoe UI'',Roboto,Helvetica,Arial,sans-serif">'
    || '<div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(20,83,45,0.10)">'
    || '<div style="background:#14532D;padding:32px 40px;text-align:center">'
    || '<img src="https://k9operations.com/k9-email-logo-white.png" width="56" height="56" alt="K9 Operations" style="display:block;margin:0 auto 12px;border:0" />'
    || '<div style="font-size:26px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;line-height:1;font-family:''Outfit'',''Segoe UI'',Roboto,Helvetica,Arial,sans-serif">K9 Operations</div>'
    || '<div style="margin-top:10px;font-size:11px;font-weight:500;color:#84CC16;letter-spacing:2.5px;text-transform:uppercase;font-family:''Outfit'',''Segoe UI'',Roboto,Helvetica,Arial,sans-serif">The operating system for pet care facilities</div>'
    || '</div>'
    || '<div style="padding:36px 40px 28px">'
    || '<h2 style="margin:0 0 8px;color:#14532D;font-size:22px;font-weight:700;font-family:''Outfit'',''Segoe UI'',Roboto,Helvetica,Arial,sans-serif">Welcome, ' || safe_name || '!</h2>'
    || '<p style="margin:0 0 24px;color:#64748b;font-size:14px;line-height:1.7;font-family:''Outfit'',''Segoe UI'',Roboto,Helvetica,Arial,sans-serif">You''ve been invited to <strong style="color:#14532D">K9 Operations</strong>. Use the credentials below to sign in. You''ll be asked to set a permanent password on your first login.</p>'
    || '<div style="background:#F7FEE7;border:1.5px solid rgba(132,204,22,0.25);border-radius:12px;padding:20px 24px;margin-bottom:24px">'
    || '<div style="margin-bottom:16px">'
    || '<div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;font-family:''Outfit'',''Segoe UI'',Roboto,Helvetica,Arial,sans-serif">Email</div>'
    || '<div style="background:#ffffff;border:1.5px solid #e2e8f0;border-radius:8px;padding:12px 16px;font-size:15px;font-weight:600;color:#14532D;font-family:''Courier New'',monospace">' || safe_email || '</div>'
    || '</div>'
    || '<div style="border-top:1px solid rgba(132,204,22,0.19);padding-top:16px">'
    || '<div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;font-family:''Outfit'',''Segoe UI'',Roboto,Helvetica,Arial,sans-serif">Temporary Password</div>'
    || '<div style="background:#ffffff;border:1.5px solid #e2e8f0;border-radius:8px;padding:12px 16px;font-size:22px;font-weight:800;color:#14532D;font-family:''Courier New'',monospace;letter-spacing:3px">' || temp_pass || '</div>'
    || '<div style="font-size:11px;color:#94a3b8;margin-top:6px;font-family:''Outfit'',''Segoe UI'',Roboto,Helvetica,Arial,sans-serif">Tap the password to select it, then copy</div>'
    || '</div></div>'
    || '<a href="' || login_url || '" style="display:block;text-align:center;background:#14532D;color:#ffffff;text-decoration:none;padding:16px 24px;border-radius:10px;font-size:15px;font-weight:700;letter-spacing:0.3px;font-family:''Outfit'',''Segoe UI'',Roboto,Helvetica,Arial,sans-serif">Sign In to K9 Operations</a>'
    || '<p style="margin:12px 0 0;text-align:center;font-size:12px;color:#94a3b8;font-family:''Outfit'',''Segoe UI'',Roboto,Helvetica,Arial,sans-serif">Or go to: <a href="' || login_url || '" style="color:#14532D;font-weight:600;text-decoration:underline">k9operations.com/login</a></p>'
    || '</div>'
    || '<div style="padding:20px 40px;background:#F7FEE7;border-top:1px solid rgba(132,204,22,0.15);text-align:center">'
    || '<p style="margin:0;color:#94a3b8;font-size:11px;line-height:1.6;font-family:''Outfit'',''Segoe UI'',Roboto,Helvetica,Arial,sans-serif">This is an automated message from K9 Operations.<br/>If you did not expect this invitation, you can safely ignore this email.</p>'
    || '</div></div></body></html>';

  IF resend_key IS NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'temp_password', temp_pass,
      'message', 'Account created for ' || v_email || ' (email skipped - resend_api_key not configured in vault)'
    );
  END IF;

  SELECT net.http_post(
    url := 'https://api.resend.com/emails',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || resend_key,
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'from', 'K9 Operations <noreply@k9operations.com>',
      'to', v_email,
      'subject', 'You''ve been invited to K9 Operations',
      'html', email_html
    )
  ) INTO email_request_id;

  RETURN jsonb_build_object(
    'success', true,
    'temp_password', temp_pass,
    'message', 'Account created and welcome email sent to ' || v_email
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_lite_invite(TEXT, TEXT, public.lite_role, TEXT) TO authenticated;

UPDATE auth.users au
SET raw_user_meta_data = COALESCE(au.raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('force_password_change', true),
    updated_at = now()
WHERE au.created_at >= now() - interval '12 hours'
  AND COALESCE(au.raw_user_meta_data->>'force_password_change', '') <> 'true'
  AND EXISTS (
    SELECT 1
    FROM public.lite_profiles lp
    WHERE lp.user_id = au.id
      AND lp.is_active = TRUE
  );
