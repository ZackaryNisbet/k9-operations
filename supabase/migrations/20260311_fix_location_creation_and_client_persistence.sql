-- © 2026 K9 Operations LLC. All Rights Reserved.
-- Fix: Location creation error + Client data persistence
--
-- ISSUE 1: create_location() references column "data" on locations table
--          which no longer exists, causing "column data of relation locations
--          does not exist" error.
--
-- ISSUE 2: k9_clients table is missing columns that useData.js clientToRow()
--          tries to write (lifecycle_stage, lifecycle_data, preferred_vet_id,
--          saved_cards, client_notes, recurring_discount_id, first_service_date,
--          last_service_date). When these columns are missing, the upsert fails
--          silently and clients "disappear" on next data reload.
--
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- ============================================================


-- ============================================================
-- FIX 1: Re-add the "data" column to locations if it was dropped
-- ============================================================
-- Multiple RPC functions still reference locations.data for settings
-- (get_public_booking_data, get_locations_ops_data, etc.)
-- The safest fix is to ensure the column exists.
ALTER TABLE locations ADD COLUMN IF NOT EXISTS data JSONB NOT NULL DEFAULT '{}'::jsonb;


-- ============================================================
-- FIX 2: Add missing columns to k9_clients
-- ============================================================
-- useData.js clientToRow() writes these columns, and rowToClient() reads them.
-- If they don't exist, the Supabase upsert fails silently (error is only
-- console.logged), so clients appear in local state but are never persisted
-- to the DB. On the next data reload (realtime or 30s poll), they vanish.

-- Lifecycle tracking (replaces the old JSONB lifecycle column)
ALTER TABLE k9_clients ADD COLUMN IF NOT EXISTS lifecycle_stage TEXT DEFAULT 'prospect';
ALTER TABLE k9_clients ADD COLUMN IF NOT EXISTS lifecycle_data JSONB;

-- Vet reference (FK to vets table)
ALTER TABLE k9_clients ADD COLUMN IF NOT EXISTS preferred_vet_id TEXT;

-- Service date tracking
ALTER TABLE k9_clients ADD COLUMN IF NOT EXISTS first_service_date TEXT;
ALTER TABLE k9_clients ADD COLUMN IF NOT EXISTS last_service_date TEXT;

-- Direct columns for data that was previously in overflow/JSONB
ALTER TABLE k9_clients ADD COLUMN IF NOT EXISTS saved_cards JSONB;
ALTER TABLE k9_clients ADD COLUMN IF NOT EXISTS client_notes JSONB;
ALTER TABLE k9_clients ADD COLUMN IF NOT EXISTS recurring_discount_id TEXT;

-- Create index on lifecycle_stage for filtering
CREATE INDEX IF NOT EXISTS idx_k9_clients_lifecycle ON k9_clients(lifecycle_stage, location_id);


-- ============================================================
-- FIX 2b: Add missing column to k9_dogs
-- ============================================================
-- useData.js dogToRow() writes vet_id when a dog has an assigned vet,
-- but the column is missing from the table definition.
ALTER TABLE k9_dogs ADD COLUMN IF NOT EXISTS vet_id TEXT;


-- ============================================================
-- FIX 3: Update create_location() to not require "data" column
-- ============================================================
-- Even though we re-added the column above, we update the function
-- to be resilient: it no longer sets _initialized in the data blob
-- since the app's normalized schema doesn't use it.
CREATE OR REPLACE FUNCTION create_location(p_name TEXT, p_region TEXT DEFAULT '')
RETURNS JSONB AS $$
DECLARE
  new_loc_id UUID;
  loc_slug TEXT;
  slug_candidate TEXT;
  slug_suffix INT := 0;
BEGIN
  -- Only owners/enterprise admins can create locations
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'enterprise_admin')) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Only owners can create locations');
  END IF;

  -- Generate slug from name
  loc_slug := lower(regexp_replace(trim(p_name), '[^a-zA-Z0-9]+', '-', 'g'));
  loc_slug := trim(BOTH '-' FROM loc_slug);

  -- Handle slug uniqueness: append -2, -3, etc. if collision
  slug_candidate := loc_slug;
  WHILE EXISTS (SELECT 1 FROM locations WHERE slug = slug_candidate) LOOP
    slug_suffix := slug_suffix + 1;
    slug_candidate := loc_slug || '-' || slug_suffix;
  END LOOP;
  loc_slug := slug_candidate;

  -- Insert the new location
  INSERT INTO locations (name, slug, region, data)
  VALUES (trim(p_name), loc_slug, trim(p_region), '{}'::jsonb)
  RETURNING id INTO new_loc_id;

  RETURN jsonb_build_object(
    'success', true,
    'location_id', new_loc_id,
    'name', trim(p_name),
    'slug', loc_slug,
    'region', trim(p_region)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- DIAGNOSTIC: Run these queries to verify the fixes worked
-- ============================================================
-- Check locations.data column exists:
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'locations' AND column_name = 'data';
--
-- Check k9_clients has all expected columns:
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'k9_clients' ORDER BY ordinal_position;
--
-- Test create_location (as an owner):
-- SELECT create_location('Test Location', 'Test Region');
-- Then delete the test: SELECT delete_location((SELECT id FROM locations WHERE name = 'Test Location'));
