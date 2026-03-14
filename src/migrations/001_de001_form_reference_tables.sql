-- =============================================================================
-- DE-001: Phase 0 — Form Reference Tables
-- =============================================================================
-- Creates reference tables needed for forms:
--   - gingr_form_definitions: field definitions, validation rules, form configs
--   - gingr_icon_templates: icon templates for animal display (small/large dog)
--
-- Purpose: Foundation for Field Mapping module (CLM-004) and TV animal icon
-- differentiation (TV-003).
-- =============================================================================

-- ─── gingr_form_definitions ─────────────────────────────────────────────────
-- Stores form field definitions synced from Gingr: required fields, field types,
-- validation rules, and form configuration metadata.

CREATE TABLE IF NOT EXISTS gingr_form_definitions (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  location_id     UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  gingr_id        BIGINT,
  form_type       TEXT NOT NULL,           -- e.g. 'owner_registration', 'animal_profile', 'reservation'
  field_name      TEXT NOT NULL,           -- field identifier in Gingr
  field_label     TEXT,                    -- display label
  field_type      TEXT NOT NULL DEFAULT 'text', -- text, select, checkbox, date, number, etc.
  is_required     BOOLEAN NOT NULL DEFAULT FALSE,
  validation_rules JSONB DEFAULT '{}',     -- min/max length, regex patterns, allowed values
  display_order   INT DEFAULT 0,
  options         JSONB DEFAULT '[]',      -- dropdown/select options if applicable
  default_value   TEXT,
  section         TEXT,                    -- form section grouping
  raw_data        JSONB DEFAULT '{}',      -- full Gingr API response for this field
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (location_id, form_type, field_name)
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_gingr_form_defs_location
  ON gingr_form_definitions(location_id);
CREATE INDEX IF NOT EXISTS idx_gingr_form_defs_form_type
  ON gingr_form_definitions(location_id, form_type);

-- RLS policy: location-scoped access
ALTER TABLE gingr_form_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY gingr_form_definitions_location_policy
  ON gingr_form_definitions
  FOR ALL
  USING (location_id IN (
    SELECT location_id FROM user_locations WHERE user_id = auth.uid()
  ));


-- ─── gingr_icon_templates ───────────────────────────────────────────────────
-- Stores icon template definitions from Gingr used for animal display.
-- Used for visual differentiation on TV pages (small dog vs large dog icons).

CREATE TABLE IF NOT EXISTS gingr_icon_templates (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  location_id     UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  gingr_id        BIGINT,
  template_name   TEXT NOT NULL,           -- e.g. 'small_dog', 'large_dog', 'cat'
  icon_url        TEXT,                    -- URL or path to the icon asset
  icon_type       TEXT DEFAULT 'animal',   -- animal, service, status, etc.
  category        TEXT,                    -- grouping: 'playgroup', 'boarding', 'general'
  display_order   INT DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  metadata        JSONB DEFAULT '{}',      -- additional Gingr icon properties
  raw_data        JSONB DEFAULT '{}',      -- full Gingr API response
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (location_id, template_name)
);

CREATE INDEX IF NOT EXISTS idx_gingr_icon_templates_location
  ON gingr_icon_templates(location_id);
CREATE INDEX IF NOT EXISTS idx_gingr_icon_templates_type
  ON gingr_icon_templates(location_id, icon_type);

ALTER TABLE gingr_icon_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY gingr_icon_templates_location_policy
  ON gingr_icon_templates
  FOR ALL
  USING (location_id IN (
    SELECT location_id FROM user_locations WHERE user_id = auth.uid()
  ));


-- ─── Sync state entries for new tables ──────────────────────────────────────
-- Register these tables in gingr_sync_state so the sync engine tracks them.

INSERT INTO gingr_sync_state (location_id, entity_type, last_sync_at, status)
SELECT location_id, 'form_definitions', NULL, 'pending'
FROM (SELECT DISTINCT location_id FROM gingr_sync_state) locs
WHERE NOT EXISTS (
  SELECT 1 FROM gingr_sync_state gs
  WHERE gs.location_id = locs.location_id AND gs.entity_type = 'form_definitions'
)
ON CONFLICT DO NOTHING;

INSERT INTO gingr_sync_state (location_id, entity_type, last_sync_at, status)
SELECT location_id, 'icon_templates', NULL, 'pending'
FROM (SELECT DISTINCT location_id FROM gingr_sync_state) locs
WHERE NOT EXISTS (
  SELECT 1 FROM gingr_sync_state gs
  WHERE gs.location_id = locs.location_id AND gs.entity_type = 'icon_templates'
)
ON CONFLICT DO NOTHING;
