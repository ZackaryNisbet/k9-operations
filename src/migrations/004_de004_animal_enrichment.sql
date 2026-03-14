-- =============================================================================
-- DE-004: Phase 3 — Animal Enrichment
-- =============================================================================
-- Creates animal enrichment tables synced from Gingr:
--   - gingr_feeding_schedules: dog feeding instructions and schedules
--   - gingr_medications: medication records for animals
--   - gingr_immunizations: ADD COLUMNS to existing table for enriched records
--   - gingr_vets: veterinarian information linked to animals
--   - gingr_animal_icons: custom animal icons/photos (playgroup icons)
--
-- Purpose: Required for Dog Detail Page Enhancement (CLM-006), Large vs Small
-- Dog TV differentiation (TV-003), and complete animal profiles.
--
-- Dependencies: DE-002 (Phase 1 reference tables must be in place)
--
-- Note: gingr_immunizations already exists in the current schema
-- (20260313_gingr_sync_tables.sql). This migration adds missing columns
-- via ALTER TABLE instead of creating a conflicting table.
-- =============================================================================

-- ─── gingr_feeding_schedules ─────────────────────────────────────────────────
-- Dog feeding instructions and schedules synced from Gingr. Each record
-- represents feeding instructions for an individual animal.

CREATE TABLE IF NOT EXISTS gingr_feeding_schedules (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  location_id     TEXT NOT NULL,
  gingr_id        TEXT,
  animal_gingr_id TEXT NOT NULL,                  -- FK to gingr_animals.gingr_id
  food_type       TEXT,                           -- dry, wet, raw, prescription, etc.
  food_brand      TEXT,                           -- brand/product name
  amount          TEXT,                           -- e.g. '1 cup', '0.5 can'
  frequency       TEXT,                           -- e.g. 'twice daily', 'morning only'
  schedule_time   TEXT,                           -- e.g. '7:00 AM', 'morning', 'evening'
  special_instructions TEXT,                      -- allergies, mixing instructions, etc.
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  raw_data        JSONB DEFAULT '{}',             -- full Gingr API response
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (location_id, gingr_id)
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_gingr_feeding_schedules_location
  ON gingr_feeding_schedules(location_id);
CREATE INDEX IF NOT EXISTS idx_gingr_feeding_schedules_animal
  ON gingr_feeding_schedules(location_id, animal_gingr_id);

-- RLS policy: authenticated read + service_role write (matches existing pattern)
ALTER TABLE gingr_feeding_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gingr_feeding_schedules_read" ON gingr_feeding_schedules;
CREATE POLICY "gingr_feeding_schedules_read" ON gingr_feeding_schedules FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "gingr_feeding_schedules_service" ON gingr_feeding_schedules;
CREATE POLICY "gingr_feeding_schedules_service" ON gingr_feeding_schedules FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ─── gingr_medications ───────────────────────────────────────────────────────
-- Medication records for animals synced from Gingr. Tracks active medications,
-- dosages, and administration instructions.

CREATE TABLE IF NOT EXISTS gingr_medications (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  location_id     TEXT NOT NULL,
  gingr_id        TEXT,
  animal_gingr_id TEXT NOT NULL,                  -- FK to gingr_animals.gingr_id
  medication_name TEXT NOT NULL,
  dosage          TEXT,                           -- e.g. '10mg', '1 tablet'
  frequency       TEXT,                           -- e.g. 'twice daily', 'as needed'
  administration_route TEXT,                      -- oral, topical, injection, etc.
  start_date      DATE,
  end_date        DATE,                           -- NULL if ongoing
  special_instructions TEXT,                      -- timing, food requirements, etc.
  prescribed_by   TEXT,                           -- vet name or reference
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  raw_data        JSONB DEFAULT '{}',             -- full Gingr API response
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (location_id, gingr_id)
);

CREATE INDEX IF NOT EXISTS idx_gingr_medications_location
  ON gingr_medications(location_id);
CREATE INDEX IF NOT EXISTS idx_gingr_medications_animal
  ON gingr_medications(location_id, animal_gingr_id);
CREATE INDEX IF NOT EXISTS idx_gingr_medications_active
  ON gingr_medications(location_id, is_active);

ALTER TABLE gingr_medications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gingr_medications_read" ON gingr_medications;
CREATE POLICY "gingr_medications_read" ON gingr_medications FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "gingr_medications_service" ON gingr_medications;
CREATE POLICY "gingr_medications_service" ON gingr_medications FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ─── gingr_immunizations (ADD COLUMNS to existing table) ─────────────────────
-- The gingr_immunizations table already exists with:
--   (id, gingr_id TEXT, location_id TEXT, animal_gingr_id TEXT, type_name,
--    type_id, expiration_date BIGINT, formatted_expiry, last_updated_at,
--    updated_by, note, synced_at)
-- We add extra columns needed for enriched immunization records.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'gingr_immunizations' AND column_name = 'immunization_type_gingr_id'
  ) THEN
    ALTER TABLE gingr_immunizations ADD COLUMN immunization_type_gingr_id TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'gingr_immunizations' AND column_name = 'vaccination_name'
  ) THEN
    ALTER TABLE gingr_immunizations ADD COLUMN vaccination_name TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'gingr_immunizations' AND column_name = 'date_administered'
  ) THEN
    ALTER TABLE gingr_immunizations ADD COLUMN date_administered DATE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'gingr_immunizations' AND column_name = 'expiration_date_formatted'
  ) THEN
    ALTER TABLE gingr_immunizations ADD COLUMN expiration_date_formatted DATE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'gingr_immunizations' AND column_name = 'administered_by'
  ) THEN
    ALTER TABLE gingr_immunizations ADD COLUMN administered_by TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'gingr_immunizations' AND column_name = 'lot_number'
  ) THEN
    ALTER TABLE gingr_immunizations ADD COLUMN lot_number TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'gingr_immunizations' AND column_name = 'is_verified'
  ) THEN
    ALTER TABLE gingr_immunizations ADD COLUMN is_verified BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'gingr_immunizations' AND column_name = 'verification_notes'
  ) THEN
    ALTER TABLE gingr_immunizations ADD COLUMN verification_notes TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'gingr_immunizations' AND column_name = 'raw_data'
  ) THEN
    ALTER TABLE gingr_immunizations ADD COLUMN raw_data JSONB DEFAULT '{}';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'gingr_immunizations' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE gingr_immunizations ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'gingr_immunizations' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE gingr_immunizations ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_gingr_immunizations_type
  ON gingr_immunizations(location_id, immunization_type_gingr_id);
