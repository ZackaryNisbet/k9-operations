-- Lifecycle overrides for Gingr-synced clients.
-- Stores follow-up dates, notes, cold status, and update history.
-- Keyed by location_id + gingr_id so syncs never overwrite lifecycle data.

CREATE TABLE IF NOT EXISTS lite_client_lifecycle (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  location_id TEXT NOT NULL,
  gingr_id TEXT NOT NULL,
  lifecycle_data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(location_id, gingr_id)
);

-- RLS
ALTER TABLE lite_client_lifecycle ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_all_lite_client_lifecycle"
  ON lite_client_lifecycle FOR ALL TO anon
  USING (true) WITH CHECK (true);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_lcl_location ON lite_client_lifecycle(location_id);
