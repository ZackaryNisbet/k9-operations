-- ============================================================================
-- K9 Operations Lite — Updated Invite RPC with Branded Email
-- ============================================================================
-- Replaces send_lite_invite to also send a branded welcome email via Resend.
-- SETUP (run ONCE if not already done):
--   INSERT INTO vault.secrets (name, secret)
--   VALUES ('resend_api_key', 'your-actual-resend-api-key-here');
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION send_lite_invite(
  invite_email    TEXT,
  invite_name     TEXT DEFAULT '',
  invite_role     lite_role DEFAULT 'pct',
  invite_location TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  service_key   TEXT;
  resend_key    TEXT;
  project_url   TEXT := 'https://YOUR_SUPABASE_PROJECT_REF.supabase.co';
  temp_pass     TEXT;
  request_id    BIGINT;
  email_request_id BIGINT;
  v_user_id     UUID;
  v_caller_role lite_role;
  display_name  TEXT;
  email_html    TEXT;
  logo_b64      TEXT;
BEGIN
  -- Load secrets from Supabase Vault
  SELECT decrypted_secret INTO service_key
  FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;

  SELECT decrypted_secret INTO resend_key
  FROM vault.decrypted_secrets WHERE name = 'resend_api_key' LIMIT 1;

  IF service_key IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'service_role_key not configured in vault.secrets.'
    );
  END IF;

  -- Permission check: caller must be manager+ in lite_profiles
  SELECT role INTO v_caller_role FROM lite_profiles
  WHERE user_id = auth.uid() AND is_active = TRUE
  ORDER BY
    CASE role
      WHEN 'enterprise_admin' THEN 1
      WHEN 'location_admin' THEN 2
      WHEN 'manager' THEN 3
      ELSE 4
    END
  LIMIT 1;

  -- Also allow POS owners to create Lite users (bootstrap scenario)
  IF v_caller_role IS NULL THEN
    IF EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'role_owner')) THEN
      v_caller_role := 'enterprise_admin';
    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'Insufficient permissions. Must be Manager or above.');
    END IF;
  END IF;

  IF v_caller_role NOT IN ('manager', 'location_admin', 'enterprise_admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient permissions. Must be Manager or above.');
  END IF;

  -- Enterprise admin creation requires caller to be enterprise admin
  IF invite_role = 'enterprise_admin' AND v_caller_role != 'enterprise_admin' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only Enterprise Admins can create other Enterprise Admins.');
  END IF;

  -- Check for duplicate lite_profile at this location
  IF EXISTS (
    SELECT 1 FROM lite_profiles
    WHERE email = invite_email AND location_id = invite_location AND is_active = TRUE
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'A user with this email already exists at this location.');
  END IF;

  -- Generate random temp password
  temp_pass := substr(md5(random()::text || clock_timestamp()::text), 1, 8);

  -- Check if auth user already exists
  SELECT id INTO v_user_id FROM auth.users WHERE email = invite_email;

  IF v_user_id IS NOT NULL THEN
    -- User exists in auth — just update their password
    UPDATE auth.users SET
      encrypted_password = crypt(temp_pass, gen_salt('bf')),
      raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
        'full_name', COALESCE(NULLIF(invite_name, ''), raw_user_meta_data->>'full_name')
      ),
      updated_at = now()
    WHERE id = v_user_id;
  ELSE
    -- Create new auth user via Supabase Admin API
    SELECT net.http_post(
      url := project_url || '/auth/v1/admin/users',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || service_key,
        'apikey', service_key,
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
        'email', invite_email,
        'password', temp_pass,
        'email_confirm', true,
        'user_metadata', jsonb_build_object('full_name', invite_name)
      )
    ) INTO request_id;

    -- Wait briefly for the user to be created, then look them up
    PERFORM pg_sleep(1);
    SELECT id INTO v_user_id FROM auth.users WHERE email = invite_email;

    IF v_user_id IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Auth user creation may still be processing. Try again in a moment.'
      );
    END IF;
  END IF;

  -- Insert the lite_profiles row
  INSERT INTO lite_profiles (user_id, email, full_name, role, location_id, invited_by)
  VALUES (v_user_id, invite_email, COALESCE(NULLIF(invite_name, ''), invite_email), invite_role, invite_location, auth.uid())
  ON CONFLICT (user_id, location_id) DO UPDATE SET
    role = EXCLUDED.role,
    full_name = EXCLUDED.full_name,
    is_active = TRUE,
    updated_at = now();

  -- ════════════════════════════════════════════════════════════════════════
  -- SEND BRANDED WELCOME EMAIL VIA RESEND
  -- ════════════════════════════════════════════════════════════════════════
  display_name := COALESCE(NULLIF(invite_name, ''), split_part(invite_email, '@', 1));

  -- K9 Operations branded email — Forest Green (#14532D) + Electric Lime (#84CC16)
  -- Outfit font with fallbacks, Canopy Cream (#F7FEE7) accent surfaces
  email_html := '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>'
    || '<body style="margin:0;padding:0;background:#f1f5f0;font-family:''Outfit'',''Segoe UI'',Roboto,Helvetica,Arial,sans-serif">'
    || '<div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(20,83,45,0.10)">'
    -- Header: Forest Green with white wordmark + tagline
    || '<div style="background:#14532D;padding:32px 40px;text-align:center">'
    || '<img src="https://k9operations.com/k9-email-logo-white.png" width="56" height="56" alt="K9 Operations" style="display:block;margin:0 auto 12px;border:0" />'
    || '<div style="font-size:26px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;line-height:1;font-family:''Outfit'',''Segoe UI'',Roboto,Helvetica,Arial,sans-serif">K9 Operations</div>'
    || '<div style="margin-top:10px;font-size:11px;font-weight:500;color:#84CC16;letter-spacing:2.5px;text-transform:uppercase;font-family:''Outfit'',''Segoe UI'',Roboto,Helvetica,Arial,sans-serif">The operating system for pet care facilities</div>'
    || '</div>'
    -- Body
    || '<div style="padding:36px 40px 28px">'
    || '<h2 style="margin:0 0 8px;color:#14532D;font-size:22px;font-weight:700;font-family:''Outfit'',''Segoe UI'',Roboto,Helvetica,Arial,sans-serif">Welcome, ' || display_name || '!</h2>'
    || '<p style="margin:0 0 24px;color:#64748b;font-size:14px;line-height:1.7;font-family:''Outfit'',''Segoe UI'',Roboto,Helvetica,Arial,sans-serif">You''ve been invited to <strong style="color:#14532D">K9 Operations</strong>. Use the credentials below to sign in. You''ll be asked to set a permanent password on your first login.</p>'
    -- Credentials card (Canopy Cream background)
    || '<div style="background:#F7FEE7;border:1.5px solid rgba(132,204,22,0.25);border-radius:12px;padding:20px 24px;margin-bottom:24px">'
    || '<div style="margin-bottom:16px">'
    || '<div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;font-family:''Outfit'',''Segoe UI'',Roboto,Helvetica,Arial,sans-serif">Email</div>'
    || '<div style="background:#ffffff;border:1.5px solid #e2e8f0;border-radius:8px;padding:12px 16px;font-size:15px;font-weight:600;color:#14532D;font-family:''Courier New'',monospace">' || invite_email || '</div>'
    || '</div>'
    || '<div style="border-top:1px solid rgba(132,204,22,0.19);padding-top:16px">'
    || '<div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;font-family:''Outfit'',''Segoe UI'',Roboto,Helvetica,Arial,sans-serif">Temporary Password</div>'
    || '<div style="background:#ffffff;border:1.5px solid #e2e8f0;border-radius:8px;padding:12px 16px;font-size:22px;font-weight:800;color:#14532D;font-family:''Courier New'',monospace;letter-spacing:3px">' || temp_pass || '</div>'
    || '<div style="font-size:11px;color:#94a3b8;margin-top:6px;font-family:''Outfit'',''Segoe UI'',Roboto,Helvetica,Arial,sans-serif">Tap the password to select it, then copy</div>'
    || '</div></div>'
    -- CTA button
    || '<a href="https://k9operations.com" style="display:block;text-align:center;background:#14532D;color:#ffffff;text-decoration:none;padding:16px 24px;border-radius:10px;font-size:15px;font-weight:700;letter-spacing:0.3px;font-family:''Outfit'',''Segoe UI'',Roboto,Helvetica,Arial,sans-serif">Sign In to K9 Operations</a>'
    || '<p style="margin:12px 0 0;text-align:center;font-size:12px;color:#94a3b8;font-family:''Outfit'',''Segoe UI'',Roboto,Helvetica,Arial,sans-serif">Or go to: <a href="https://k9operations.com" style="color:#14532D;font-weight:600;text-decoration:underline">k9operations.com</a></p>'
    || '</div>'
    -- Footer
    || '<div style="padding:20px 40px;background:#F7FEE7;border-top:1px solid rgba(132,204,22,0.15);text-align:center">'
    || '<p style="margin:0;color:#94a3b8;font-size:11px;line-height:1.6;font-family:''Outfit'',''Segoe UI'',Roboto,Helvetica,Arial,sans-serif">This is an automated message from K9 Operations.<br/>If you did not expect this invitation, you can safely ignore this email.</p>'
    || '</div></div></body></html>';

  -- Send via Resend (skip if no key configured)
  IF resend_key IS NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'temp_password', temp_pass,
      'message', 'Account created for ' || invite_email || ' (email skipped — resend_api_key not configured in vault)'
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
      'to', invite_email,
      'subject', 'You''ve been invited to K9 Operations',
      'html', email_html
    )
  ) INTO email_request_id;

  RETURN jsonb_build_object(
    'success', true,
    'temp_password', temp_pass,
    'message', 'Account created and welcome email sent to ' || invite_email
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
