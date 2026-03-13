-- ============================================================================
-- K9 Operations Lite — User Profiles Table
-- ============================================================================
-- Separate from the POS `profiles` table. Shares the same Supabase auth
-- layer (auth.users) so login credentials work across both apps, but
-- role assignments and location memberships are independent.
-- ============================================================================

-- Enum for the 6 Lite roles
DO $$ BEGIN
  CREATE TYPE lite_role AS ENUM (
    'pct',              -- Pet Care Technician
    'csr',              -- Customer Service Representative
    'supervisor',
    'manager',
    'location_admin',
    'enterprise_admin'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Main profiles table
CREATE TABLE IF NOT EXISTS lite_profiles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,
  full_name     TEXT,
  role          lite_role NOT NULL DEFAULT 'pct',
  location_id   TEXT,          -- e.g. 'cherry-hill', NULL for enterprise-only admins
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  invited_by    UUID REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_active   TIMESTAMPTZ,

  -- A user can only have one role per location
  UNIQUE(user_id, location_id)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_lite_profiles_user_id     ON lite_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_lite_profiles_location    ON lite_profiles(location_id);
CREATE INDEX IF NOT EXISTS idx_lite_profiles_role        ON lite_profiles(role);
CREATE INDEX IF NOT EXISTS idx_lite_profiles_active       ON lite_profiles(is_active) WHERE is_active = TRUE;

-- Auto-update updated_at on row changes
CREATE OR REPLACE FUNCTION update_lite_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_lite_profiles_updated_at ON lite_profiles;
CREATE TRIGGER trg_lite_profiles_updated_at
  BEFORE UPDATE ON lite_profiles
  FOR EACH ROW EXECUTE FUNCTION update_lite_profiles_updated_at();

-- ============================================================================
-- Row Level Security
-- ============================================================================
ALTER TABLE lite_profiles ENABLE ROW LEVEL SECURITY;

-- Users can read profiles at their own locations
CREATE POLICY lite_profiles_select ON lite_profiles
  FOR SELECT USING (
    auth.uid() = user_id
    OR location_id IN (
      SELECT location_id FROM lite_profiles WHERE user_id = auth.uid()
    )
    -- Enterprise admins can see all profiles
    OR EXISTS (
      SELECT 1 FROM lite_profiles
      WHERE user_id = auth.uid() AND role = 'enterprise_admin'
    )
  );

-- Only managers, location admins, and enterprise admins can insert
CREATE POLICY lite_profiles_insert ON lite_profiles
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM lite_profiles
      WHERE user_id = auth.uid()
        AND role IN ('manager', 'location_admin', 'enterprise_admin')
    )
  );

-- Only managers+ can update, and only within their location
-- Enterprise admins can update any profile
CREATE POLICY lite_profiles_update ON lite_profiles
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM lite_profiles lp
      WHERE lp.user_id = auth.uid()
        AND (
          (lp.role IN ('manager', 'location_admin') AND lp.location_id = lite_profiles.location_id)
          OR lp.role = 'enterprise_admin'
        )
    )
  );

-- Only location admins+ can delete, and only within their location
-- Enterprise admins can delete any profile
CREATE POLICY lite_profiles_delete ON lite_profiles
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM lite_profiles lp
      WHERE lp.user_id = auth.uid()
        AND (
          (lp.role = 'location_admin' AND lp.location_id = lite_profiles.location_id)
          OR lp.role = 'enterprise_admin'
        )
    )
  );

-- ============================================================================
-- Invite RPC: Creates auth user + lite_profiles row in one call.
-- Uses the service_role key from Supabase Vault to call the Admin API
-- server-side, so the caller's session is NOT affected.
-- ============================================================================
-- SETUP (run ONCE before using this function):
--
--   INSERT INTO vault.secrets (name, secret)
--   VALUES ('service_role_key', 'your-actual-service-role-key-here');
--
-- To find your service_role key:
--   Supabase Dashboard > Settings > API > service_role (secret)
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
  project_url   TEXT := 'https://xuzvqcpthqikyroqhypw.supabase.co';
  temp_pass     TEXT;
  request_id    BIGINT;
  v_user_id     UUID;
  v_caller_role lite_role;
BEGIN
  -- Load service_role key from Supabase Vault
  SELECT decrypted_secret INTO service_key
  FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;

  IF service_key IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'service_role_key not configured in vault.secrets. Run: INSERT INTO vault.secrets (name, secret) VALUES (''service_role_key'', ''your-key'');'
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
      v_caller_role := 'enterprise_admin'; -- treat POS owner as enterprise admin
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

  RETURN jsonb_build_object(
    'success', true,
    'temp_password', temp_pass,
    'message', 'Account created for ' || invite_email
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Helper: RPC to delete a Lite team member
-- ============================================================================
CREATE OR REPLACE FUNCTION delete_lite_user(p_profile_id UUID)
RETURNS VOID AS $$
BEGIN
  -- Must be location_admin+ for that location, or enterprise_admin
  IF NOT EXISTS (
    SELECT 1 FROM lite_profiles caller
    WHERE caller.user_id = auth.uid()
      AND (
        caller.role = 'enterprise_admin'
        OR (caller.role = 'location_admin' AND caller.location_id = (
          SELECT location_id FROM lite_profiles WHERE id = p_profile_id
        ))
      )
  ) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  -- Deactivate rather than hard-delete to preserve audit trail
  UPDATE lite_profiles SET is_active = FALSE, updated_at = now()
  WHERE id = p_profile_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
