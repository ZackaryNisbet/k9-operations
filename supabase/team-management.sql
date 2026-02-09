-- ============================================================
-- TEAM MANAGEMENT: RLS Policies + Invitation Claiming
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)
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

-- 4. RPC function: when a new user signs up, check all locations for a
--    matching pending invitation (stored in locations.data->'pendingInvites')
--    and auto-assign them to that location with the invited role.
--    Runs as SECURITY DEFINER so it can bypass RLS to search all locations.
CREATE OR REPLACE FUNCTION claim_invitation(user_email TEXT)
RETURNS JSONB AS $$
DECLARE
  loc RECORD;
  invites JSONB;
  invite JSONB;
  new_invites JSONB;
  i INT;
BEGIN
  -- Search all locations for a pending invite matching this email
  FOR loc IN SELECT id, data FROM locations LOOP
    invites := loc.data->'pendingInvites';
    IF invites IS NOT NULL AND jsonb_typeof(invites) = 'array' AND jsonb_array_length(invites) > 0 THEN
      FOR i IN 0..jsonb_array_length(invites)-1 LOOP
        invite := invites->i;
        IF lower(invite->>'email') = lower(user_email) THEN
          -- Found a matching invitation! Update the user's profile
          -- Translate role IDs: role_owner->owner, role_manager->manager, role_staff->staff
          UPDATE profiles
          SET location_id = loc.id,
              role = CASE
                WHEN invite->>'role' LIKE 'role_%' THEN replace(invite->>'role', 'role_', '')
                ELSE COALESCE(invite->>'role', 'staff')
              END
          WHERE id = auth.uid();

          -- Remove the claimed invite from the array
          new_invites := '[]'::jsonb;
          FOR i IN 0..jsonb_array_length(invites)-1 LOOP
            IF lower((invites->i)->>'email') != lower(user_email) THEN
              new_invites := new_invites || (invites->i);
            END IF;
          END LOOP;

          UPDATE locations
          SET data = jsonb_set(loc.data, '{pendingInvites}', new_invites)
          WHERE id = loc.id;

          RETURN jsonb_build_object('success', true, 'location_id', loc.id, 'role',
            CASE
              WHEN invite->>'role' LIKE 'role_%' THEN replace(invite->>'role', 'role_', '')
              ELSE COALESCE(invite->>'role', 'staff')
            END);
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  -- No matching invitation found
  RETURN jsonb_build_object('success', false, 'message', 'No invitation found for this email');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
