-- © 2026 K9 Operations LLC. All Rights Reserved.
-- Normalized Database Schema for K9 Operations
--
-- 12 tables with REAL columns — no catch-all doc JSONB blobs.
-- JSONB is used only for genuinely dynamic/nested structures
-- (lifecycle, agreements, careOverrides, answers, etc.)
--
-- Entity IDs are TEXT (app uses short IDs like "c1" for demo,
-- UUIDs as strings for real data).

-- ============================================================
-- Drop existing tables in FK-safe order (children first)
-- ============================================================
DROP TABLE IF EXISTS k9_reminder_log CASCADE;
DROP TABLE IF EXISTS k9_audit_log CASCADE;
DROP TABLE IF EXISTS k9_messages CASCADE;
DROP TABLE IF EXISTS k9_package_sales CASCADE;
DROP TABLE IF EXISTS k9_payments CASCADE;
DROP TABLE IF EXISTS k9_daily_ops CASCADE;
DROP TABLE IF EXISTS k9_evaluations CASCADE;
DROP TABLE IF EXISTS k9_vaccine_records CASCADE;
DROP TABLE IF EXISTS k9_reservations CASCADE;
DROP TABLE IF EXISTS k9_packages CASCADE;
DROP TABLE IF EXISTS k9_dogs CASCADE;
DROP TABLE IF EXISTS k9_clients CASCADE;

