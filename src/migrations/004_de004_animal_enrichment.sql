-- =============================================================================
-- DE-004: Phase 3 — Animal Enrichment
-- =============================================================================
-- Creates animal enrichment tables synced from Gingr:
--   - gingr_feeding_schedules: dog feeding instructions and schedules
--   - gingr_medications: medication records for animals
--   - gingr_immunizations: actual immunization records per animal
--   - gingr_vets: veterinarian information linked to animals
--   - gingr_animal_icons: custom animal icons/photos (playgroup icons)
--
-- Purpose: Required for Dog Detail Page Enhancement (CLM-006), Large vs Small
-- Dog TV differentiation (TV-003), and complete animal profiles.
--
-- Dependencies: DE-002 (Phase 1 reference tables must be in place)
-- =============================================================================

-- ─── gingr_feeding_schedules ─────────────────────────────────────────────────
-- Dog feeding instructions and schedules synced from Gingr. Each record
-- represents feeding instructions for an individual animal.

CREATE TABLE IF NOT EXISTS gingr_feeding_schedules (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  location_id     UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  gingr_id        BIGINT,
  animal_gingr_id BIGINT NOT NULL,               -- FK to gingr_animals.gingr_id
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

-- RLS policy: location-scoped access
ALTER TABLE gingr_feeding_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY gingr_feeding_schedules_location_policy
  ON gingr_feeding_schedules
  FOR ALL
  USING (location_id IN (
    SELECT location_id FROM user_locations WHERE user_id = auth.uid()
  ));


-- ─── gingr_medications ───────────────────────────────────────────────────────
-- Medication records for animals synced from Gingr. Tracks active medications,
-- dosages, and administration instructions.

CREATE TABLE IF NOT EXISTS gingr_medications (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  location_id     UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  gingr_id        BIGINT,
  animal_gingr_id BIGINT NOT NULL,               -- FK to gingr_animals.gingr_id
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

CREATE POLICY gingr_medications_location_policy
  ON gingr_medications
  FOR ALL
  USING (location_id IN (
    SELECT location_id FROM user_locations WHERE user_id = auth.uid()
  ));


-- ─── gingr_immunizations ─────────────────────────────────────────────────────
-- Actual immunization records per animal synced from Gingr. Links to
-- gingr_immunization_types for the type definition.

CREATE TABLE IF NOT EXISTS gingr_immunizations (
  id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  location_id             UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  gingr_id                BIGINT,
  animal_gingr_id         BIGINT NOT NULL,        -- FK to gingr_animals.gingr_id
  immunization_type_gingr_id BIGINT,              -- FK to gingr_immunization_types.gingr_id
  vaccination_name        TEXT,                    -- name/label of the vaccination
  date_administered       DATE,
  expiration_date         DATE,                    -- when this immunization expires
  administered_by         TEXT,                    -- vet or clinic name
  lot_number              TEXT,                    -- vaccine lot number
  is_verified             BOOLEAN NOT NULL DEFAULT FALSE,
  verification_notes      TEXT,                    -- notes on verification status
  raw_data                JSONB DEFAULT '{}',      -- full Gingr API response
  synced_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (location_id, gingr_id)
);

CREATE INDEX IF NOT EXISTS idx_gingr_immunizations_location
  ON gingr_immunizations(location_id);
CREATE INDEX IF NOT EXISTS idx_gingr_immunizations_animal
  ON gingr_immunizations(location_id, animal_gingr_id);
CREATE INDEX IF NOT EXISTS idx_gingr_immunizations_type
  ON gingr_immunizations(location_id, immunization_type_gingr_id);
CREATE INDEX IF NOT EXISTS idx_gingr_immunizations_expiration
  ON gingr_immunizations(location_id, expiration_date);

ALTER TABLE gingr_immunizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY gingr_immunizations_location_policy
  ON gingr_immunizations
  FOR ALL
  USING (location_id IN (
    SELECT location_id FROM user_locations WHERE user_id = auth.uid()
  ));


-- ─── gingr_vets ──────────────────────────────────────────────────────────────
-- Veterinarian contact information linked to animals, synced from Gingr.
-- Each animal can have one or more associated vets.

CREATE TABLE IF NOT EXISTS gingr_vets (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  location_id     UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  gingr_id        BIGINT,
  animal_gingr_id BIGINT,                        -- FK to gingr_animals.gingr_id (nullable for shared vets)
  owner_gingr_id  BIGINT,                        -- FK to gingr_owners.gingr_id
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

CREATE POLICY gingr_vets_location_policy
  ON gingr_vets
  FOR ALL
  USING (location_id IN (
    SELECT location_id FROM user_locations WHERE user_id = auth.uid()
  ));


-- ─── gingr_animal_icons ──────────────────────────────────────────────────────
-- Custom animal icons and photos synced from Gingr. Includes playgroup icons
-- (small/large dog) used for TV differentiation and individual animal photos.

CREATE TABLE IF NOT EXISTS gingr_animal_icons (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  location_id     UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  gingr_id        BIGINT,
  animal_gingr_id BIGINT NOT NULL,               -- FK to gingr_animals.gingr_id
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

CREATE POLICY gingr_animal_icons_location_policy
  ON gingr_animal_icons
  FOR ALL
  USING (location_id IN (
    SELECT location_id FROM user_locations WHERE user_id = auth.uid()
  ));


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
