-- ============================================================
-- MULTI-LOCATION: Schema changes + RPC functions
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- ============================================================

-- 1. Add slug and region columns to locations table
ALTER TABLE locations ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS region TEXT;

-- Backfill existing locations with slugs generated from their name
UPDATE locations
SET slug = lower(regexp_replace(trim(name), '[^a-zA-Z0-9]+', '-', 'g'))
WHERE slug IS NULL;

-- ============================================================
-- 2. create_location: Creates a new location row
--    Only owners can call. Returns the new location info.
--    Sets data to {"_initialized": true} so the app doesn't
--    auto-populate it with demo data.
-- ============================================================
CREATE OR REPLACE FUNCTION create_location(p_name TEXT, p_region TEXT DEFAULT '')
RETURNS JSONB AS $$
DECLARE
  new_loc_id UUID;
  loc_slug TEXT;
  slug_candidate TEXT;
  slug_suffix INT := 0;
BEGIN
  -- Only owners/enterprise admins can create locations
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'enterprise_admin')) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Only owners can create locations');
  END IF;

  -- Generate slug from name
  loc_slug := lower(regexp_replace(trim(p_name), '[^a-zA-Z0-9]+', '-', 'g'));
  loc_slug := trim(BOTH '-' FROM loc_slug);

  -- Handle slug uniqueness: append -2, -3, etc. if collision
  slug_candidate := loc_slug;
  WHILE EXISTS (SELECT 1 FROM locations WHERE slug = slug_candidate) LOOP
    slug_suffix := slug_suffix + 1;
    slug_candidate := loc_slug || '-' || slug_suffix;
  END LOOP;
  loc_slug := slug_candidate;

  -- Insert the new location (empty but marked as initialized)
  INSERT INTO locations (name, slug, region, data)
  VALUES (trim(p_name), loc_slug, trim(p_region), '{"_initialized": true}'::jsonb)
  RETURNING id INTO new_loc_id;

  RETURN jsonb_build_object(
    'success', true,
    'location_id', new_loc_id,
    'name', trim(p_name),
    'slug', loc_slug,
    'region', trim(p_region)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- 3. list_locations: Returns all locations for owners,
--    or just the user's assigned location for others.
-- ============================================================
CREATE OR REPLACE FUNCTION list_locations()
RETURNS JSONB AS $$
DECLARE
  user_role TEXT;
BEGIN
  SELECT role INTO user_role FROM profiles WHERE id = auth.uid();

  IF user_role IN ('owner', 'enterprise_admin') THEN
    -- Owners see all locations
    RETURN (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'id', id,
          'name', name,
          'slug', COALESCE(slug, lower(regexp_replace(trim(name), '[^a-zA-Z0-9]+', '-', 'g'))),
          'region', COALESCE(region, ''),
          'created_at', created_at
        ) ORDER BY created_at
      ), '[]'::jsonb)
      FROM locations
    );
  ELSE
    -- Non-owners see only their assigned location
    RETURN (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'id', l.id,
          'name', l.name,
          'slug', COALESCE(l.slug, lower(regexp_replace(trim(l.name), '[^a-zA-Z0-9]+', '-', 'g'))),
          'region', COALESCE(l.region, ''),
          'created_at', l.created_at
        )
      ), '[]'::jsonb)
      FROM locations l
      INNER JOIN profiles p ON p.location_id = l.id
      WHERE p.id = auth.uid()
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- 4. switch_location: Updates the caller's profile to point
--    to a different location. Only owners can switch.
-- ============================================================
CREATE OR REPLACE FUNCTION switch_location(p_location_id UUID)
RETURNS JSONB AS $$
BEGIN
  -- Only owners/enterprise admins can switch locations
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'enterprise_admin')) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Only owners can switch locations');
  END IF;

  -- Verify location exists
  IF NOT EXISTS (SELECT 1 FROM locations WHERE id = p_location_id) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Location not found');
  END IF;

  -- Update the user's active location
  UPDATE profiles
  SET location_id = p_location_id
  WHERE id = auth.uid();

  RETURN jsonb_build_object('success', true, 'location_id', p_location_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- 5. Update profiles role CHECK constraint to allow enterprise_admin
-- ============================================================
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('owner', 'manager', 'staff', 'enterprise_admin'));


