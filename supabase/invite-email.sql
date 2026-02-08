-- ============================================================
-- AUTO-SEND INVITE EMAIL
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- ============================================================
-- SETUP: Replace YOUR_SERVICE_ROLE_KEY on line 17 with your actual key
-- (Supabase Dashboard > Settings > API > service_role secret key)
-- ============================================================

-- Enable pg_net extension (async HTTP requests from PostgreSQL)
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Create the invite function
-- ⚠️ REPLACE YOUR_SERVICE_ROLE_KEY below before running!
CREATE OR REPLACE FUNCTION send_team_invite(invite_email TEXT, invite_name TEXT DEFAULT '')
RETURNS JSONB AS $$
DECLARE
  service_key TEXT := 'YOUR_SERVICE_ROLE_KEY';
  project_url TEXT := 'https://YOUR_SUPABASE_PROJECT_REF.supabase.co';
  request_id BIGINT;
BEGIN
  -- Only owners can send invites
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('owner', 'role_owner')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only owners can send invites');
  END IF;

  -- Call Supabase Auth Admin API to send invite email
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
