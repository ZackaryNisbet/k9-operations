-- ============================================================
-- TEAM INVITE: Create User with Temporary Password + Auto-Email
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- ============================================================
-- SETUP (two keys to replace):
--   Line 22: Replace YOUR_SERVICE_ROLE_KEY with your Supabase service_role key
--            (Supabase Dashboard > Settings > API > service_role secret key)
--   Line 24: Replace YOUR_RESEND_API_KEY with your Resend API key
--            (resend.com > API Keys > Create API Key)
-- ============================================================
-- Flow:
-- 1. Generates a random 8-char temp password
-- 2. Creates the user via Supabase Admin API with that password
-- 3. Sends a welcome email with login credentials via Resend
-- 4. Returns the temp password to the inviter (displayed in UI)
-- 5. Invitee logs in with temp password → prompted to set permanent one
-- ============================================================

-- Enable pg_net extension (async HTTP requests from PostgreSQL)
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION send_team_invite(invite_email TEXT, invite_name TEXT DEFAULT '')
RETURNS JSONB AS $$
DECLARE
  service_key TEXT := 'YOUR_SERVICE_ROLE_KEY';
  project_url TEXT := 'https://xuzvqcpthqikyroqhypw.supabase.co';
  resend_key  TEXT := 'YOUR_RESEND_API_KEY';
  temp_pass TEXT;
  request_id BIGINT;
  email_request_id BIGINT;
  display_name TEXT;
  email_html TEXT;
BEGIN
  -- Only owners can send invites
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('owner', 'role_owner')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only owners can send invites');
  END IF;

  -- Generate random 8-character temp password (letters + digits)
  temp_pass := substr(md5(random()::text || clock_timestamp()::text), 1, 8);

  -- Create user via Supabase Auth Admin API with temp password
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
      'user_metadata', jsonb_build_object(
        'full_name', invite_name,
        'force_password_change', true
      )
    )
  ) INTO request_id;

  -- Build the welcome email HTML
  display_name := COALESCE(NULLIF(invite_name, ''), split_part(invite_email, '@', 1));

  email_html := '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif">'
    || '<div style="max-width:520px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">'
    || '<div style="background:#003462;padding:28px 36px">'
    || '<table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto"><tr>'
    || '<td style="vertical-align:middle;padding-right:16px">'
    || '<img src="data:image/png;base64,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" width="40" height="40" alt="K9" style="display:block;border:0" />'
    || '</td>'
    || '<td style="vertical-align:middle">'
    || '<div style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;line-height:1">K9</div>'
    || '<div style="font-size:11px;font-weight:500;color:#AF8D54;letter-spacing:4px;margin-top:1px">OPERATIONS</div>'
    || '</td>'
    || '</tr></table>'
    || '</div>'
    || '<div style="padding:36px 36px 28px">'
    || '<h2 style="margin:0 0 8px;color:#1a1d23;font-size:20px;font-weight:700">Welcome, ' || display_name || '!</h2>'
    || '<p style="margin:0 0 24px;color:#6b7280;font-size:14px;line-height:1.6">You''ve been invited to K9 Operations. Use the credentials below to sign in. You''ll be asked to set a permanent password on your first login.</p>'
    || '<div style="background:#f8f9fb;border:1.5px solid #e5e7eb;border-radius:10px;padding:20px 24px;margin-bottom:24px">'
    || '<div style="margin-bottom:14px">'
    || '<div style="font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">Email</div>'
    || '<div style="font-size:15px;font-weight:600;color:#1a1d23;font-family:monospace">' || invite_email || '</div>'
    || '</div>'
    || '<div style="border-top:1px solid #e5e7eb;padding-top:14px">'
    || '<div style="font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">Temporary Password</div>'
    || '<div style="font-size:18px;font-weight:700;color:#003462;font-family:monospace;letter-spacing:1px">' || temp_pass || '</div>'
    || '</div>'
    || '</div>'
    || '<a href="https://k9operations.com" style="display:block;text-align:center;background:#003462;color:#ffffff;text-decoration:none;padding:14px 24px;border-radius:8px;font-size:15px;font-weight:600;letter-spacing:0.3px">Sign In to K9 Operations</a>'
    || '</div>'
    || '<div style="padding:20px 36px;background:#f8f9fb;border-top:1px solid #e5e7eb;text-align:center">'
    || '<p style="margin:0;color:#9ca3af;font-size:12px">This is an automated message from K9 Operations. If you did not expect this invitation, you can safely ignore this email.</p>'
    || '</div>'
    || '</div></body></html>';

  -- Send the welcome email via Resend API
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

  -- Return the temp password so the inviter can also see/share it
  RETURN jsonb_build_object(
    'success', true,
    'temp_password', temp_pass,
    'message', 'Account created and welcome email sent to ' || invite_email
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
