-- ============================================================================
-- Gingr API Sync Tables for K9 Operations Lite
-- Cherry Hill first deployment — schema supports multi-location
-- ============================================================================

-- ─── Gingr Owners (Customers) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gingr_owners (
  id            BIGSERIAL PRIMARY KEY,
  gingr_id      TEXT NOT NULL,
  location_id   TEXT NOT NULL,
  first_name    TEXT,
  last_name     TEXT,
  email         TEXT,
  cell_phone    TEXT,
  home_phone    TEXT,
  emergency_contact_name  TEXT,
  emergency_contact_phone TEXT,
  address_1     TEXT,
  address_2     TEXT,
  city          TEXT,
  state         TEXT,
  zip           TEXT,
  current_balance NUMERIC(10,2) DEFAULT 0,
  home_location TEXT,
  animal_names  TEXT,
  last_reservation TIMESTAMPTZ,
  next_reservation TIMESTAMPTZ,
  number_reservations INTEGER DEFAULT 0,
  owner_created_at TIMESTAMPTZ,
  source        TEXT,
  opt_out_email BOOLEAN DEFAULT false,
  opt_out_sms   BOOLEAN DEFAULT false,
  opt_out_marketing_email BOOLEAN DEFAULT false,
  opt_out_marketing_sms   BOOLEAN DEFAULT false,
  raw_data      JSONB,
  synced_at     TIMESTAMPTZ DEFAULT NOW(),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(location_id, gingr_id)
);

CREATE INDEX IF NOT EXISTS idx_gingr_owners_location ON gingr_owners(location_id);
CREATE INDEX IF NOT EXISTS idx_gingr_owners_email ON gingr_owners(email);
CREATE INDEX IF NOT EXISTS idx_gingr_owners_last_res ON gingr_owners(last_reservation);
CREATE INDEX IF NOT EXISTS idx_gingr_owners_name ON gingr_owners(location_id, last_name, first_name);

-- ─── Gingr Animals (Dogs) ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gingr_animals (
  id            BIGSERIAL PRIMARY KEY,
  gingr_id      TEXT NOT NULL,
  location_id   TEXT NOT NULL,
  owner_gingr_id TEXT NOT NULL,
  name          TEXT,
  breed_id      TEXT,
  breed_name    TEXT,
  species_id    TEXT,
  gender        TEXT,
  fixed         BOOLEAN DEFAULT false,
  birthday      BIGINT,
  weight        TEXT,
  image_url     TEXT,
  vip           BOOLEAN DEFAULT false,
  banned        BOOLEAN DEFAULT false,
  medicines     TEXT,
  allergies     TEXT,
  notes         TEXT,
  grooming_notes TEXT,
  next_immunization_expiration BIGINT,
  last_reservation TIMESTAMPTZ,
  next_reservation TIMESTAMPTZ,
  number_reservations INTEGER DEFAULT 0,
  owner_first_name TEXT,
  owner_last_name  TEXT,
  raw_data      JSONB,
  synced_at     TIMESTAMPTZ DEFAULT NOW(),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(location_id, gingr_id)
);

CREATE INDEX IF NOT EXISTS idx_gingr_animals_location ON gingr_animals(location_id);
CREATE INDEX IF NOT EXISTS idx_gingr_animals_owner ON gingr_animals(location_id, owner_gingr_id);
CREATE INDEX IF NOT EXISTS idx_gingr_animals_name ON gingr_animals(location_id, name);

