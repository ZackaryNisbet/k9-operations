-- ============================================================
-- TEAM MANAGEMENT: RLS Policies + Invitation Claiming
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- ============================================================
-- Updated March 2026: claim_invitation now reads from the normalized
-- location_pending_invites table (post-backend-overhaul).
-- ============================================================

-- 1. Allow users to INSERT their own profile (auto-creation on sign-up)
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- 2. Allow users to view all profiles in their same location (team list)
CREATE POLICY "Users can view team profiles"
  ON profiles FOR SELECT
  USING (
    location_id IS NOT NULL
    AND location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid())
  );

-- 3. Allow owners to update any profile in their location (role changes, removal)
CREATE POLICY "Owners can update team profiles"
  ON profiles FOR UPDATE
  USING (
    auth.uid() != id
    AND location_id IS NOT NULL
    AND location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner')
  );

-- 4. RPC function: when a new user signs up, check the location_pending_invites
--    table for a matching invitation and auto-assign them to that location.
--    Runs as SECURITY DEFINER so it can bypass RLS to search all invitations.
CREATE OR REPLACE FUNCTION claim_invitation(user_email TEXT)
RETURNS JSONB AS $$
DECLARE
  inv RECORD;
  assigned_role TEXT;
BEGIN
  -- Find the first matching pending invite across all locations
  SELECT * INTO inv
  FROM location_pending_invites
  WHERE lower(email) = lower(user_email)
  ORDER BY created_at ASC
  LIMIT 1;

  -- No matching invitation found
  IF inv IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'No invitation found for this email');
  END IF;

  -- Translate role IDs: role_owner->owner, role_manager->manager, role_staff->staff
  assigned_role := CASE
    WHEN inv.role LIKE 'role_%' THEN replace(inv.role, 'role_', '')
    ELSE COALESCE(inv.role, 'staff')
  END;

  -- Update the user's profile with the location and role from the invitation
  UPDATE profiles
  SET location_id = inv.location_id,
      role = assigned_role,
      full_name = COALESCE(NULLIF(inv.name, ''), full_name)
  WHERE id = auth.uid();

  -- Delete the claimed invitation
  DELETE FROM location_pending_invites WHERE id = inv.id;

  RETURN jsonb_build_object(
    'success', true,
    'location_id', inv.location_id,
    'role', assigned_role
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