CREATE INDEX IF NOT EXISTS idx_gingr_immunizations_expiration_fmt
  ON gingr_immunizations(location_id, expiration_date_formatted);


-- ─── gingr_vets ──────────────────────────────────────────────────────────────
-- Veterinarian contact information linked to animals, synced from Gingr.
-- Each animal can have one or more associated vets.

CREATE TABLE IF NOT EXISTS gingr_vets (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  location_id     TEXT NOT NULL,
  gingr_id        TEXT,
  animal_gingr_id TEXT,                           -- FK to gingr_animals.gingr_id (nullable for shared vets)
  owner_gingr_id  TEXT,                           -- FK to gingr_owners.gingr_id
  vet_name        TEXT NOT NULL,
  clinic_name     TEXT,
  phone           TEXT,
  email           TEXT,
  address         TEXT,
  city            TEXT,
  state           TEXT,
  zip             TEXT,
  is_primary      BOOLEAN NOT NULL DEFAULT FALSE, -- primary vet for this animal
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  raw_data        JSONB DEFAULT '{}',             -- full Gingr API response
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (location_id, gingr_id)
);

CREATE INDEX IF NOT EXISTS idx_gingr_vets_location
  ON gingr_vets(location_id);
CREATE INDEX IF NOT EXISTS idx_gingr_vets_animal
  ON gingr_vets(location_id, animal_gingr_id);
CREATE INDEX IF NOT EXISTS idx_gingr_vets_owner
  ON gingr_vets(location_id, owner_gingr_id);

ALTER TABLE gingr_vets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gingr_vets_read" ON gingr_vets;
CREATE POLICY "gingr_vets_read" ON gingr_vets FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "gingr_vets_service" ON gingr_vets;
CREATE POLICY "gingr_vets_service" ON gingr_vets FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ─── gingr_animal_icons ──────────────────────────────────────────────────────
-- Custom animal icons and photos synced from Gingr. Includes playgroup icons
-- (small/large dog) used for TV differentiation and individual animal photos.

