-- Enrichment snapshots: persist enrichment data so past/future dates work
CREATE TABLE IF NOT EXISTS enrichment_snapshots (
  id SERIAL PRIMARY KEY,
  location_id TEXT NOT NULL,
  report_date DATE NOT NULL,
  animal_id TEXT NOT NULL,
  animal_name TEXT,
  owner_name TEXT,
  services JSONB,
  reservation_type TEXT,
  status TEXT DEFAULT 'scheduled',
  scheduled_date DATE,
  snapshot_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(location_id, report_date, animal_id)
);

-- Add checkout_history column to animal_checkout_averages cache
ALTER TABLE animal_checkout_averages ADD COLUMN IF NOT EXISTS
  checkout_history JSONB DEFAULT '[]';
