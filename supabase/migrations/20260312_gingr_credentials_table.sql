-- © 2026 K9 Operations LLC. All Rights Reserved.
-- Migration: Create k9_gingr_credentials table
-- Stores per-location Gingr API credentials for the Lean app integration.

-- ============================================================
-- k9_gingr_credentials
-- ============================================================
-- One row per location. Stores the Gingr subdomain, API key,
-- and optional Gingr location_id for multi-location Gingr accounts.

CREATE TABLE IF NOT EXISTS k9_gingr_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID NOT NULL UNIQUE REFERENCES locations(id) ON DELETE CASCADE,
  gingr_subdomain TEXT NOT NULL,          -- e.g. "cherry-hill" → cherry-hill.gingrapp.com
  gingr_api_key TEXT NOT NULL,            -- Gingr user API key
  gingr_location_id TEXT,                 -- Optional: Gingr's internal location_id (for multi-loc accounts)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookup by location
CREATE INDEX IF NOT EXISTS idx_k9_gingr_creds_loc ON k9_gingr_credentials(location_id);

-- ============================================================
-- RLS Policies
-- ============================================================
-- Match the pattern from other k9_* tables: users can only
-- access credentials for their own location.

ALTER TABLE k9_gingr_credentials ENABLE ROW LEVEL SECURITY;

-- Select: users can read their own location's credentials
CREATE POLICY "Users can view own location gingr credentials"
  ON k9_gingr_credentials FOR SELECT
  USING (
    location_id = (SELECT location_id FROM profiles WHERE id = auth.uid())
  );

-- Insert: users can insert credentials for their own location
CREATE POLICY "Users can insert own location gingr credentials"
  ON k9_gingr_credentials FOR INSERT
  WITH CHECK (
    location_id = (SELECT location_id FROM profiles WHERE id = auth.uid())
  );

-- Update: users can update their own location's credentials
CREATE POLICY "Users can update own location gingr credentials"
  ON k9_gingr_credentials FOR UPDATE
  USING (
    location_id = (SELECT location_id FROM profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    location_id = (SELECT location_id FROM profiles WHERE id = auth.uid())
  );

-- Delete: users can delete their own location's credentials
CREATE POLICY "Users can delete own location gingr credentials"
  ON k9_gingr_credentials FOR DELETE
  USING (
    location_id = (SELECT location_id FROM profiles WHERE id = auth.uid())
  );

-- ============================================================
-- updated_at trigger (auto-update on row change)
-- ============================================================
-- Reuse the existing trigger function if it exists, otherwise create it.
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_gingr_credentials_updated_at
  BEFORE UPDATE ON k9_gingr_credentials
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