CREATE TABLE IF NOT EXISTS gingr_animal_icons (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  location_id     TEXT NOT NULL,
  gingr_id        TEXT,
  animal_gingr_id TEXT NOT NULL,                  -- FK to gingr_animals.gingr_id
  icon_url        TEXT,                           -- URL or path to the icon/photo
  icon_type       TEXT NOT NULL DEFAULT 'photo',  -- photo, playgroup_icon, profile_icon
  is_primary      BOOLEAN NOT NULL DEFAULT FALSE, -- primary display icon for this animal
  upload_date     TIMESTAMPTZ,
  file_size       INT,                            -- file size in bytes
  mime_type       TEXT,                            -- image/jpeg, image/png, etc.
  raw_data        JSONB DEFAULT '{}',             -- full Gingr API response
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (location_id, gingr_id)
);

CREATE INDEX IF NOT EXISTS idx_gingr_animal_icons_location
  ON gingr_animal_icons(location_id);
CREATE INDEX IF NOT EXISTS idx_gingr_animal_icons_animal
  ON gingr_animal_icons(location_id, animal_gingr_id);
CREATE INDEX IF NOT EXISTS idx_gingr_animal_icons_type
  ON gingr_animal_icons(location_id, icon_type);

ALTER TABLE gingr_animal_icons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gingr_animal_icons_read" ON gingr_animal_icons;
CREATE POLICY "gingr_animal_icons_read" ON gingr_animal_icons FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "gingr_animal_icons_service" ON gingr_animal_icons;
CREATE POLICY "gingr_animal_icons_service" ON gingr_animal_icons FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ─── Sync state entries for new tables ──────────────────────────────────────
-- Register these tables in gingr_sync_state so the sync engine tracks them.

INSERT INTO gingr_sync_state (location_id, entity_type, last_sync_at, status)
SELECT location_id, 'feeding_schedules', NULL, 'pending'
FROM (SELECT DISTINCT location_id FROM gingr_sync_state) locs
WHERE NOT EXISTS (
  SELECT 1 FROM gingr_sync_state gs
  WHERE gs.location_id = locs.location_id AND gs.entity_type = 'feeding_schedules'
)
ON CONFLICT DO NOTHING;

INSERT INTO gingr_sync_state (location_id, entity_type, last_sync_at, status)
SELECT location_id, 'medications', NULL, 'pending'
FROM (SELECT DISTINCT location_id FROM gingr_sync_state) locs
WHERE NOT EXISTS (
  SELECT 1 FROM gingr_sync_state gs
  WHERE gs.location_id = locs.location_id AND gs.entity_type = 'medications'
)
ON CONFLICT DO NOTHING;

INSERT INTO gingr_sync_state (location_id, entity_type, last_sync_at, status)
SELECT location_id, 'immunizations', NULL, 'pending'
FROM (SELECT DISTINCT location_id FROM gingr_sync_state) locs
WHERE NOT EXISTS (
  SELECT 1 FROM gingr_sync_state gs
  WHERE gs.location_id = locs.location_id AND gs.entity_type = 'immunizations'
)
ON CONFLICT DO NOTHING;

INSERT INTO gingr_sync_state (location_id, entity_type, last_sync_at, status)
SELECT location_id, 'vets', NULL, 'pending'
FROM (SELECT DISTINCT location_id FROM gingr_sync_state) locs
WHERE NOT EXISTS (
  SELECT 1 FROM gingr_sync_state gs
  WHERE gs.location_id = locs.location_id AND gs.entity_type = 'vets'
)
ON CONFLICT DO NOTHING;

INSERT INTO gingr_sync_state (location_id, entity_type, last_sync_at, status)
SELECT location_id, 'animal_icons', NULL, 'pending'
FROM (SELECT DISTINCT location_id FROM gingr_sync_state) locs
WHERE NOT EXISTS (
  SELECT 1 FROM gingr_sync_state gs
  WHERE gs.location_id = locs.location_id AND gs.entity_type = 'animal_icons'
)
ON CONFLICT DO NOTHING;
