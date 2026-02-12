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
    'status', r->>'status',
    'tourTime', r->>'tourTime',
    'daycareSize', r->>'daycareSize'
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
    'reservations', res_data,
    'packages', COALESCE(loc.data->'packages', '[]'::jsonb),
    'settings', jsonb_build_object(
      'tourSettings', COALESCE(loc.data->'settings'->'tourSettings', '{"allowConcurrent": false, "duration": 30}'::jsonb),
      'daycareCapacity', COALESCE(loc.data->'settings'->'daycareCapacity', '{"small": 15, "large": 20, "total": 35}'::jsonb)
    )
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


-- ============================================================
-- 11. delete_location: Safely deletes a location and all
--     associated data. Owner-only. Cannot delete your current
--     active location.
-- ============================================================
CREATE OR REPLACE FUNCTION delete_location(p_location_id UUID)
RETURNS JSONB AS $$
DECLARE
  user_loc UUID;
  loc_name TEXT;
BEGIN
  -- Only owners can delete locations
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'enterprise_admin')) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Only owners can delete locations');
  END IF;

  -- Get the user's current active location
  SELECT location_id INTO user_loc FROM profiles WHERE id = auth.uid();

  -- Cannot delete your currently active location
  IF user_loc = p_location_id THEN
    RETURN jsonb_build_object('success', false, 'message', 'Cannot delete your currently active location. Switch to another location first.');
  END IF;

  -- Verify location exists
  SELECT name INTO loc_name FROM locations WHERE id = p_location_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Location not found');
  END IF;

  -- Reassign any users on this location to the caller's location
  UPDATE profiles SET location_id = user_loc WHERE location_id = p_location_id;

  -- Delete the location (cascades to location_data if FK exists)
  DELETE FROM locations WHERE id = p_location_id;

  RETURN jsonb_build_object('success', true, 'name', loc_name);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- 12. booking_drafts table for real-time field capture
-- ============================================================
CREATE TABLE IF NOT EXISTS booking_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_slug TEXT NOT NULL,
  session_id TEXT NOT NULL,
  service_type TEXT,
  current_step TEXT,
  completion_pct INT DEFAULT 0,
  step_timeline JSONB DEFAULT '[]'::jsonb,
  client_data JSONB DEFAULT '{}'::jsonb,
  dog_data JSONB DEFAULT '{}'::jsonb,
  booking_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Allow public access for unauthenticated booking page users
ALTER TABLE booking_drafts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public insert on booking_drafts" ON booking_drafts;
CREATE POLICY "Allow public insert on booking_drafts" ON booking_drafts FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public update on booking_drafts" ON booking_drafts;
CREATE POLICY "Allow public update on booking_drafts" ON booking_drafts FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Allow authenticated read on booking_drafts" ON booking_drafts;
CREATE POLICY "Allow authenticated read on booking_drafts" ON booking_drafts FOR SELECT USING (auth.role() = 'authenticated');

-- Upsert RPC (no auth required)
CREATE OR REPLACE FUNCTION upsert_booking_draft(p_draft JSONB)
RETURNS JSONB AS $$
BEGIN
  INSERT INTO booking_drafts (session_id, location_slug, service_type, current_step, completion_pct, step_timeline, client_data, dog_data, booking_data, updated_at)
  VALUES (
    p_draft->>'session_id',
    p_draft->>'location_slug',
    p_draft->>'service_type',
    p_draft->>'current_step',
    COALESCE((p_draft->>'completion_pct')::int, 0),
    COALESCE(p_draft->'step_timeline', '[]'::jsonb),
    COALESCE(p_draft->'client_data', '{}'::jsonb),
    COALESCE(p_draft->'dog_data', '{}'::jsonb),
    COALESCE(p_draft->'booking_data', '{}'::jsonb),
    now()
  )
  ON CONFLICT (session_id) DO UPDATE SET
    service_type = EXCLUDED.service_type,
    current_step = EXCLUDED.current_step,
    completion_pct = EXCLUDED.completion_pct,
    step_timeline = EXCLUDED.step_timeline,
    client_data = EXCLUDED.client_data,
    dog_data = EXCLUDED.dog_data,
    booking_data = EXCLUDED.booking_data,
    updated_at = now();

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create unique index on session_id for upsert
CREATE UNIQUE INDEX IF NOT EXISTS booking_drafts_session_id_idx ON booking_drafts (session_id);

