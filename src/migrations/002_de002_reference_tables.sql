-- =============================================================================
-- DE-002: Phase 1 — Reference / Lookup Tables
-- =============================================================================
-- Creates reference tables synced from Gingr:
--   - breeds: dog breed reference data (ADD COLUMNS to existing table)
--   - species: species types
--   - immunization_types: vaccination/immunization type definitions
--   - temperaments: temperament classifications
--
-- Purpose: Needed for dog detail display (CLM-006), Dog Detail Page Enhancement,
-- and enriching animal profiles across the app.
--
-- Note: gingr_breeds already exists in the current schema (20260313_gingr_sync_tables.sql).
-- This migration adds missing columns to the existing table via ALTER TABLE.
-- gingr_immunization_types also already exists; we add any missing columns.
-- =============================================================================

-- ─── breeds (ADD COLUMNS to existing table) ─────────────────────────────────
-- The gingr_breeds table already exists with (id, gingr_id TEXT, location_id TEXT, name TEXT).
-- We add the extra columns needed for enriched breed data.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'gingr_breeds' AND column_name = 'species_id'
  ) THEN
    ALTER TABLE gingr_breeds ADD COLUMN species_id TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'gingr_breeds' AND column_name = 'size_category'
  ) THEN
    ALTER TABLE gingr_breeds ADD COLUMN size_category TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'gingr_breeds' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE gingr_breeds ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'gingr_breeds' AND column_name = 'raw_data'
  ) THEN
    ALTER TABLE gingr_breeds ADD COLUMN raw_data JSONB DEFAULT '{}';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'gingr_breeds' AND column_name = 'synced_at'
  ) THEN
    ALTER TABLE gingr_breeds ADD COLUMN synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'gingr_breeds' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE gingr_breeds ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'gingr_breeds' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE gingr_breeds ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_gingr_breeds_species
  ON gingr_breeds(location_id, species_id);
CREATE INDEX IF NOT EXISTS idx_gingr_breeds_name
  ON gingr_breeds(location_id, name);


-- ─── species ────────────────────────────────────────────────────────────────
-- Species types from Gingr (dog, cat, etc.).

CREATE TABLE IF NOT EXISTS gingr_species (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  location_id     TEXT NOT NULL,
  gingr_id        TEXT,
  name            TEXT NOT NULL,           -- e.g. 'Dog', 'Cat', 'Bird'
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  raw_data        JSONB DEFAULT '{}',
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (location_id, gingr_id)
);

CREATE INDEX IF NOT EXISTS idx_gingr_species_location
  ON gingr_species(location_id);

ALTER TABLE gingr_species ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gingr_species_read" ON gingr_species;
CREATE POLICY "gingr_species_read" ON gingr_species FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "gingr_species_service" ON gingr_species;
CREATE POLICY "gingr_species_service" ON gingr_species FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ─── temperaments ───────────────────────────────────────────────────────────
-- Temperament classifications from Gingr (friendly, aggressive, shy, etc.).

CREATE TABLE IF NOT EXISTS gingr_temperaments (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  location_id     TEXT NOT NULL,
  gingr_id        TEXT,
  name            TEXT NOT NULL,           -- e.g. 'Friendly', 'Shy', 'Aggressive'
  description     TEXT,
  severity_level  INT,                     -- optional ranking for display/sorting
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  raw_data        JSONB DEFAULT '{}',
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (location_id, gingr_id)
);

CREATE INDEX IF NOT EXISTS idx_gingr_temperaments_location
  ON gingr_temperaments(location_id);

ALTER TABLE gingr_temperaments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gingr_temperaments_read" ON gingr_temperaments;
CREATE POLICY "gingr_temperaments_read" ON gingr_temperaments FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "gingr_temperaments_service" ON gingr_temperaments;
CREATE POLICY "gingr_temperaments_service" ON gingr_temperaments FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ─── Enhance existing gingr_immunization_types if needed ────────────────────
-- The table already exists; add any missing columns for completeness.

DO $$
BEGIN
  -- Add description column if not present
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'gingr_immunization_types' AND column_name = 'description'
  ) THEN
    ALTER TABLE gingr_immunization_types ADD COLUMN description TEXT;
  END IF;

  -- Add species_id column if not present (links immunization to species)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'gingr_immunization_types' AND column_name = 'species_id'
  ) THEN
    ALTER TABLE gingr_immunization_types ADD COLUMN species_id TEXT;
  END IF;

  -- Add validity_period_days if not present (how long the immunization is valid)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'gingr_immunization_types' AND column_name = 'validity_period_days'
  ) THEN
    ALTER TABLE gingr_immunization_types ADD COLUMN validity_period_days INT;
  END IF;
END $$;


-- ─── Sync state entries for new tables ──────────────────────────────────────

INSERT INTO gingr_sync_state (location_id, entity_type, last_sync_at, status)
SELECT location_id, 'breeds', NULL, 'pending'
FROM (SELECT DISTINCT location_id FROM gingr_sync_state) locs
WHERE NOT EXISTS (
  SELECT 1 FROM gingr_sync_state gs
  WHERE gs.location_id = locs.location_id AND gs.entity_type = 'breeds'
)
ON CONFLICT DO NOTHING;

INSERT INTO gingr_sync_state (location_id, entity_type, last_sync_at, status)
SELECT location_id, 'species', NULL, 'pending'
FROM (SELECT DISTINCT location_id FROM gingr_sync_state) locs
WHERE NOT EXISTS (
  SELECT 1 FROM gingr_sync_state gs
  WHERE gs.location_id = locs.location_id AND gs.entity_type = 'species'
)
ON CONFLICT DO NOTHING;

INSERT INTO gingr_sync_state (location_id, entity_type, last_sync_at, status)
SELECT location_id, 'temperaments', NULL, 'pending'
FROM (SELECT DISTINCT location_id FROM gingr_sync_state) locs
WHERE NOT EXISTS (
  SELECT 1 FROM gingr_sync_state gs
  WHERE gs.location_id = locs.location_id AND gs.entity_type = 'temperaments'
)
ON CONFLICT DO NOTHING;