-- ─── Gingr Reservations ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gingr_reservations (
  id            BIGSERIAL PRIMARY KEY,
  gingr_id      TEXT NOT NULL,
  location_id   TEXT NOT NULL,
  owner_gingr_id TEXT,
  animal_gingr_id TEXT,
  reservation_type_id TEXT,
  reservation_type_name TEXT,
  start_date    TIMESTAMPTZ,
  end_date      TIMESTAMPTZ,
  check_in_date TIMESTAMPTZ,
  check_out_date TIMESTAMPTZ,
  cancelled_date TIMESTAMPTZ,
  confirmed_date TIMESTAMPTZ,
  created_date  TIMESTAMPTZ,
  standing_reservation BOOLEAN DEFAULT false,
  owner_first_name TEXT,
  owner_last_name  TEXT,
  owner_email   TEXT,
  animal_name   TEXT,
  animal_breed  TEXT,
  notes_reservation TEXT,
  notes_animal  TEXT,
  notes_owner   TEXT,
  services      JSONB,
  deposit       JSONB,
  transaction   JSONB,
  raw_data      JSONB,
  synced_at     TIMESTAMPTZ DEFAULT NOW(),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(location_id, gingr_id)
);

CREATE INDEX IF NOT EXISTS idx_gingr_res_location ON gingr_reservations(location_id);
CREATE INDEX IF NOT EXISTS idx_gingr_res_dates ON gingr_reservations(location_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_gingr_res_owner ON gingr_reservations(location_id, owner_gingr_id);
CREATE INDEX IF NOT EXISTS idx_gingr_res_animal ON gingr_reservations(location_id, animal_gingr_id);
CREATE INDEX IF NOT EXISTS idx_gingr_res_type ON gingr_reservations(location_id, reservation_type_id);
CREATE INDEX IF NOT EXISTS idx_gingr_res_checkin ON gingr_reservations(check_in_date);
CREATE INDEX IF NOT EXISTS idx_gingr_res_checkout ON gingr_reservations(check_out_date);

-- ─── Gingr Immunizations ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gingr_immunizations (
  id            BIGSERIAL PRIMARY KEY,
  gingr_id      TEXT NOT NULL,
  location_id   TEXT NOT NULL,
  animal_gingr_id TEXT NOT NULL,
  type_name     TEXT,
  type_id       TEXT,
  expiration_date BIGINT,
  formatted_expiry TEXT,
  last_updated_at BIGINT,
  updated_by    TEXT,
  note          TEXT,
  synced_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(location_id, gingr_id)
);

CREATE INDEX IF NOT EXISTS idx_gingr_imm_animal ON gingr_immunizations(location_id, animal_gingr_id);

-- ─── Reference: Reservation Types ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gingr_reservation_types (
  id            BIGSERIAL PRIMARY KEY,
  gingr_id      TEXT NOT NULL,
  location_id   TEXT NOT NULL,
  name          TEXT,
  type_label    TEXT,
  color         TEXT,
  is_boarding   BOOLEAN DEFAULT false,
  is_daycare    BOOLEAN DEFAULT false,
  is_grooming   BOOLEAN DEFAULT false,
  single_day    BOOLEAN DEFAULT false,
  status        TEXT,
  raw_data      JSONB,
  synced_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(location_id, gingr_id)
);

-- ─── Reference: Breeds ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gingr_breeds (
  id            BIGSERIAL PRIMARY KEY,
  gingr_id      TEXT NOT NULL,
  location_id   TEXT NOT NULL,
  name          TEXT,
  UNIQUE(location_id, gingr_id)
);

-- ─── Reference: Immunization Types ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gingr_immunization_types (
  id            BIGSERIAL PRIMARY KEY,
  gingr_id      TEXT NOT NULL,
  location_id   TEXT NOT NULL,
  name          TEXT,
  required      BOOLEAN DEFAULT false,
  UNIQUE(location_id, gingr_id)
);

-- ─── Sync State Tracking ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gingr_sync_state (
  id            BIGSERIAL PRIMARY KEY,
  location_id   TEXT NOT NULL,
  entity_type   TEXT NOT NULL,  -- 'owners', 'animals', 'reservations', 'immunizations', 'reference'
  last_sync_at  TIMESTAMPTZ,
  last_full_sync_at TIMESTAMPTZ,
  records_synced INTEGER DEFAULT 0,
  status        TEXT DEFAULT 'idle',  -- 'idle', 'syncing', 'error'
  error_message TEXT,
  sync_duration_ms INTEGER,
  UNIQUE(location_id, entity_type)
);

-- ─── RLS Policies ──────────────────────────────────────────────────────────
ALTER TABLE gingr_owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE gingr_animals ENABLE ROW LEVEL SECURITY;
ALTER TABLE gingr_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE gingr_immunizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE gingr_reservation_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE gingr_breeds ENABLE ROW LEVEL SECURITY;
ALTER TABLE gingr_immunization_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE gingr_sync_state ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read all gingr data
-- (location-level filtering happens in app queries)
DROP POLICY IF EXISTS "gingr_owners_read" ON gingr_owners;
CREATE POLICY "gingr_owners_read" ON gingr_owners FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "gingr_animals_read" ON gingr_animals;
CREATE POLICY "gingr_animals_read" ON gingr_animals FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "gingr_reservations_read" ON gingr_reservations;
CREATE POLICY "gingr_reservations_read" ON gingr_reservations FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "gingr_immunizations_read" ON gingr_immunizations;
CREATE POLICY "gingr_immunizations_read" ON gingr_immunizations FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "gingr_reservation_types_read" ON gingr_reservation_types;
CREATE POLICY "gingr_reservation_types_read" ON gingr_reservation_types FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "gingr_breeds_read" ON gingr_breeds;
CREATE POLICY "gingr_breeds_read" ON gingr_breeds FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "gingr_immunization_types_read" ON gingr_immunization_types;
CREATE POLICY "gingr_immunization_types_read" ON gingr_immunization_types FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "gingr_sync_state_read" ON gingr_sync_state;
CREATE POLICY "gingr_sync_state_read" ON gingr_sync_state FOR SELECT TO authenticated USING (true);

-- Allow service_role (Edge Functions) to do everything
DROP POLICY IF EXISTS "gingr_owners_service" ON gingr_owners;
CREATE POLICY "gingr_owners_service" ON gingr_owners FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "gingr_animals_service" ON gingr_animals;
CREATE POLICY "gingr_animals_service" ON gingr_animals FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "gingr_reservations_service" ON gingr_reservations;
CREATE POLICY "gingr_reservations_service" ON gingr_reservations FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "gingr_immunizations_service" ON gingr_immunizations;
CREATE POLICY "gingr_immunizations_service" ON gingr_immunizations FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "gingr_reservation_types_service" ON gingr_reservation_types;
CREATE POLICY "gingr_reservation_types_service" ON gingr_reservation_types FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "gingr_breeds_service" ON gingr_breeds;
CREATE POLICY "gingr_breeds_service" ON gingr_breeds FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "gingr_immunization_types_service" ON gingr_immunization_types;
CREATE POLICY "gingr_immunization_types_service" ON gingr_immunization_types FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "gingr_sync_state_service" ON gingr_sync_state;
CREATE POLICY "gingr_sync_state_service" ON gingr_sync_state FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Also allow authenticated users to trigger sync (update sync_state)
DROP POLICY IF EXISTS "gingr_sync_state_write" ON gingr_sync_state;
CREATE POLICY "gingr_sync_state_write" ON gingr_sync_state FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── Updated_at triggers ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_gingr_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER gingr_owners_updated_at BEFORE UPDATE ON gingr_owners
  FOR EACH ROW EXECUTE FUNCTION update_gingr_updated_at();
CREATE TRIGGER gingr_animals_updated_at BEFORE UPDATE ON gingr_animals
  FOR EACH ROW EXECUTE FUNCTION update_gingr_updated_at();
CREATE TRIGGER gingr_reservations_updated_at BEFORE UPDATE ON gingr_reservations
  FOR EACH ROW EXECUTE FUNCTION update_gingr_updated_at();
