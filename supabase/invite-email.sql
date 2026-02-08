-- ============================================================
-- AUTO-SEND INVITE EMAIL
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- ============================================================
-- This creates a database function that calls the Supabase Auth Admin API
-- to automatically send an invite email when an owner invites a team member.
--
-- SETUP (2 steps):
-- 1. Run this entire SQL file
-- 2. Replace YOUR_SERVICE_ROLE_KEY below with your actual service role key
--    (found in Supabase Dashboard > Settings > API > service_role key)
-- ============================================================

-- Enable pg_net extension (async HTTP requests from PostgreSQL)
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Store your service role key securely in database settings
-- ⚠️ REPLACE the value below with your ACTUAL service_role key from
--    Supabase Dashboard > Settings > API > Project API Keys > service_role
ALTER DATABASE postgres SET app.settings.service_role_key = 'YOUR_SERVICE_ROLE_KEY';

-- Store your Supabase project URL
ALTER DATABASE postgres SET app.settings.supabase_url = 'https://YOUR_SUPABASE_PROJECT_REF.supabase.co';

-- Reload config so the settings take effect immediately
SELECT pg_reload_conf();

-- Create the invite function
CREATE OR REPLACE FUNCTION send_team_invite(invite_email TEXT, invite_name TEXT DEFAULT '')
RETURNS JSONB AS $$
DECLARE
  service_key TEXT;
  project_url TEXT;
  request_id BIGINT;
BEGIN
  -- Only owners can send invites
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('owner', 'role_owner')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only owners can send invites');
  END IF;

  -- Get stored settings
  service_key := current_setting('app.settings.service_role_key', true);
  project_url := current_setting('app.settings.supabase_url', true);

  -- Validate settings exist
  IF service_key IS NULL OR service_key = 'YOUR_SERVICE_ROLE_KEY' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Service role key not configured');
  END IF;

  -- Call Supabase Auth Admin API to send invite email
  -- This creates the user account AND sends them a branded invite email
  SELECT net.http_post(
    url := project_url || '/auth/v1/invite',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || service_key,
      'apikey', service_key,
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'email', invite_email,
      'data', jsonb_build_object('full_name', invite_name)
    )
  ) INTO request_id;

  RETURN jsonb_build_object('success', true, 'message', 'Invite email sent to ' || invite_email);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
