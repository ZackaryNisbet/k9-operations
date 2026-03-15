-- 007: Inventory Management Tables
-- Creates inventory_catalog, inventory_snapshots, inventory_counts, inventory_adhoc_items
-- with RLS policies for authenticated access.

-- ═══════════════════════════════════════════════════════════════════════
-- 1. inventory_catalog — Master item catalog (shared across weeks)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS inventory_catalog (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id   text NOT NULL,
  item_name     text NOT NULL,
  size          text,
  vendor        text,
  category      text,
  subcategory   text,
  gl_account    text,
  par_level     integer DEFAULT 0,
  min_reorder   integer DEFAULT 0,
  unit_price    numeric(10,2) DEFAULT 0,
  vendor_link   text,
  is_active     boolean DEFAULT true,
  sort_order    integer DEFAULT 0,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

ALTER TABLE inventory_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read inventory_catalog"
  ON inventory_catalog FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert inventory_catalog"
  ON inventory_catalog FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update inventory_catalog"
  ON inventory_catalog FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete inventory_catalog"
  ON inventory_catalog FOR DELETE TO authenticated USING (true);

-- ═══════════════════════════════════════════════════════════════════════
-- 2. inventory_snapshots — Weekly inventory count snapshots
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS inventory_snapshots (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id   text NOT NULL,
  week_start    date NOT NULL,
  completed_at  timestamptz,
  completed_by  text,
  dog_count     integer DEFAULT 0,
  notes         text,
  status        text DEFAULT 'in_progress',
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE inventory_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read inventory_snapshots"
  ON inventory_snapshots FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert inventory_snapshots"
  ON inventory_snapshots FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update inventory_snapshots"
  ON inventory_snapshots FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete inventory_snapshots"
  ON inventory_snapshots FOR DELETE TO authenticated USING (true);

-- ═══════════════════════════════════════════════════════════════════════
-- 3. inventory_counts — Individual item counts per snapshot
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS inventory_counts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id     uuid NOT NULL REFERENCES inventory_snapshots(id) ON DELETE CASCADE,
  catalog_item_id uuid NOT NULL REFERENCES inventory_catalog(id) ON DELETE CASCADE,
  stock_count     integer DEFAULT 0,
  in_transit      integer DEFAULT 0,
  to_order        integer DEFAULT 0,
  notes           text,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE inventory_counts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read inventory_counts"
  ON inventory_counts FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert inventory_counts"
  ON inventory_counts FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update inventory_counts"
  ON inventory_counts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete inventory_counts"
  ON inventory_counts FOR DELETE TO authenticated USING (true);

-- ═══════════════════════════════════════════════════════════════════════
-- 4. inventory_adhoc_items — One-off items for a specific week
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS inventory_adhoc_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id     uuid NOT NULL REFERENCES inventory_snapshots(id) ON DELETE CASCADE,
  item_name       text NOT NULL,
  category        text,
  stock_count     integer DEFAULT 0,
  unit_price      numeric(10,2) DEFAULT 0,
  notes           text,
  add_to_catalog  boolean DEFAULT false,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE inventory_adhoc_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read inventory_adhoc_items"
  ON inventory_adhoc_items FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert inventory_adhoc_items"
  ON inventory_adhoc_items FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update inventory_adhoc_items"
  ON inventory_adhoc_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete inventory_adhoc_items"
  ON inventory_adhoc_items FOR DELETE TO authenticated USING (true);

-- ═══════════════════════════════════════════════════════════════════════
-- Indexes for performance
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE inventory_snapshots ADD CONSTRAINT uq_snapshots_location_week UNIQUE (location_id, week_start);

CREATE INDEX IF NOT EXISTS idx_inventory_catalog_location ON inventory_catalog(location_id);
CREATE INDEX IF NOT EXISTS idx_inventory_snapshots_location_week ON inventory_snapshots(location_id, week_start);
CREATE INDEX IF NOT EXISTS idx_inventory_counts_snapshot ON inventory_counts(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_inventory_counts_catalog_item ON inventory_counts(catalog_item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_adhoc_snapshot ON inventory_adhoc_items(snapshot_id);
