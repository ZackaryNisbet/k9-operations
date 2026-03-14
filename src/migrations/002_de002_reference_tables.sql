-- =============================================================================
-- DE-002: Phase 1 — Reference / Lookup Tables
-- =============================================================================
-- Creates reference tables synced from Gingr:
--   - breeds: dog breed reference data
--   - species: species types
--   - immunization_types: vaccination/immunization type definitions
--   - temperaments: temperament classifications
--
-- Purpose: Needed for dog detail display (CLM-006), Dog Detail Page Enhancement,
-- and enriching animal profiles across the app.
--
-- Note: gingr_immunization_types already exists in the current schema. This
-- migration creates the remaining reference tables and ensures immunization_types
-- has all needed columns.
-- =============================================================================

-- ─── breeds ─────────────────────────────────────────────────────────────────
-- Dog breed reference data synced from Gingr.

CREATE TABLE IF NOT EXISTS gingr_breeds (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  location_id     UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  gingr_id        BIGINT,
  name            TEXT NOT NULL,
  species_id      BIGINT,                  -- FK to gingr_species.gingr_id
  size_category   TEXT,                    -- small, medium, large, giant
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  raw_data        JSONB DEFAULT '{}',
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (location_id, gingr_id)
);

CREATE INDEX IF NOT EXISTS idx_gingr_breeds_location
  ON gingr_breeds(location_id);
CREATE INDEX IF NOT EXISTS idx_gingr_breeds_species
  ON gingr_breeds(location_id, species_id);
CREATE INDEX IF NOT EXISTS idx_gingr_breeds_name
  ON gingr_breeds(location_id, name);

ALTER TABLE gingr_breeds ENABLE ROW LEVEL SECURITY;

CREATE POLICY gingr_breeds_location_policy
  ON gingr_breeds
  FOR ALL
  USING (location_id IN (
    SELECT location_id FROM user_locations WHERE user_id = auth.uid()
  ));


-- ─── species ────────────────────────────────────────────────────────────────
-- Species types from Gingr (dog, cat, etc.).

CREATE TABLE IF NOT EXISTS gingr_species (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  location_id     UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  gingr_id        BIGINT,
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

CREATE POLICY gingr_species_location_policy
  ON gingr_species
  FOR ALL
  USING (location_id IN (
    SELECT location_id FROM user_locations WHERE user_id = auth.uid()
  ));


-- ─── temperaments ───────────────────────────────────────────────────────────
-- Temperament classifications from Gingr (friendly, aggressive, shy, etc.).

CREATE TABLE IF NOT EXISTS gingr_temperaments (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  location_id     UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  gingr_id        BIGINT,
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

CREATE POLICY gingr_temperaments_location_policy
  ON gingr_temperaments
  FOR ALL
  USING (location_id IN (
    SELECT location_id FROM user_locations WHERE user_id = auth.uid()
  ));


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
    ALTER TABLE gingr_immunization_types ADD COLUMN species_id BIGINT;
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