-- ============================================================
-- 1. k9_clients
-- ============================================================
CREATE TABLE k9_clients (
  id TEXT PRIMARY KEY,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  -- fields.*
  phone TEXT,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  address TEXT,
  emergency_contact TEXT,
  emergency_phone TEXT,
  vet_name TEXT,
  vet_phone TEXT,
  notes TEXT,
  referral_source TEXT,
  -- top-level
  created_at_app TEXT,          -- app-level createdAt (ISO string from app)
  lifecycle JSONB,              -- { conversion, retention, coldFrom, ... }
  lifecycle_events JSONB,       -- array of system events
  agreements JSONB,             -- { agrId: { signed, date }, ... }
  questionnaire_responses JSONB,-- per-client questionnaire answers
  notification_prefs JSONB,     -- { vaccineAlerts, textReminders, ... }
  custom_fields JSONB,          -- any user-defined fields not in schema
  -- db timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_k9_clients_loc ON k9_clients(location_id);
CREATE INDEX idx_k9_clients_phone ON k9_clients(phone, location_id);
CREATE INDEX idx_k9_clients_name ON k9_clients(last_name, first_name, location_id);

-- ============================================================
-- 2. k9_dogs
-- ============================================================
CREATE TABLE k9_dogs (
  id TEXT PRIMARY KEY,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  client_id TEXT REFERENCES k9_clients(id) ON DELETE CASCADE,
  -- fields.*
  name TEXT,
  breed TEXT,
  weight TEXT,
  dob TEXT,
  sex TEXT,
  spayed_neutered TEXT,
  color TEXT,
  bath_type TEXT,
  temperament TEXT,
  rabies_exp TEXT,
  bordetella_exp TEXT,
  dhpp_exp TEXT,
  canine_flu_exp TEXT,
  profile_pic TEXT,
  weight_last_updated TEXT,
  -- nested arrays (JSONB)
  feeding_schedules JSONB,      -- array of { id, times, amount, unit, foodType, ... }
  medication_schedules JSONB,   -- array of { id, times, amount, unit, name, ... }
  weight_log JSONB,             -- array of { date, weight, reason }
  -- top-level
  tags JSONB,                   -- array of tag strings
  vaccines JSONB,               -- array of vaccine objects from portal uploads
  daycare_group_override TEXT,
  questionnaire_responses JSONB,
  custom_fields JSONB,
  -- db timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_k9_dogs_loc ON k9_dogs(location_id);
CREATE INDEX idx_k9_dogs_client ON k9_dogs(client_id);
CREATE INDEX idx_k9_dogs_name ON k9_dogs(name, location_id);

-- ============================================================
-- 3. k9_vaccine_records (portal-uploaded, one row per vaccine per dog)
-- ============================================================
CREATE TABLE k9_vaccine_records (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  dog_id TEXT NOT NULL REFERENCES k9_dogs(id) ON DELETE CASCADE,
  vaccine_name TEXT NOT NULL,
  expires_at DATE,
  doc JSONB NOT NULL DEFAULT '{}'::jsonb,  -- portal upload metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_k9_vax_loc ON k9_vaccine_records(location_id);
CREATE INDEX idx_k9_vax_dog ON k9_vaccine_records(dog_id);
CREATE INDEX idx_k9_vax_expires ON k9_vaccine_records(expires_at, location_id);

-- ============================================================
-- 4. k9_reservations
-- ============================================================
CREATE TABLE k9_reservations (
  id TEXT PRIMARY KEY,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  client_id TEXT REFERENCES k9_clients(id) ON DELETE SET NULL,
  dog_id TEXT REFERENCES k9_dogs(id) ON DELETE SET NULL,
  type TEXT,                    -- boarding, daycare, tour, evaluation
  room_type TEXT,
  room TEXT,
  check_in TEXT,                -- YYYY-MM-DD
  check_out TEXT,               -- YYYY-MM-DD
  check_in_time TEXT,
  check_out_time TEXT,
  daycare_size TEXT,
  status TEXT,                  -- upcoming, checked-in, checked-out, cancelled
  eval_result TEXT,
  notes TEXT,
  parent_destination TEXT,
  belongings TEXT,
  discount_type TEXT,
  discount_value DECIMAL(10,2),
  total_price DECIMAL(10,2),
  amount_collected DECIMAL(10,2),
  fed_today TEXT,
  meds_today TEXT,
  cancelled_at TEXT,
  cancelled_by TEXT,
  actual_check_out_time TEXT,
  checked_out_by TEXT,
  -- nested JSONB
  care_overrides JSONB,         -- { feedingSchedules, medicationSchedules, ... }
  emergency_contact_override JSONB, -- { name, phone }
  selected_add_ons JSONB,       -- array of strings
  activity_log JSONB,           -- { timestamp: note }
  custom_fields JSONB,
  -- db timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_k9_res_loc ON k9_reservations(location_id);
CREATE INDEX idx_k9_res_client ON k9_reservations(client_id);
CREATE INDEX idx_k9_res_dog ON k9_reservations(dog_id);
CREATE INDEX idx_k9_res_status ON k9_reservations(status, location_id);
CREATE INDEX idx_k9_res_dates ON k9_reservations(check_in, check_out, location_id);

-- ============================================================
-- 5. k9_evaluations
-- ============================================================
CREATE TABLE k9_evaluations (
  id TEXT PRIMARY KEY,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  dog_id TEXT REFERENCES k9_dogs(id) ON DELETE CASCADE,
  client_id TEXT REFERENCES k9_clients(id) ON DELETE SET NULL,
  reservation_id TEXT REFERENCES k9_reservations(id) ON DELETE SET NULL,
  date TEXT,
  evaluator_name TEXT,
  eval_type TEXT,
  has_experience BOOLEAN,
  total_score DECIMAL(10,2),
  max_score DECIMAL(10,2),
  result TEXT,
  notes TEXT,
  locked BOOLEAN DEFAULT FALSE,
  -- nested JSONB
  answers JSONB,                -- { questionId: answer }
  subtotals JSONB,              -- { sectionId: score }
  -- db timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_k9_eval_loc ON k9_evaluations(location_id);
CREATE INDEX idx_k9_eval_dog ON k9_evaluations(dog_id);
CREATE INDEX idx_k9_eval_res ON k9_evaluations(reservation_id);

-- ============================================================
-- 6. k9_daily_ops (checklists + EOD reports, split by type)
-- ============================================================
CREATE TABLE k9_daily_ops (
  id TEXT PRIMARY KEY,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  type TEXT,                    -- opening, closing, fe, be, eod
  date TEXT,
  locked BOOLEAN DEFAULT FALSE,
  completed_by TEXT,
  -- nested JSONB
  items JSONB,                  -- checklist: { itemId: { checked, initials } }
  sections JSONB,               -- eod: array of { id, content }
  mentions JSONB,               -- eod: array of @mentions
  history JSONB,                -- eod: array of edit history
  -- db timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_k9_ops_loc ON k9_daily_ops(location_id);
CREATE INDEX idx_k9_ops_type ON k9_daily_ops(type, location_id);
CREATE INDEX idx_k9_ops_date ON k9_daily_ops(date DESC, location_id);

-- ============================================================
-- 7. k9_payments
-- ============================================================
CREATE TABLE k9_payments (
  id TEXT PRIMARY KEY,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  client_id TEXT REFERENCES k9_clients(id) ON DELETE SET NULL,
  reservation_id TEXT REFERENCES k9_reservations(id) ON DELETE SET NULL,
  amount DECIMAL(10,2),
  type TEXT,                    -- deposit, payment, refund
  method TEXT,                  -- card, cash, check
  card_last4 TEXT,
  status TEXT,
  note TEXT,
  timestamp TEXT,               -- ISO datetime
  stripe_payment_intent_id TEXT,
  stripe_refund_id TEXT,
  processed_by TEXT,
  -- db timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_k9_pay_loc ON k9_payments(location_id);
CREATE INDEX idx_k9_pay_client ON k9_payments(client_id);
CREATE INDEX idx_k9_pay_res ON k9_payments(reservation_id);
CREATE INDEX idx_k9_pay_status ON k9_payments(status, location_id);
CREATE INDEX idx_k9_pay_time ON k9_payments(created_at DESC, location_id);

-- ============================================================
-- 8. k9_packages (templates)
-- ============================================================
CREATE TABLE k9_packages (
  id TEXT PRIMARY KEY,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  name TEXT,
  description TEXT,
  service_category TEXT,
  service_name TEXT,
  quantity INT,
  pricing_mode TEXT,
  discount_pct DECIMAL(10,2),
  discount_dollar DECIMAL(10,2),
  package_price DECIMAL(10,2),
  retail_value DECIMAL(10,2),
  unit_price DECIMAL(10,2),
  savings DECIMAL(10,2),
  savings_per_unit DECIMAL(10,2),
  expiration_type TEXT,
  expiration_days INT,
  expiration_date TEXT,
  available_online BOOLEAN DEFAULT FALSE,
  fields JSONB,
  -- db timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_k9_pkg_loc ON k9_packages(location_id);

-- ============================================================
-- 9. k9_package_sales
-- ============================================================
CREATE TABLE k9_package_sales (
  id TEXT PRIMARY KEY,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  client_id TEXT REFERENCES k9_clients(id) ON DELETE SET NULL,
  package_id TEXT REFERENCES k9_packages(id) ON DELETE SET NULL,
  quantity INT,
  used INT DEFAULT 0,
  purchase_date TEXT,
  package_name TEXT,
  -- db timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_k9_pkgsale_loc ON k9_package_sales(location_id);
CREATE INDEX idx_k9_pkgsale_client ON k9_package_sales(client_id);
CREATE INDEX idx_k9_pkgsale_pkg ON k9_package_sales(package_id);

-- ============================================================
-- 10. k9_messages
-- ============================================================
CREATE TABLE k9_messages (
  id TEXT PRIMARY KEY,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  client_id TEXT REFERENCES k9_clients(id) ON DELETE SET NULL,
  direction TEXT,               -- inbound, outbound
  channel TEXT,                 -- sms
  body TEXT,
  timestamp TEXT,               -- ISO datetime
  status TEXT,                  -- sent, received, failed
  read_at TEXT,
  twilio_sid TEXT,
  template_id TEXT,
  -- db timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_k9_msg_loc ON k9_messages(location_id);
CREATE INDEX idx_k9_msg_client ON k9_messages(client_id);
CREATE INDEX idx_k9_msg_time ON k9_messages(timestamp DESC, location_id);

-- ============================================================
-- 11. k9_audit_log
-- ============================================================
CREATE TABLE k9_audit_log (
  id TEXT PRIMARY KEY,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  reservation_id TEXT REFERENCES k9_reservations(id) ON DELETE SET NULL,
  timestamp TEXT,
  user_name TEXT,
  action TEXT,
  details JSONB,                -- array of { field, oldVal, newVal }
  -- db timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_k9_audit_loc ON k9_audit_log(location_id);
CREATE INDEX idx_k9_audit_res ON k9_audit_log(reservation_id);
CREATE INDEX idx_k9_audit_time ON k9_audit_log(created_at DESC, location_id);

-- ============================================================
-- 12. k9_reminder_log
-- ============================================================
CREATE TABLE k9_reminder_log (
  id TEXT PRIMARY KEY,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  client_id TEXT REFERENCES k9_clients(id) ON DELETE SET NULL,
  dog_id TEXT,
  vaccine_type TEXT,
  status TEXT,
  sent_at TEXT,
  message TEXT,
  phone_number TEXT,
  -- db timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_k9_rem_loc ON k9_reminder_log(location_id);
CREATE INDEX idx_k9_rem_client ON k9_reminder_log(client_id);

-- ============================================================
-- RLS Policies
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

CREATE POLICY k9_clients_rls ON k9_clients FOR ALL USING (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY k9_dogs_rls ON k9_dogs FOR ALL USING (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY k9_vaccine_records_rls ON k9_vaccine_records FOR ALL USING (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY k9_reservations_rls ON k9_reservations FOR ALL USING (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY k9_evaluations_rls ON k9_evaluations FOR ALL USING (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY k9_daily_ops_rls ON k9_daily_ops FOR ALL USING (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY k9_payments_rls ON k9_payments FOR ALL USING (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY k9_packages_rls ON k9_packages FOR ALL USING (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY k9_package_sales_rls ON k9_package_sales FOR ALL USING (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY k9_messages_rls ON k9_messages FOR ALL USING (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY k9_audit_log_rls ON k9_audit_log FOR ALL USING (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY k9_reminder_log_rls ON k9_reminder_log FOR ALL USING (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()));

-- ============================================================
-- Auto-update updated_at triggers
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER k9_clients_ts BEFORE UPDATE ON k9_clients FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER k9_dogs_ts BEFORE UPDATE ON k9_dogs FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER k9_vaccine_records_ts BEFORE UPDATE ON k9_vaccine_records FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER k9_reservations_ts BEFORE UPDATE ON k9_reservations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER k9_daily_ops_ts BEFORE UPDATE ON k9_daily_ops FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER k9_packages_ts BEFORE UPDATE ON k9_packages FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Portal RPCs (SECURITY DEFINER — bypass RLS for anon booking page)
-- ============================================================

CREATE OR REPLACE FUNCTION portal_update_client_fields(p_client_id TEXT, p_location_id UUID, p_field_updates JSONB)
RETURNS void AS $$
DECLARE
  k TEXT; v TEXT;
BEGIN
  -- Update each known column from the JSONB field map
  FOR k, v IN SELECT * FROM jsonb_each_text(p_field_updates) LOOP
    CASE k
      WHEN 'first_name' THEN UPDATE k9_clients SET first_name = v, updated_at = NOW() WHERE id = p_client_id AND location_id = p_location_id;
      WHEN 'last_name' THEN UPDATE k9_clients SET last_name = v, updated_at = NOW() WHERE id = p_client_id AND location_id = p_location_id;
      WHEN 'email' THEN UPDATE k9_clients SET email = v, updated_at = NOW() WHERE id = p_client_id AND location_id = p_location_id;
      WHEN 'phone' THEN UPDATE k9_clients SET phone = v, updated_at = NOW() WHERE id = p_client_id AND location_id = p_location_id;
      WHEN 'address' THEN UPDATE k9_clients SET address = v, updated_at = NOW() WHERE id = p_client_id AND location_id = p_location_id;
      WHEN 'emergency_contact' THEN UPDATE k9_clients SET emergency_contact = v, updated_at = NOW() WHERE id = p_client_id AND location_id = p_location_id;
      WHEN 'emergency_phone' THEN UPDATE k9_clients SET emergency_phone = v, updated_at = NOW() WHERE id = p_client_id AND location_id = p_location_id;
      WHEN 'vet_name' THEN UPDATE k9_clients SET vet_name = v, updated_at = NOW() WHERE id = p_client_id AND location_id = p_location_id;
      WHEN 'vet_phone' THEN UPDATE k9_clients SET vet_phone = v, updated_at = NOW() WHERE id = p_client_id AND location_id = p_location_id;
      ELSE
        UPDATE k9_clients SET custom_fields = COALESCE(custom_fields, '{}'::jsonb) || jsonb_build_object(k, v), updated_at = NOW()
        WHERE id = p_client_id AND location_id = p_location_id;
    END CASE;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION portal_update_client_notif_prefs(p_client_id TEXT, p_location_id UUID, p_prefs JSONB)
RETURNS void AS $$
BEGIN
  UPDATE k9_clients SET notification_prefs = p_prefs, updated_at = NOW()
  WHERE id = p_client_id AND location_id = p_location_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION portal_add_dog_vaccine(p_dog_id TEXT, p_location_id UUID, p_vaccine JSONB)
RETURNS void AS $$
BEGIN
  UPDATE k9_dogs SET vaccines = COALESCE(vaccines, '[]'::jsonb) || jsonb_build_array(p_vaccine), updated_at = NOW()
  WHERE id = p_dog_id AND location_id = p_location_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- Rewritten RPCs — queries hit real columns
-- ============================================================

CREATE OR REPLACE FUNCTION _build_portal_data(p_location_id UUID, p_client_id TEXT, p_client RECORD)
RETURNS JSONB AS $$
DECLARE
  dogs_data JSONB;
  res_data JSONB;
  payment_data JSONB;
  package_data JSONB;
  vaccine_data JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', d.id, 'name', d.name, 'breed', d.breed, 'weight', d.weight,
    'dob', d.dob, 'sex', d.sex, 'profilePic', d.profile_pic,
    'vaccines', COALESCE(d.vaccines, '[]'::jsonb)
  )), '[]'::jsonb) INTO dogs_data
  FROM k9_dogs d WHERE d.client_id = p_client_id AND d.location_id = p_location_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', r.id, 'dogId', r.dog_id,
    'dogName', COALESCE((SELECT dd.name FROM k9_dogs dd WHERE dd.id = r.dog_id), ''),
    'type', r.type, 'status', r.status,
    'checkIn', r.check_in, 'checkOut', r.check_out,
    'checkInTime', r.check_in_time, 'checkOutTime', r.check_out_time,
    'roomType', r.room_type, 'room', r.room,
    'bathType', (r.care_overrides->>'bath_type'),
    'roomRate', r.total_price, 'totalCost', r.total_price,
    'addOns', r.selected_add_ons,
    'notes', r.notes, 'tourDate', r.check_in, 'tourTime', r.check_in_time
  ) ORDER BY r.check_in DESC), '[]'::jsonb) INTO res_data
  FROM k9_reservations r WHERE r.location_id = p_location_id
    AND r.dog_id IN (SELECT d.id FROM k9_dogs d WHERE d.client_id = p_client_id AND d.location_id = p_location_id);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', p.id, 'amount', p.amount, 'method', p.method,
    'status', COALESCE(p.status, 'paid'), 'date', p.timestamp, 'type', p.type
  ) ORDER BY p.created_at DESC), '[]'::jsonb) INTO payment_data
  FROM k9_payments p WHERE p.client_id = p_client_id AND p.location_id = p_location_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', ps.id, 'name', ps.package_name, 'total', ps.quantity,
    'remaining', ps.quantity - ps.used, 'used', ps.used,
    'purchaseDate', ps.purchase_date
  )), '[]'::jsonb) INTO package_data
  FROM k9_package_sales ps WHERE ps.client_id = p_client_id AND ps.location_id = p_location_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'dogId', d.id, 'dogName', d.name,
    'name', v->>'name', 'expirationDate', v->>'expirationDate', 'uploadedAt', v->>'uploadedAt'
  )), '[]'::jsonb) INTO vaccine_data
  FROM k9_dogs d, jsonb_array_elements(COALESCE(d.vaccines, '[]'::jsonb)) v
  WHERE d.client_id = p_client_id AND d.location_id = p_location_id;

  RETURN jsonb_build_object(
    'success', true, 'clientId', p_client_id, 'locationId', p_location_id,
    'client', jsonb_build_object(
      'firstName', p_client.first_name, 'lastName', p_client.last_name,
      'email', p_client.email, 'phone', p_client.phone,
      'address', p_client.address,
      'emergencyContact', p_client.emergency_contact, 'emergencyPhone', p_client.emergency_phone,
      'vetName', p_client.vet_name, 'vetPhone', p_client.vet_phone
    ),
    'dogs', dogs_data, 'reservations', res_data,
    'payments', payment_data, 'packages', package_data, 'vaccines', vaccine_data,
    'notificationPrefs', COALESCE(p_client.notification_prefs,
      '{"emailReminders": true, "textReminders": false, "vaccineAlerts": true, "marketingEmails": false}'::jsonb)
  );
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION get_public_booking_data(p_slug TEXT)
RETURNS JSONB AS $$
DECLARE
  loc RECORD; res_data JSONB; pkg_data JSONB;
BEGIN
  SELECT id, name, slug, region, data INTO loc FROM locations WHERE slug = p_slug LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'message', 'Location not found'); END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'type', r.type, 'roomType', r.room_type,
    'checkIn', r.check_in, 'checkOut', r.check_out,
    'status', r.status, 'tourTime', r.check_in_time, 'daycareSize', r.daycare_size
  )), '[]'::jsonb) INTO res_data
  FROM k9_reservations r WHERE r.location_id = loc.id AND r.status NOT IN ('cancelled', 'checked-out');

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', p.id, 'name', p.name, 'description', p.description,
    'serviceCategory', p.service_category, 'serviceName', p.service_name,
    'quantity', p.quantity, 'packagePrice', p.package_price,
    'retailValue', p.retail_value, 'savings', p.savings,
    'availableOnline', p.available_online
  )), '[]'::jsonb) INTO pkg_data
  FROM k9_packages p WHERE p.location_id = loc.id;

  RETURN jsonb_build_object(
    'success', true, 'location_name', loc.name, 'location_slug', COALESCE(loc.slug, ''),
    'region', COALESCE(loc.region, ''),
    'resortInfo', COALESCE(loc.data->'resortInfo', '{}'::jsonb),
    'rooms', COALESCE(loc.data->'rooms', '{}'::jsonb),
    'pricing', COALESCE(loc.data->'pricing', '{}'::jsonb),
    'closedDates', COALESCE(loc.data->'closedDates', '[]'::jsonb),
    'reservations', res_data, 'packages', pkg_data,
    'settings', jsonb_build_object(
      'tourSettings', COALESCE(loc.data->'settings'->'tourSettings', '{"allowConcurrent": false, "duration": 30}'::jsonb),
      'daycareCapacity', COALESCE(loc.data->'settings'->'daycareCapacity', '{"small": 15, "large": 20, "total": 35}'::jsonb)
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION verify_otp_and_get_customer(p_phone TEXT, p_code TEXT, p_slug TEXT)
RETURNS JSONB AS $$
DECLARE
  otp_record RECORD; loc_id UUID; client_row RECORD; clean_phone TEXT;
BEGIN
  clean_phone := regexp_replace(p_phone, '[^0-9]', '', 'g');
  IF length(clean_phone) = 11 AND left(clean_phone, 1) = '1' THEN clean_phone := right(clean_phone, 10); END IF;

  SELECT * INTO otp_record FROM phone_otps
  WHERE regexp_replace(phone, '[^0-9]', '', 'g') LIKE '%' || clean_phone
    AND verified = false AND expires_at > now() ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'message', 'No pending verification found. Please request a new code.'); END IF;
  IF otp_record.attempts >= 3 THEN RETURN jsonb_build_object('success', false, 'message', 'Too many attempts. Please request a new code.'); END IF;
  UPDATE phone_otps SET attempts = attempts + 1 WHERE id = otp_record.id;
  IF otp_record.code != p_code THEN RETURN jsonb_build_object('success', false, 'message', 'Invalid code. Please try again.'); END IF;
  UPDATE phone_otps SET verified = true WHERE id = otp_record.id;

  SELECT id INTO loc_id FROM locations WHERE slug = p_slug LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'message', 'Location not found'); END IF;

  SELECT * INTO client_row FROM k9_clients c
  WHERE c.location_id = loc_id AND regexp_replace(c.phone, '[^0-9]', '', 'g') LIKE '%' || clean_phone LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'message', 'No account found for this phone number.'); END IF;

  RETURN _build_portal_data(loc_id, client_row.id, client_row);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION get_customer_portal_data(p_phone TEXT, p_slug TEXT)
