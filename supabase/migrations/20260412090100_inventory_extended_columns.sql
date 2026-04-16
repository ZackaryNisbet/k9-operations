-- Adds missing columns to inventory_counts and creates inventory_depletion_rates.
-- These columns/table are already referenced by InventoryPage.jsx but were never
-- migrated, causing silent data loss on ordered/skipped state and audit fields.

-- ═══════════════════════════════════════════════════════════════════════
-- 1. Extend inventory_counts with ordered/skipped tracking + audit fields
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE inventory_counts ADD COLUMN IF NOT EXISTS ordered     boolean     DEFAULT false;
ALTER TABLE inventory_counts ADD COLUMN IF NOT EXISTS counted_by  text;
ALTER TABLE inventory_counts ADD COLUMN IF NOT EXISTS counted_at  timestamptz;
ALTER TABLE inventory_counts ADD COLUMN IF NOT EXISTS ordered_by  text;
ALTER TABLE inventory_counts ADD COLUMN IF NOT EXISTS ordered_at  timestamptz;
ALTER TABLE inventory_counts ADD COLUMN IF NOT EXISTS skipped     boolean     DEFAULT false;
ALTER TABLE inventory_counts ADD COLUMN IF NOT EXISTS skipped_by  text;
ALTER TABLE inventory_counts ADD COLUMN IF NOT EXISTS skipped_at  timestamptz;

-- ═══════════════════════════════════════════════════════════════════════
-- 2. inventory_depletion_rates — weekly per-item depletion tracking
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS inventory_depletion_rates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id     text NOT NULL,
  catalog_item_id uuid NOT NULL REFERENCES inventory_catalog(id) ON DELETE CASCADE,
  week_start      date NOT NULL,
  opening_stock   integer DEFAULT 0,
  closing_stock   integer DEFAULT 0,
  received        integer DEFAULT 0,
  depletion       integer DEFAULT 0,
  dog_days        integer DEFAULT 0,
  rate_per_dog_day numeric(10,4),
  created_at      timestamptz DEFAULT now(),
  CONSTRAINT uq_depletion_location_item_week UNIQUE (location_id, catalog_item_id, week_start)
);

ALTER TABLE inventory_depletion_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read inventory_depletion_rates"
  ON inventory_depletion_rates FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert inventory_depletion_rates"
  ON inventory_depletion_rates FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update inventory_depletion_rates"
  ON inventory_depletion_rates FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete inventory_depletion_rates"
  ON inventory_depletion_rates FOR DELETE TO authenticated USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_depletion_location_week
  ON inventory_depletion_rates(location_id, week_start);
CREATE INDEX IF NOT EXISTS idx_depletion_catalog_item
  ON inventory_depletion_rates(catalog_item_id);
