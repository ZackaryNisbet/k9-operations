-- © 2026 K9 Operations LLC. All Rights Reserved.
-- Normalized Database Schema for K9 Operations
--
-- 12 tables for transactional data + locations.data for settings/config.
-- Run this in Supabase SQL Editor to create all tables.
-- Each row stores a `doc` JSONB column (the full app object) plus
-- denormalized columns for efficient SQL queries.

-- ============================================================
-- 1. k9_clients — Pet parents / owners
-- ============================================================
CREATE TABLE IF NOT EXISTS k9_clients (
  id UUID PRIMARY KEY,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  doc JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_k9_clients_loc ON k9_clients(location_id);
CREATE INDEX IF NOT EXISTS idx_k9_clients_fields ON k9_clients USING GIN((doc->'fields'));

-- ============================================================
-- 2. k9_dogs — Pets
-- ============================================================
CREATE TABLE IF NOT EXISTS k9_dogs (
  id UUID PRIMARY KEY,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES k9_clients(id) ON DELETE CASCADE,
  doc JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_k9_dogs_loc ON k9_dogs(location_id);
CREATE INDEX IF NOT EXISTS idx_k9_dogs_client ON k9_dogs(client_id);

-- ============================================================
-- 3. k9_vaccine_records — One row per vaccine per dog
-- ============================================================
CREATE TABLE IF NOT EXISTS k9_vaccine_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  dog_id UUID NOT NULL REFERENCES k9_dogs(id) ON DELETE CASCADE,
  vaccine_name TEXT NOT NULL,
  expires_at DATE,
  doc JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_k9_vax_loc ON k9_vaccine_records(location_id);
CREATE INDEX IF NOT EXISTS idx_k9_vax_dog ON k9_vaccine_records(dog_id);
CREATE INDEX IF NOT EXISTS idx_k9_vax_expires ON k9_vaccine_records(expires_at, location_id);
CREATE INDEX IF NOT EXISTS idx_k9_vax_name ON k9_vaccine_records(vaccine_name, location_id);

-- ============================================================
-- 4. k9_reservations — Bookings
-- ============================================================
CREATE TABLE IF NOT EXISTS k9_reservations (
  id UUID PRIMARY KEY,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES k9_clients(id) ON DELETE SET NULL,
  dog_id UUID REFERENCES k9_dogs(id) ON DELETE SET NULL,
  status TEXT,
  check_in DATE,
  check_out DATE,
  doc JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_k9_res_loc ON k9_reservations(location_id);
CREATE INDEX IF NOT EXISTS idx_k9_res_client ON k9_reservations(client_id);
CREATE INDEX IF NOT EXISTS idx_k9_res_dog ON k9_reservations(dog_id);
CREATE INDEX IF NOT EXISTS idx_k9_res_status ON k9_reservations(status, location_id);
CREATE INDEX IF NOT EXISTS idx_k9_res_dates ON k9_reservations(check_in, check_out, location_id);

-- ============================================================
-- 5. k9_evaluations — Behavioral assessments
-- ============================================================
CREATE TABLE IF NOT EXISTS k9_evaluations (
  id UUID PRIMARY KEY,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  dog_id UUID REFERENCES k9_dogs(id) ON DELETE CASCADE,
  reservation_id UUID REFERENCES k9_reservations(id) ON DELETE SET NULL,
  doc JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_k9_eval_loc ON k9_evaluations(location_id);
CREATE INDEX IF NOT EXISTS idx_k9_eval_dog ON k9_evaluations(dog_id);
CREATE INDEX IF NOT EXISTS idx_k9_eval_res ON k9_evaluations(reservation_id);

-- ============================================================
-- 6. k9_daily_ops — Checklists (opening, closing, FE, BE, rooms, etc.)
-- ============================================================
CREATE TABLE IF NOT EXISTS k9_daily_ops (
  id TEXT PRIMARY KEY,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  type TEXT,
  entry_date DATE,
  doc JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_k9_ops_loc ON k9_daily_ops(location_id);
CREATE INDEX IF NOT EXISTS idx_k9_ops_type ON k9_daily_ops(type, location_id);
CREATE INDEX IF NOT EXISTS idx_k9_ops_date ON k9_daily_ops(entry_date DESC, location_id);

-- ============================================================
-- 7. k9_payments — Financial transactions
-- ============================================================
CREATE TABLE IF NOT EXISTS k9_payments (
  id UUID PRIMARY KEY,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES k9_clients(id) ON DELETE SET NULL,
  reservation_id UUID REFERENCES k9_reservations(id) ON DELETE SET NULL,
  amount DECIMAL(10, 2),
  method TEXT,
  status TEXT,
  doc JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_k9_pay_loc ON k9_payments(location_id);
CREATE INDEX IF NOT EXISTS idx_k9_pay_client ON k9_payments(client_id);
CREATE INDEX IF NOT EXISTS idx_k9_pay_res ON k9_payments(reservation_id);
CREATE INDEX IF NOT EXISTS idx_k9_pay_status ON k9_payments(status, location_id);
CREATE INDEX IF NOT EXISTS idx_k9_pay_time ON k9_payments(created_at DESC, location_id);

-- ============================================================
-- 8. k9_packages — Package templates (products)
-- ============================================================
CREATE TABLE IF NOT EXISTS k9_packages (
  id UUID PRIMARY KEY,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  doc JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_k9_pkg_loc ON k9_packages(location_id);

-- ============================================================
-- 9. k9_package_sales — Purchased package instances
-- ============================================================
CREATE TABLE IF NOT EXISTS k9_package_sales (
  id UUID PRIMARY KEY,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES k9_clients(id) ON DELETE SET NULL,
  package_id UUID REFERENCES k9_packages(id) ON DELETE SET NULL,
  doc JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_k9_pkgsale_loc ON k9_package_sales(location_id);
CREATE INDEX IF NOT EXISTS idx_k9_pkgsale_client ON k9_package_sales(client_id);
CREATE INDEX IF NOT EXISTS idx_k9_pkgsale_pkg ON k9_package_sales(package_id);

-- ============================================================
-- 10. k9_messages — SMS/email communications
-- ============================================================
CREATE TABLE IF NOT EXISTS k9_messages (
  id UUID PRIMARY KEY,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES k9_clients(id) ON DELETE SET NULL,
  sent_at TIMESTAMPTZ,
  doc JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_k9_msg_loc ON k9_messages(location_id);
CREATE INDEX IF NOT EXISTS idx_k9_msg_client ON k9_messages(client_id);
CREATE INDEX IF NOT EXISTS idx_k9_msg_time ON k9_messages(sent_at DESC, location_id);

-- ============================================================
-- 11. k9_audit_log — Every significant action (append-only)
-- ============================================================
CREATE TABLE IF NOT EXISTS k9_audit_log (
  id UUID PRIMARY KEY,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  reservation_id UUID REFERENCES k9_reservations(id) ON DELETE SET NULL,
  doc JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_k9_audit_loc ON k9_audit_log(location_id);
CREATE INDEX IF NOT EXISTS idx_k9_audit_res ON k9_audit_log(reservation_id);
CREATE INDEX IF NOT EXISTS idx_k9_audit_time ON k9_audit_log(created_at DESC, location_id);

-- ============================================================
-- 12. k9_reminder_log — Vaccine reminder audit trail
-- ============================================================
CREATE TABLE IF NOT EXISTS k9_reminder_log (
  id TEXT PRIMARY KEY,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES k9_clients(id) ON DELETE SET NULL,
  sent_at TIMESTAMPTZ,
  doc JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_k9_rem_loc ON k9_reminder_log(location_id);
CREATE INDEX IF NOT EXISTS idx_k9_rem_client ON k9_reminder_log(client_id);
CREATE INDEX IF NOT EXISTS idx_k9_rem_time ON k9_reminder_log(sent_at DESC, location_id);

-- ============================================================
-- RLS Policies — Staff can read/write their own location's data
-- ============================================================
ALTER TABLE k9_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE k9_dogs ENABLE ROW LEVEL SECURITY;
ALTER TABLE k9_vaccine_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE k9_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE k9_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE k9_daily_ops ENABLE ROW LEVEL SECURITY;
ALTER TABLE k9_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE k9_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE k9_package_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE k9_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE k9_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE k9_reminder_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS k9_clients_rls ON k9_clients;
CREATE POLICY k9_clients_rls ON k9_clients FOR ALL USING (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS k9_dogs_rls ON k9_dogs;
CREATE POLICY k9_dogs_rls ON k9_dogs FOR ALL USING (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS k9_vaccine_records_rls ON k9_vaccine_records;
CREATE POLICY k9_vaccine_records_rls ON k9_vaccine_records FOR ALL USING (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS k9_reservations_rls ON k9_reservations;
CREATE POLICY k9_reservations_rls ON k9_reservations FOR ALL USING (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS k9_evaluations_rls ON k9_evaluations;
CREATE POLICY k9_evaluations_rls ON k9_evaluations FOR ALL USING (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS k9_daily_ops_rls ON k9_daily_ops;
CREATE POLICY k9_daily_ops_rls ON k9_daily_ops FOR ALL USING (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS k9_payments_rls ON k9_payments;
CREATE POLICY k9_payments_rls ON k9_payments FOR ALL USING (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS k9_packages_rls ON k9_packages;
CREATE POLICY k9_packages_rls ON k9_packages FOR ALL USING (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS k9_package_sales_rls ON k9_package_sales;
CREATE POLICY k9_package_sales_rls ON k9_package_sales FOR ALL USING (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS k9_messages_rls ON k9_messages;
CREATE POLICY k9_messages_rls ON k9_messages FOR ALL USING (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS k9_audit_log_rls ON k9_audit_log;
CREATE POLICY k9_audit_log_rls ON k9_audit_log FOR ALL USING (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS k9_reminder_log_rls ON k9_reminder_log;
CREATE POLICY k9_reminder_log_rls ON k9_reminder_log FOR ALL USING (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()));

-- ============================================================
-- Auto-update updated_at triggers
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS k9_clients_ts ON k9_clients;
CREATE TRIGGER k9_clients_ts BEFORE UPDATE ON k9_clients FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS k9_dogs_ts ON k9_dogs;
CREATE TRIGGER k9_dogs_ts BEFORE UPDATE ON k9_dogs FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS k9_vaccine_records_ts ON k9_vaccine_records;
CREATE TRIGGER k9_vaccine_records_ts BEFORE UPDATE ON k9_vaccine_records FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS k9_reservations_ts ON k9_reservations;
CREATE TRIGGER k9_reservations_ts BEFORE UPDATE ON k9_reservations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS k9_daily_ops_ts ON k9_daily_ops;
CREATE TRIGGER k9_daily_ops_ts BEFORE UPDATE ON k9_daily_ops FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS k9_packages_ts ON k9_packages;
CREATE TRIGGER k9_packages_ts BEFORE UPDATE ON k9_packages FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Portal RPCs — SECURITY DEFINER (bypass RLS for customer self-service)
-- Used by BookingPage.jsx for customer profile edits & vaccine uploads.
-- These do NOT require Supabase auth — they use location_id scoping.
-- ============================================================

-- Merge field updates into a client's doc.fields
CREATE OR REPLACE FUNCTION portal_update_client_fields(p_client_id UUID, p_location_id UUID, p_field_updates JSONB)
RETURNS void AS $$
BEGIN
  UPDATE k9_clients
  SET doc = jsonb_set(doc, '{fields}', COALESCE(doc->'fields', '{}'::jsonb) || p_field_updates),
      updated_at = NOW()
  WHERE id = p_client_id AND location_id = p_location_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Replace a client's notificationPrefs
CREATE OR REPLACE FUNCTION portal_update_client_notif_prefs(p_client_id UUID, p_location_id UUID, p_prefs JSONB)
RETURNS void AS $$
BEGIN
  UPDATE k9_clients
  SET doc = jsonb_set(doc, '{notificationPrefs}', p_prefs),
      updated_at = NOW()
  WHERE id = p_client_id AND location_id = p_location_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Append a vaccine record to a dog's doc.vaccines array
CREATE OR REPLACE FUNCTION portal_add_dog_vaccine(p_dog_id UUID, p_location_id UUID, p_vaccine JSONB)
RETURNS void AS $$
BEGIN
  UPDATE k9_dogs
  SET doc = jsonb_set(doc, '{vaccines}', COALESCE(doc->'vaccines', '[]'::jsonb) || jsonb_build_array(p_vaccine)),
      updated_at = NOW()
  WHERE id = p_dog_id AND location_id = p_location_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- Rewritten RPCs — all queries hit normalized tables, NOT the blob
-- ============================================================

-- Shared helper: builds portal data from normalized tables for a known client
CREATE OR REPLACE FUNCTION _build_portal_data(p_location_id UUID, p_client_id UUID, p_client_doc JSONB)
RETURNS JSONB AS $$
DECLARE
  dogs_data JSONB;
  res_data JSONB;
  payment_data JSONB;
  package_data JSONB;
  vaccine_data JSONB;
BEGIN
  -- Dogs
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', d.id,
    'name', d.doc->'fields'->>'name',
    'breed', d.doc->'fields'->>'breed',
    'weight', d.doc->'fields'->>'weight',
    'dob', d.doc->'fields'->>'dob',
    'sex', d.doc->'fields'->>'sex',
    'profilePic', d.doc->'fields'->>'profilePic',
    'vaccines', COALESCE(d.doc->'vaccines', '[]'::jsonb)
  )), '[]'::jsonb) INTO dogs_data
  FROM k9_dogs d
  WHERE d.client_id = p_client_id AND d.location_id = p_location_id;

  -- Reservations for this client's dogs
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'dogId', r.doc->>'dogId',
    'dogName', COALESCE((SELECT dd.doc->'fields'->>'name' FROM k9_dogs dd WHERE dd.id = r.dog_id), ''),
    'type', r.doc->>'type',
    'status', r.status,
    'checkIn', r.doc->>'checkIn',
    'checkOut', r.doc->>'checkOut',
    'checkInTime', r.doc->>'checkInTime',
    'checkOutTime', r.doc->>'checkOutTime',
    'roomType', r.doc->>'roomType',
    'room', r.doc->>'room',
    'bathType', r.doc->>'bathType',
    'bathCost', r.doc->>'bathCost',
    'roomRate', r.doc->>'roomRate',
    'totalCost', r.doc->>'totalCost',
    'depositPaid', r.doc->>'depositPaid',
    'balanceDue', r.doc->>'balanceDue',
    'addOns', r.doc->'addOns',
    'notes', r.doc->>'notes',
    'feedingInstructions', r.doc->>'feedingInstructions',
    'medications', r.doc->>'medications',
    'tourDate', r.doc->>'tourDate',
    'tourTime', r.doc->>'tourTime'
  ) ORDER BY r.doc->>'checkIn' DESC), '[]'::jsonb) INTO res_data
  FROM k9_reservations r
  WHERE r.location_id = p_location_id
    AND r.dog_id IN (SELECT d.id FROM k9_dogs d WHERE d.client_id = p_client_id AND d.location_id = p_location_id);

  -- Payments
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'amount', p.doc->>'amount',
    'method', p.doc->>'method',
    'status', COALESCE(p.status, 'paid'),
    'date', p.doc->>'date',
    'type', p.doc->>'type',
    'items', p.doc->'items'
  ) ORDER BY p.created_at DESC), '[]'::jsonb) INTO payment_data
  FROM k9_payments p
  WHERE p.client_id = p_client_id AND p.location_id = p_location_id;

  -- Package sales
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', ps.id,
    'name', ps.doc->>'name',
    'total', ps.doc->>'total',
    'remaining', ps.doc->>'remaining',
    'used', ps.doc->>'used',
    'type', ps.doc->>'type',
    'purchaseDate', ps.doc->>'purchaseDate'
  )), '[]'::jsonb) INTO package_data
  FROM k9_package_sales ps
  WHERE ps.client_id = p_client_id AND ps.location_id = p_location_id;

  -- Vaccines (from dog doc.vaccines arrays)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'dogId', d.id,
    'dogName', d.doc->'fields'->>'name',
    'name', v->>'name',
    'expirationDate', v->>'expirationDate',
    'uploadedAt', v->>'uploadedAt'
  )), '[]'::jsonb) INTO vaccine_data
  FROM k9_dogs d,
       jsonb_array_elements(COALESCE(d.doc->'vaccines', '[]'::jsonb)) v
  WHERE d.client_id = p_client_id AND d.location_id = p_location_id;

  RETURN jsonb_build_object(
    'success', true,
    'clientId', p_client_id,
    'locationId', p_location_id,
    'client', jsonb_build_object(
      'firstName', p_client_doc->'fields'->>'first_name',
      'lastName', p_client_doc->'fields'->>'last_name',
      'email', p_client_doc->'fields'->>'email',
      'phone', p_client_doc->'fields'->>'phone',
      'address', p_client_doc->'fields'->>'address',
      'emergencyContact', p_client_doc->'fields'->>'emergency_contact',
      'emergencyPhone', p_client_doc->'fields'->>'emergency_phone',
      'vetName', p_client_doc->'fields'->>'vet_name',
      'vetPhone', p_client_doc->'fields'->>'vet_phone'
    ),
    'dogs', dogs_data,
    'reservations', res_data,
    'payments', payment_data,
    'packages', package_data,
    'vaccines', vaccine_data,
    'notificationPrefs', COALESCE(p_client_doc->'notificationPrefs',
      '{"emailReminders": true, "textReminders": false, "vaccineAlerts": true, "marketingEmails": false}'::jsonb)
  );
END;
$$ LANGUAGE plpgsql;


-- ── get_public_booking_data ──────────────────────────────────
-- Returns public-safe location data for the self-booking page.
-- NO AUTH REQUIRED. Reads reservations from k9_reservations,
-- packages from k9_packages, settings from locations.data.
CREATE OR REPLACE FUNCTION get_public_booking_data(p_slug TEXT)
RETURNS JSONB AS $$
DECLARE
  loc RECORD;
  res_data JSONB;
  pkg_data JSONB;
BEGIN
  SELECT id, name, slug, region, data INTO loc
  FROM locations WHERE slug = p_slug LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Location not found');
  END IF;

  -- Reservations from normalized table (no PII — dates & room types only)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'type', r.doc->>'type',
    'roomType', r.doc->>'roomType',
    'checkIn', r.doc->>'checkIn',
    'checkOut', r.doc->>'checkOut',
    'status', r.status,
    'tourTime', r.doc->>'tourTime',
    'daycareSize', r.doc->>'daycareSize'
  )), '[]'::jsonb) INTO res_data
  FROM k9_reservations r
  WHERE r.location_id = loc.id
    AND r.status NOT IN ('cancelled', 'checked-out');

  -- Packages from normalized table
  SELECT COALESCE(jsonb_agg(p.doc), '[]'::jsonb) INTO pkg_data
  FROM k9_packages p
  WHERE p.location_id = loc.id;

  -- Settings still come from locations.data (config, not entities)
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
    'packages', pkg_data,
    'settings', jsonb_build_object(
      'tourSettings', COALESCE(loc.data->'settings'->'tourSettings',
        '{"allowConcurrent": false, "duration": 30}'::jsonb),
      'daycareCapacity', COALESCE(loc.data->'settings'->'daycareCapacity',
        '{"small": 15, "large": 20, "total": 35}'::jsonb)
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ── verify_otp_and_get_customer ──────────────────────────────
-- Verifies OTP, then returns customer portal data from normalized tables.
-- NO AUTH REQUIRED (public booking page).
CREATE OR REPLACE FUNCTION verify_otp_and_get_customer(p_phone TEXT, p_code TEXT, p_slug TEXT)
RETURNS JSONB AS $$
DECLARE
  otp_record RECORD;
  loc_id UUID;
  client_row RECORD;
  clean_phone TEXT;
BEGIN
  clean_phone := regexp_replace(p_phone, '[^0-9]', '', 'g');
  IF length(clean_phone) = 11 AND left(clean_phone, 1) = '1' THEN
    clean_phone := right(clean_phone, 10);
  END IF;

  -- OTP verification
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

  IF otp_record.attempts >= 3 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Too many attempts. Please request a new code.');
  END IF;

  UPDATE phone_otps SET attempts = attempts + 1 WHERE id = otp_record.id;

  IF otp_record.code != p_code THEN
    RETURN jsonb_build_object('success', false, 'message', 'Invalid code. Please try again.');
  END IF;

  UPDATE phone_otps SET verified = true WHERE id = otp_record.id;

  -- Find location
  SELECT id INTO loc_id FROM locations WHERE slug = p_slug LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Location not found');
  END IF;

  -- Find client by phone in normalized k9_clients table
  SELECT c.id, c.doc INTO client_row
  FROM k9_clients c
  WHERE c.location_id = loc_id
    AND regexp_replace(c.doc->'fields'->>'phone', '[^0-9]', '', 'g') LIKE '%' || clean_phone
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'No account found for this phone number.');
  END IF;

  RETURN _build_portal_data(loc_id, client_row.id, client_row.doc);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ── get_customer_portal_data ─────────────────────────────────
-- Returns customer data by phone without OTP (dev fallback).
-- NO AUTH REQUIRED.
CREATE OR REPLACE FUNCTION get_customer_portal_data(p_phone TEXT, p_slug TEXT)
RETURNS JSONB AS $$
DECLARE
  loc_id UUID;
  client_row RECORD;
  clean_phone TEXT;
BEGIN
  clean_phone := regexp_replace(p_phone, '[^0-9]', '', 'g');
  IF length(clean_phone) = 11 AND left(clean_phone, 1) = '1' THEN
    clean_phone := right(clean_phone, 10);
  END IF;

  SELECT id INTO loc_id FROM locations WHERE slug = p_slug LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Location not found');
  END IF;

  -- Find client by phone in normalized k9_clients table
  SELECT c.id, c.doc INTO client_row
  FROM k9_clients c
  WHERE c.location_id = loc_id
    AND regexp_replace(c.doc->'fields'->>'phone', '[^0-9]', '', 'g') LIKE '%' || clean_phone
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'No account found for this phone number.');
  END IF;

  RETURN _build_portal_data(loc_id, client_row.id, client_row.doc);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ── delete_location (updated) ────────────────────────────────
-- Now also cleans up all 12 entity tables before deleting the location.
CREATE OR REPLACE FUNCTION delete_location(p_location_id UUID)
RETURNS JSONB AS $$
DECLARE
  user_loc UUID;
  loc_name TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'enterprise_admin')) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Only owners can delete locations');
  END IF;

  SELECT location_id INTO user_loc FROM profiles WHERE id = auth.uid();

  IF user_loc = p_location_id THEN
    RETURN jsonb_build_object('success', false, 'message', 'Cannot delete your currently active location. Switch to another location first.');
  END IF;

  SELECT name INTO loc_name FROM locations WHERE id = p_location_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Location not found');
  END IF;

  IF lower(loc_name) = 'demo' OR EXISTS (SELECT 1 FROM locations WHERE id = p_location_id AND slug = 'demo') THEN
    RETURN jsonb_build_object('success', false, 'message', 'The Demo location is protected and cannot be deleted.');
  END IF;

  -- Clean up all entity tables (cascade from locations FK handles most,
  -- but explicit deletes are safer if ON DELETE CASCADE isn't set everywhere)
  DELETE FROM k9_reminder_log WHERE location_id = p_location_id;
  DELETE FROM k9_audit_log WHERE location_id = p_location_id;
  DELETE FROM k9_messages WHERE location_id = p_location_id;
  DELETE FROM k9_package_sales WHERE location_id = p_location_id;
  DELETE FROM k9_payments WHERE location_id = p_location_id;
  DELETE FROM k9_daily_ops WHERE location_id = p_location_id;
  DELETE FROM k9_evaluations WHERE location_id = p_location_id;
  DELETE FROM k9_vaccine_records WHERE location_id = p_location_id;
  DELETE FROM k9_reservations WHERE location_id = p_location_id;
  DELETE FROM k9_packages WHERE location_id = p_location_id;
  DELETE FROM k9_dogs WHERE location_id = p_location_id;
  DELETE FROM k9_clients WHERE location_id = p_location_id;

  -- Reassign users and delete location
  UPDATE profiles SET location_id = user_loc WHERE location_id = p_location_id;
  DELETE FROM locations WHERE id = p_location_id;

  RETURN jsonb_build_object('success', true, 'name', loc_name);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
