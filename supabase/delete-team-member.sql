-- ============================================================
-- DELETE TEAM MEMBER: Remove user from Supabase Auth entirely
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- ============================================================
-- SETUP: Replace YOUR_SERVICE_ROLE_KEY with your Supabase service_role key
--        (Supabase Dashboard > Settings > API > service_role secret key)
-- ============================================================

-- Enable http extension for DELETE requests (pg_net only supports POST/GET)
CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION delete_team_member(target_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  service_key TEXT := 'YOUR_SERVICE_ROLE_KEY';
  project_url TEXT := 'https://YOUR_SUPABASE_PROJECT_REF.supabase.co';
  caller_location UUID;
  target_location UUID;
  resp extensions.http_response;
BEGIN
  -- Prevent self-deletion
  IF target_user_id = auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'You cannot delete your own account');
  END IF;

  -- Only owners can delete team members
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('owner', 'role_owner')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only owners can delete team members');
  END IF;

  -- Get caller's location
  SELECT location_id INTO caller_location FROM profiles WHERE id = auth.uid();

  -- Get target's location and verify same location
  SELECT location_id INTO target_location FROM profiles WHERE id = target_user_id;

  IF target_location IS NULL OR target_location != caller_location THEN
    RETURN jsonb_build_object('success', false, 'error', 'User is not in your location');
  END IF;

  -- Delete the user via Supabase Auth Admin API
  SELECT * INTO resp FROM extensions.http((
    'DELETE',
    project_url || '/auth/v1/admin/users/' || target_user_id::text,
    ARRAY[
      extensions.http_header('Authorization', 'Bearer ' || service_key),
      extensions.http_header('apikey', service_key)
    ],
    NULL,
    NULL
  )::extensions.http_request);

  -- Check response status
  IF resp.status >= 200 AND resp.status < 300 THEN
    -- Profile is auto-deleted via ON DELETE CASCADE
    RETURN jsonb_build_object('success', true, 'message', 'User deleted successfully');
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Failed to delete user: ' || resp.status || ' ' || COALESCE(resp.content, ''));
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