-- 13. get_booking_drafts: Retrieves drafts for a location (auth required)
CREATE OR REPLACE FUNCTION get_booking_drafts(p_location_slug TEXT)
RETURNS JSONB AS $$
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(d)::jsonb ORDER BY d.updated_at DESC)
    FROM booking_drafts d
    WHERE d.location_slug = p_location_slug
      AND d.updated_at > now() - interval '30 days'
  ), '[]'::jsonb);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- 14. phone_otps table for SMS OTP verification
-- ============================================================
CREATE TABLE IF NOT EXISTS phone_otps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL,
  code VARCHAR(6) NOT NULL,
  attempts INT DEFAULT 0,
  verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '10 minutes')
);

-- Allow public access for unauthenticated booking page users
ALTER TABLE phone_otps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public insert on phone_otps" ON phone_otps;
CREATE POLICY "Allow public insert on phone_otps" ON phone_otps FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public update on phone_otps" ON phone_otps;
CREATE POLICY "Allow public update on phone_otps" ON phone_otps FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Allow public select on phone_otps" ON phone_otps;
CREATE POLICY "Allow public select on phone_otps" ON phone_otps FOR SELECT USING (true);


-- ============================================================
-- 15. verify_otp_and_get_customer: Verifies an OTP code,
--     then returns the customer's portal data if valid.
--     NO AUTH REQUIRED (public booking page).
-- ============================================================
CREATE OR REPLACE FUNCTION verify_otp_and_get_customer(p_phone TEXT, p_code TEXT, p_slug TEXT)
RETURNS JSONB AS $$
DECLARE
  otp_record RECORD;
  loc RECORD;
  client_record JSONB;
  dogs_data JSONB;
  res_data JSONB;
  payment_data JSONB;
  package_data JSONB;
  vaccine_data JSONB;
  clean_phone TEXT;
