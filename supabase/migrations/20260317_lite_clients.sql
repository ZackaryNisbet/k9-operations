-- ============================================================================
-- Lite Clients — shared infrastructure for Ignite auto-create & Grassroots
-- Stores client records that don't originate from Gingr
-- ============================================================================

CREATE TABLE IF NOT EXISTS lite_clients (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id     TEXT NOT NULL,
  first_name      TEXT,
  last_name       TEXT,
  phone           TEXT,
  email           TEXT,
  source          TEXT DEFAULT 'manual',
  source_date     TIMESTAMPTZ,
  notes           TEXT,
  ignite_lead_id  UUID,
  gingr_owner_id  BIGINT,
  lifecycle_data  JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_lite_clients_location ON lite_clients(location_id);
CREATE INDEX IF NOT EXISTS idx_lite_clients_phone ON lite_clients(location_id, phone);
CREATE INDEX IF NOT EXISTS idx_lite_clients_email ON lite_clients(location_id, email);
CREATE INDEX IF NOT EXISTS idx_lite_clients_ignite ON lite_clients(ignite_lead_id);
CREATE INDEX IF NOT EXISTS idx_lite_clients_gingr ON lite_clients(gingr_owner_id);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE lite_clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lite_clients_read" ON lite_clients;
CREATE POLICY "lite_clients_read" ON lite_clients FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "lite_clients_write" ON lite_clients;
CREATE POLICY "lite_clients_write" ON lite_clients FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "lite_clients_service" ON lite_clients;
CREATE POLICY "lite_clients_service" ON lite_clients FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── Updated_at trigger (reuse existing function) ────────────────────────────
CREATE TRIGGER lite_clients_updated_at BEFORE UPDATE ON lite_clients
  FOR EACH ROW EXECUTE FUNCTION update_gingr_updated_at();
