-- ============================================================
-- TEAM INVITE: Create User with Temporary Password
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- ============================================================
-- SETUP: Replace YOUR_SERVICE_ROLE_KEY on line 20 with your actual key
-- (Supabase Dashboard > Settings > API > service_role secret key)
-- ============================================================
-- This replaces the old magic-link invite with a temp-password flow:
-- 1. Generates a random 8-char password
-- 2. Creates the user via Supabase Admin API with that password
-- 3. Returns the temp password so the inviter can share it
-- 4. User logs in with temp password → prompted to set a permanent one
-- ============================================================

-- Enable pg_net extension (async HTTP requests from PostgreSQL)
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION send_team_invite(invite_email TEXT, invite_name TEXT DEFAULT '')
RETURNS JSONB AS $$
DECLARE
  service_key TEXT := 'YOUR_SERVICE_ROLE_KEY';
  project_url TEXT := 'https://YOUR_SUPABASE_PROJECT_REF.supabase.co';
  temp_pass TEXT;
  request_id BIGINT;
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
  -- The user is created with email_confirm = true (no email verification needed)
  -- and force_password_change metadata so the app prompts them to set a real password
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

  -- Return the temp password so the inviter can share it with the invitee
  RETURN jsonb_build_object(
    'success', true,
    'temp_password', temp_pass,
    'message', 'Account created for ' || invite_email || '. Share the temporary password with them.'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