RETURNS JSONB AS $$
DECLARE
  loc_id UUID; client_row RECORD; clean_phone TEXT;
BEGIN
  clean_phone := regexp_replace(p_phone, '[^0-9]', '', 'g');
  IF length(clean_phone) = 11 AND left(clean_phone, 1) = '1' THEN clean_phone := right(clean_phone, 10); END IF;

  SELECT id INTO loc_id FROM locations WHERE slug = p_slug LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'message', 'Location not found'); END IF;

  SELECT * INTO client_row FROM k9_clients c
  WHERE c.location_id = loc_id AND regexp_replace(c.phone, '[^0-9]', '', 'g') LIKE '%' || clean_phone LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'message', 'No account found for this phone number.'); END IF;

  RETURN _build_portal_data(loc_id, client_row.id, client_row);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION delete_location(p_location_id UUID)
RETURNS JSONB AS $$
DECLARE user_loc UUID; loc_name TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'enterprise_admin')) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Only owners can delete locations'); END IF;
  SELECT location_id INTO user_loc FROM profiles WHERE id = auth.uid();
  IF user_loc = p_location_id THEN
    RETURN jsonb_build_object('success', false, 'message', 'Cannot delete your currently active location.'); END IF;
  SELECT name INTO loc_name FROM locations WHERE id = p_location_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'message', 'Location not found'); END IF;
  IF lower(loc_name) = 'demo' OR EXISTS (SELECT 1 FROM locations WHERE id = p_location_id AND slug = 'demo') THEN
    RETURN jsonb_build_object('success', false, 'message', 'Demo location is protected.'); END IF;

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

  UPDATE profiles SET location_id = user_loc WHERE location_id = p_location_id;
  DELETE FROM locations WHERE id = p_location_id;
  RETURN jsonb_build_object('success', true, 'name', loc_name);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- Booking drafts: add DELETE policy for erase function
-- ============================================================
DROP POLICY IF EXISTS "Allow authenticated delete on booking_drafts" ON booking_drafts;
CREATE POLICY "Allow authenticated delete on booking_drafts" ON booking_drafts FOR DELETE USING (auth.role() = 'authenticated');

-- ============================================================
-- Enable realtime
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE k9_clients;
ALTER PUBLICATION supabase_realtime ADD TABLE k9_dogs;
ALTER PUBLICATION supabase_realtime ADD TABLE k9_reservations;
ALTER PUBLICATION supabase_realtime ADD TABLE k9_evaluations;
ALTER PUBLICATION supabase_realtime ADD TABLE k9_daily_ops;
ALTER PUBLICATION supabase_realtime ADD TABLE k9_payments;
ALTER PUBLICATION supabase_realtime ADD TABLE k9_packages;
ALTER PUBLICATION supabase_realtime ADD TABLE k9_package_sales;
ALTER PUBLICATION supabase_realtime ADD TABLE k9_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE k9_audit_log;
ALTER PUBLICATION supabase_realtime ADD TABLE k9_reminder_log;
