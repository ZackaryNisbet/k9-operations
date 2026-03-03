-- ============================================================
-- Fix: Online Booking RPCs broken after backend normalization
-- The locations.data JSONB column no longer exists.
-- These RPCs now query normalized tables instead.
-- ============================================================

-- 1. Create online_bookings table (was previously in locations.data->'onlineBookings')
CREATE TABLE IF NOT EXISTS online_bookings (
  id TEXT PRIMARY KEY DEFAULT 'ob_' || substr(md5(random()::text), 1, 12),
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  processed_by UUID,
  decline_reason TEXT,
  -- Booking data
  reservation_type TEXT,       -- 'boarding', 'daycare', 'tour', 'evaluation', 'day-boarding'
  check_in DATE,
  check_out DATE,
  room_type TEXT,
  tour_time TEXT,
  daycare_size TEXT,           -- 'small', 'large'
  -- Client info (denormalized for display before acceptance)
  client_first_name TEXT,
  client_last_name TEXT,
  client_phone TEXT,
  client_email TEXT,
  emergency_contact TEXT,
  emergency_phone TEXT,
  -- Dog info
  dog_name TEXT,
  dog_breed TEXT,
  dog_weight TEXT,
  dog_sex TEXT,
  dog_spayed_neutered TEXT,
  dog_dob TEXT,
  dog_bath_type TEXT,
  -- Additional data
  notes TEXT,
  add_ons JSONB DEFAULT '[]'::jsonb,
  raw_booking JSONB,           -- Full original booking payload for backwards compat
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for online_bookings
ALTER TABLE online_bookings ENABLE ROW LEVEL SECURITY;

-- Staff can view/manage bookings for their location
CREATE POLICY "Staff can view location bookings" ON online_bookings
  FOR SELECT USING (check_location_access(location_id));

CREATE POLICY "Staff can update location bookings" ON online_bookings
  FOR UPDATE USING (check_location_access(location_id));

CREATE POLICY "Staff can delete location bookings" ON online_bookings
  FOR DELETE USING (check_location_access(location_id));

-- Public can insert bookings (no auth required for customer portal)
CREATE POLICY "Anyone can submit bookings" ON online_bookings
  FOR INSERT WITH CHECK (true);


-- ============================================================
-- 2. Rewrite get_public_booking_data to use normalized tables
-- ============================================================
CREATE OR REPLACE FUNCTION get_public_booking_data(p_slug TEXT)
RETURNS JSONB AS $$
DECLARE
  loc_id UUID;
  loc_name TEXT;
  loc_region TEXT;
  resort_info_data JSONB;
  rooms_data JSONB;
  pricing_data JSONB;
  closed_dates_data JSONB;
  reservations_data JSONB;
  packages_data JSONB;
BEGIN
  -- Find location by slug
  SELECT id, name, COALESCE(region, '') INTO loc_id, loc_name, loc_region
  FROM locations
  WHERE slug = p_slug
  LIMIT 1;

  IF loc_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Location not found');
  END IF;

  -- Resort info from location_resort_info
  SELECT COALESCE(info, '{}'::jsonb) INTO resort_info_data
  FROM location_resort_info WHERE location_id = loc_id;
  IF resort_info_data IS NULL THEN resort_info_data := '{}'::jsonb; END IF;

  -- Rooms: build {types: [...], units: [...]} from location_room_types + location_room_units
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', rt.id, 'name', rt.name, 'sortOrder', rt.sort_order
  ) ORDER BY rt.sort_order), '[]'::jsonb) INTO rooms_data
  FROM location_room_types rt WHERE rt.location_id = loc_id;

  -- Build rooms object with types and unit counts
  rooms_data := jsonb_build_object(
    'types', rooms_data,
    'unitCounts', (
      SELECT COALESCE(jsonb_object_agg(rt.id::text, (
        SELECT count(*) FROM location_room_units ru WHERE ru.room_type_id = rt.id
      )), '{}'::jsonb)
      FROM location_room_types rt WHERE rt.location_id = loc_id
    )
  );

  -- Pricing from location_pricing (only current = effective_to IS NULL)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'category', p.category,
    'subCategory', p.sub_category,
    'price', p.price,
    'effectiveFrom', p.effective_from
  )), '[]'::jsonb) INTO pricing_data
  FROM location_pricing p
  WHERE p.location_id = loc_id AND p.effective_to IS NULL;

  -- Closed dates from location_closed_dates
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'date', cd.closed_date,
    'reason', cd.reason
  )), '[]'::jsonb) INTO closed_dates_data
  FROM location_closed_dates cd WHERE cd.location_id = loc_id;

  -- Reservations (sanitized — dates + room types only, no PII)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'type', r.reservation_type,
    'roomType', r.room_type,
    'checkIn', r.check_in_date,
    'checkOut', r.check_out_date,
    'status', r.status,
    'daycareSize', r.daycare_size
  )), '[]'::jsonb) INTO reservations_data
  FROM k9_reservations r
  WHERE r.location_id = loc_id
    AND r.status NOT IN ('cancelled', 'checked-out', 'no-show');

  -- Packages from enterprise_packages (available to all locations)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', ep.id, 'name', ep.name, 'type', ep.type,
    'sessions', ep.sessions, 'price', ep.price,
    'validDays', ep.valid_days, 'isActive', ep.is_active
  )), '[]'::jsonb) INTO packages_data
  FROM enterprise_packages ep WHERE ep.is_active = true;

  RETURN jsonb_build_object(
    'success', true,
    'location_name', loc_name,
    'location_slug', p_slug,
    'region', loc_region,
    'resortInfo', resort_info_data,
    'rooms', rooms_data,
    'pricing', pricing_data,
    'closedDates', closed_dates_data,
    'reservations', reservations_data,
    'packages', packages_data,
    'settings', jsonb_build_object(
      'tourSettings', jsonb_build_object('allowConcurrent', false, 'duration', 30, 'startTime', '09:00', 'endTime', '16:30'),
      'daycareCapacity', jsonb_build_object('small', 15, 'large', 20, 'total', 35)
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- 3. Rewrite submit_online_booking to use new online_bookings table
-- ============================================================
CREATE OR REPLACE FUNCTION submit_online_booking(p_slug TEXT, p_booking JSONB)
RETURNS JSONB AS $$
DECLARE
  loc_id UUID;
  booking_id TEXT;
BEGIN
  -- Find location
  SELECT id INTO loc_id FROM locations WHERE slug = p_slug LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Location not found');
  END IF;

  -- Generate booking ID
  booking_id := 'ob_' || substr(md5(random()::text), 1, 12);

  -- Insert into online_bookings table
  INSERT INTO online_bookings (
    id, location_id, status,
    reservation_type, check_in, check_out, room_type, tour_time, daycare_size,
    client_first_name, client_last_name, client_phone, client_email,
    emergency_contact, emergency_phone,
    dog_name, dog_breed, dog_weight, dog_sex, dog_spayed_neutered, dog_dob, dog_bath_type,
    notes, add_ons, raw_booking
  ) VALUES (
    booking_id, loc_id, 'pending',
    p_booking->>'type',
    (p_booking->>'checkIn')::date,
    (p_booking->>'checkOut')::date,
    p_booking->>'roomType',
    p_booking->>'tourTime',
    p_booking->>'daycareSize',
    p_booking->'client'->>'firstName',
    p_booking->'client'->>'lastName',
    p_booking->'client'->>'phone',
    p_booking->'client'->>'email',
    p_booking->'client'->>'emergencyContact',
    p_booking->'client'->>'emergencyPhone',
    p_booking->'dog'->>'name',
    p_booking->'dog'->>'breed',
    p_booking->'dog'->>'weight',
    p_booking->'dog'->>'sex',
    p_booking->'dog'->>'spayedNeutered',
    p_booking->'dog'->>'dob',
    p_booking->'dog'->>'bathType',
    p_booking->>'notes',
    COALESCE(p_booking->'addOns', '[]'::jsonb),
    p_booking
  );

  RETURN jsonb_build_object('success', true, 'bookingId', booking_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