BEGIN
  -- Normalize phone: strip non-digits
  clean_phone := regexp_replace(p_phone, '[^0-9]', '', 'g');
  IF length(clean_phone) = 11 AND left(clean_phone, 1) = '1' THEN
    clean_phone := right(clean_phone, 10);
  END IF;

  -- Find the most recent unexpired, unverified OTP for this phone
  SELECT * INTO otp_record
  FROM phone_otps
  WHERE regexp_replace(phone, '[^0-9]', '', 'g') LIKE '%' || clean_phone
    AND verified = false
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'No pending verification found. Please request a new code.');
  END IF;

  -- Check attempts
  IF otp_record.attempts >= 3 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Too many attempts. Please request a new code.');
  END IF;

  -- Increment attempts
  UPDATE phone_otps SET attempts = attempts + 1 WHERE id = otp_record.id;

  -- Check code
  IF otp_record.code != p_code THEN
    RETURN jsonb_build_object('success', false, 'message', 'Invalid code. Please try again.');
  END IF;

  -- Mark as verified
  UPDATE phone_otps SET verified = true WHERE id = otp_record.id;

  -- Now load customer portal data
  -- Find location
  SELECT id, data INTO loc FROM locations WHERE slug = p_slug LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Location not found');
  END IF;

  -- Find client by phone in reservations
  SELECT jsonb_build_object(
    'firstName', r->>'firstName',
    'lastName', r->>'lastName',
    'email', r->>'email',
    'phone', r->>'phone',
    'address', r->>'address',
    'emergencyContact', r->>'emergencyContact',
    'emergencyPhone', r->>'emergencyPhone',
    'vetName', r->>'vetName',
    'vetPhone', r->>'vetPhone'
  ) INTO client_record
  FROM jsonb_array_elements(COALESCE(loc.data->'reservations', '[]'::jsonb)) r
  WHERE regexp_replace(r->>'phone', '[^0-9]', '', 'g') LIKE '%' || clean_phone
  ORDER BY r->>'checkIn' DESC
  LIMIT 1;

  IF client_record IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'No account found for this phone number.');
  END IF;

  -- Gather dogs (unique by name from reservations)
  SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
    'name', r->>'dogName',
    'breed', r->>'dogBreed',
    'weight', r->>'dogWeight',
    'sex', r->>'dogSex',
    'spayedNeutered', r->>'dogSpayedNeutered',
    'dob', r->>'dogDob'
  )), '[]'::jsonb) INTO dogs_data
  FROM jsonb_array_elements(COALESCE(loc.data->'reservations', '[]'::jsonb)) r
  WHERE regexp_replace(r->>'phone', '[^0-9]', '', 'g') LIKE '%' || clean_phone
    AND r->>'dogName' IS NOT NULL AND r->>'dogName' != '';

  -- Gather reservations for this client
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'type', r->>'type',
    'roomType', r->>'roomType',
    'checkIn', r->>'checkIn',
    'checkOut', r->>'checkOut',
    'status', r->>'status',
    'dogName', r->>'dogName',
    'tourDate', r->>'tourDate',
    'tourTime', r->>'tourTime'
  ) ORDER BY r->>'checkIn' DESC), '[]'::jsonb) INTO res_data
  FROM jsonb_array_elements(COALESCE(loc.data->'reservations', '[]'::jsonb)) r
  WHERE regexp_replace(r->>'phone', '[^0-9]', '', 'g') LIKE '%' || clean_phone;

  -- Payments (from eodEntries that match this client)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'date', e->>'date',
    'type', p->>'type',
    'amount', p->>'amount',
    'nights', p->>'nights',
    'status', COALESCE(p->>'status', 'paid'),
    'items', p->'items'
  ) ORDER BY e->>'date' DESC), '[]'::jsonb) INTO payment_data
  FROM jsonb_array_elements(COALESCE(loc.data->'eodEntries', '[]'::jsonb)) e,
       jsonb_array_elements(COALESCE(e->'payments', '[]'::jsonb)) p
  WHERE regexp_replace(p->>'clientPhone', '[^0-9]', '', 'g') LIKE '%' || clean_phone
     OR p->>'clientName' = (client_record->>'firstName') || ' ' || (client_record->>'lastName');

  -- Packages
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'name', pk->>'name',
    'total', pk->>'total',
    'remaining', pk->>'remaining',
    'type', pk->>'type'
  )), '[]'::jsonb) INTO package_data
  FROM jsonb_array_elements(COALESCE(loc.data->'packages', '[]'::jsonb)) pk
  WHERE pk->>'clientPhone' LIKE '%' || clean_phone
     OR pk->>'clientName' = (client_record->>'firstName') || ' ' || (client_record->>'lastName');

  -- Vaccines (from reservation dog data)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'dogName', r->>'dogName',
    'name', v->>'name',
    'expirationDate', v->>'expirationDate'
  )), '[]'::jsonb) INTO vaccine_data
  FROM jsonb_array_elements(COALESCE(loc.data->'reservations', '[]'::jsonb)) r,
       jsonb_array_elements(COALESCE(r->'vaccines', '[]'::jsonb)) v
  WHERE regexp_replace(r->>'phone', '[^0-9]', '', 'g') LIKE '%' || clean_phone;

  RETURN jsonb_build_object(
    'success', true,
    'client', client_record,
    'dogs', dogs_data,
    'reservations', res_data,
    'payments', payment_data,
    'packages', package_data,
    'vaccines', vaccine_data
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- 16. get_customer_portal_data: Returns customer data by phone
--     without OTP verification (dev fallback / direct lookup).
--     NO AUTH REQUIRED.
-- ============================================================
CREATE OR REPLACE FUNCTION get_customer_portal_data(p_phone TEXT, p_slug TEXT)
RETURNS JSONB AS $$
DECLARE
  loc RECORD;
  client_record JSONB;
  dogs_data JSONB;
  res_data JSONB;
  payment_data JSONB;
  package_data JSONB;
  vaccine_data JSONB;
  clean_phone TEXT;
BEGIN
  clean_phone := regexp_replace(p_phone, '[^0-9]', '', 'g');
  IF length(clean_phone) = 11 AND left(clean_phone, 1) = '1' THEN
    clean_phone := right(clean_phone, 10);
  END IF;

  SELECT id, data INTO loc FROM locations WHERE slug = p_slug LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Location not found');
  END IF;

  -- Find client by phone
  SELECT jsonb_build_object(
    'firstName', r->>'firstName',
    'lastName', r->>'lastName',
    'email', r->>'email',
    'phone', r->>'phone',
    'address', r->>'address',
    'emergencyContact', r->>'emergencyContact',
    'emergencyPhone', r->>'emergencyPhone',
    'vetName', r->>'vetName',
    'vetPhone', r->>'vetPhone'
  ) INTO client_record
  FROM jsonb_array_elements(COALESCE(loc.data->'reservations', '[]'::jsonb)) r
  WHERE regexp_replace(r->>'phone', '[^0-9]', '', 'g') LIKE '%' || clean_phone
  ORDER BY r->>'checkIn' DESC
  LIMIT 1;

  IF client_record IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'No account found for this phone number.');
  END IF;

  -- Dogs
  SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
    'name', r->>'dogName',
    'breed', r->>'dogBreed',
    'weight', r->>'dogWeight',
    'sex', r->>'dogSex',
    'spayedNeutered', r->>'dogSpayedNeutered',
    'dob', r->>'dogDob'
  )), '[]'::jsonb) INTO dogs_data
  FROM jsonb_array_elements(COALESCE(loc.data->'reservations', '[]'::jsonb)) r
  WHERE regexp_replace(r->>'phone', '[^0-9]', '', 'g') LIKE '%' || clean_phone
    AND r->>'dogName' IS NOT NULL AND r->>'dogName' != '';

  -- Reservations
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'type', r->>'type',
    'roomType', r->>'roomType',
    'checkIn', r->>'checkIn',
    'checkOut', r->>'checkOut',
    'status', r->>'status',
    'dogName', r->>'dogName',
    'tourDate', r->>'tourDate',
    'tourTime', r->>'tourTime'
  ) ORDER BY r->>'checkIn' DESC), '[]'::jsonb) INTO res_data
  FROM jsonb_array_elements(COALESCE(loc.data->'reservations', '[]'::jsonb)) r
  WHERE regexp_replace(r->>'phone', '[^0-9]', '', 'g') LIKE '%' || clean_phone;

  -- Payments
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'date', e->>'date',
    'type', p->>'type',
    'amount', p->>'amount',
    'nights', p->>'nights',
    'status', COALESCE(p->>'status', 'paid'),
    'items', p->'items'
  ) ORDER BY e->>'date' DESC), '[]'::jsonb) INTO payment_data
  FROM jsonb_array_elements(COALESCE(loc.data->'eodEntries', '[]'::jsonb)) e,
       jsonb_array_elements(COALESCE(e->'payments', '[]'::jsonb)) p
  WHERE regexp_replace(p->>'clientPhone', '[^0-9]', '', 'g') LIKE '%' || clean_phone
     OR p->>'clientName' = (client_record->>'firstName') || ' ' || (client_record->>'lastName');

  -- Packages
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'name', pk->>'name',
    'total', pk->>'total',
    'remaining', pk->>'remaining',
    'type', pk->>'type'
  )), '[]'::jsonb) INTO package_data
  FROM jsonb_array_elements(COALESCE(loc.data->'packages', '[]'::jsonb)) pk
  WHERE pk->>'clientPhone' LIKE '%' || clean_phone
     OR pk->>'clientName' = (client_record->>'firstName') || ' ' || (client_record->>'lastName');

  -- Vaccines
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'dogName', r->>'dogName',
    'name', v->>'name',
    'expirationDate', v->>'expirationDate'
  )), '[]'::jsonb) INTO vaccine_data
  FROM jsonb_array_elements(COALESCE(loc.data->'reservations', '[]'::jsonb)) r,
       jsonb_array_elements(COALESCE(r->'vaccines', '[]'::jsonb)) v
  WHERE regexp_replace(r->>'phone', '[^0-9]', '', 'g') LIKE '%' || clean_phone;

  RETURN jsonb_build_object(
    'success', true,
    'client', client_record,
    'dogs', dogs_data,
    'reservations', res_data,
    'payments', payment_data,
    'packages', package_data,
    'vaccines', vaccine_data
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