-- ============================================================
-- 6. get_locations_ops_data: Returns ops-relevant data for ALL
--    locations. Used by Enterprise Operations Oversight page.
--    Only owners/enterprise_admins can call.
-- ============================================================
CREATE OR REPLACE FUNCTION get_locations_ops_data()
RETURNS JSONB AS $$
BEGIN
  -- Only owners/enterprise admins
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'enterprise_admin')) THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', id,
      'name', name,
      'dailyOps', COALESCE(data->'dailyOps', '[]'::jsonb),
      'eodEntries', COALESCE(data->'eodEntries', '[]'::jsonb),
      'rooms', COALESCE(data->'rooms', '{}'::jsonb),
      'reservations', COALESCE(data->'reservations', '[]'::jsonb),
      'openingTemplate', data->'openingTemplate',
      'feTemplate', data->'feTemplate',
      'beTemplate', data->'beTemplate',
      'closingTemplate', data->'closingTemplate'
    )), '[]'::jsonb)
    FROM locations
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- 7. list_enterprise_users: Returns all profiles for user mgmt.
--    Owner/enterprise_admin only.
-- ============================================================
CREATE OR REPLACE FUNCTION list_enterprise_users()
RETURNS JSONB AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'enterprise_admin')) THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', p.id,
      'email', p.email,
      'full_name', p.full_name,
      'role', p.role,
      'location_id', p.location_id,
      'location_name', COALESCE(l.name, ''),
      'created_at', p.created_at
    ) ORDER BY p.created_at), '[]'::jsonb)
    FROM profiles p
    LEFT JOIN locations l ON l.id = p.location_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- 8. set_enterprise_admin: Promote/demote a user to/from
--    enterprise_admin. Owner-only operation.
-- ============================================================
CREATE OR REPLACE FUNCTION set_enterprise_admin(p_user_id UUID, p_is_admin BOOLEAN)
RETURNS JSONB AS $$
DECLARE
  target_role TEXT;
BEGIN
  -- Only owners can promote/demote
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner') THEN
    RETURN jsonb_build_object('success', false, 'message', 'Only owners can manage enterprise admins');
  END IF;

  -- Cannot change own role
  IF p_user_id = auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'message', 'Cannot change your own role');
  END IF;

  -- Cannot demote another owner
  SELECT role INTO target_role FROM profiles WHERE id = p_user_id;
  IF target_role = 'owner' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Cannot change another owner role');
  END IF;

  IF p_is_admin THEN
    UPDATE profiles SET role = 'enterprise_admin' WHERE id = p_user_id;
  ELSE
    UPDATE profiles SET role = 'manager' WHERE id = p_user_id;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- 9. get_public_booking_data: Returns public-safe location data
--    for the self-booking page. NO AUTH REQUIRED.
--    Only exposes room counts, pricing, availability — no PII.
-- ============================================================
CREATE OR REPLACE FUNCTION get_public_booking_data(p_slug TEXT)
RETURNS JSONB AS $$
DECLARE
  loc RECORD;
  res_data JSONB;
BEGIN
  -- Find location by slug
  SELECT id, name, slug, region, data INTO loc
  FROM locations
  WHERE slug = p_slug
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Location not found');
  END IF;

  -- Build sanitized reservations (dates + room types only, no PII)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'type', r->>'type',
    'roomType', r->>'roomType',
    'checkIn', r->>'checkIn',
    'checkOut', r->>'checkOut',
    'status', r->>'status'
  )), '[]'::jsonb) INTO res_data
  FROM jsonb_array_elements(COALESCE(loc.data->'reservations', '[]'::jsonb)) r
  WHERE r->>'status' NOT IN ('cancelled', 'checked-out');

  RETURN jsonb_build_object(
    'success', true,
    'location_name', loc.name,
    'location_slug', COALESCE(loc.slug, ''),
    'region', COALESCE(loc.region, ''),
    'resortInfo', COALESCE(loc.data->'resortInfo', '{}'::jsonb),
    'rooms', COALESCE(loc.data->'rooms', '{}'::jsonb),
    'pricing', COALESCE(loc.data->'pricing', '{}'::jsonb),
    'closedDates', COALESCE(loc.data->'closedDates', '[]'::jsonb),
    'reservations', res_data
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- 10. submit_online_booking: Appends a booking request to the
--     location's data.onlineBookings array. NO AUTH REQUIRED.
-- ============================================================
CREATE OR REPLACE FUNCTION submit_online_booking(p_slug TEXT, p_booking JSONB)
RETURNS JSONB AS $$
DECLARE
  loc_id UUID;
  booking_id TEXT;
  enriched JSONB;
  existing JSONB;
BEGIN
  -- Find location
  SELECT id INTO loc_id FROM locations WHERE slug = p_slug LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Location not found');
  END IF;

  -- Generate booking ID and enrich
  booking_id := 'ob_' || substr(md5(random()::text), 1, 12);
  enriched := p_booking || jsonb_build_object(
    'id', booking_id,
    'submittedAt', now()::text,
    'status', 'pending'
  );

  -- Get existing onlineBookings array (or empty)
  SELECT COALESCE(data->'onlineBookings', '[]'::jsonb) INTO existing
  FROM locations WHERE id = loc_id;

  -- Append new booking
  UPDATE locations
  SET data = jsonb_set(
    COALESCE(data, '{}'::jsonb),
    '{onlineBookings}',
    existing || jsonb_build_array(enriched)
  )
  WHERE id = loc_id;

  RETURN jsonb_build_object('success', true, 'bookingId', booking_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
