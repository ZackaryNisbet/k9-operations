-- © 2026 K9 Operations LLC. All Rights Reserved.
-- COMPREHENSIVE FIX: Location creation + Client/Dog/Reservation persistence
--
-- The useData.js code (V2 normalized schema) writes to columns that may not
-- exist in the production database. When Supabase PostgREST encounters a
-- non-existent column in an upsert, the entire operation fails silently
-- (errors are only console.logged in the app), causing data to "disappear"
-- on the next reload.
--
-- This migration ensures ALL columns referenced by useData.js toRow functions
-- exist in the production database.
--
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- ============================================================


-- ============================================================
-- FIX 1: Re-add the "data" column to locations if it was dropped
-- ============================================================
-- Multiple RPC functions still reference locations.data for settings
-- (get_public_booking_data, get_locations_ops_data, submit_online_booking, etc.)
ALTER TABLE locations ADD COLUMN IF NOT EXISTS data JSONB NOT NULL DEFAULT '{}'::jsonb;


-- ============================================================
-- FIX 2: k9_clients — add ALL missing columns
-- ============================================================
-- From 20260308 migration (may not have been applied):
ALTER TABLE k9_clients ADD COLUMN IF NOT EXISTS street TEXT;
ALTER TABLE k9_clients ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE k9_clients ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE k9_clients ADD COLUMN IF NOT EXISTS zip TEXT;

-- Lifecycle tracking (clientToRow writes lifecycle_stage + lifecycle_data)
ALTER TABLE k9_clients ADD COLUMN IF NOT EXISTS lifecycle_stage TEXT DEFAULT 'prospect';
ALTER TABLE k9_clients ADD COLUMN IF NOT EXISTS lifecycle_data JSONB;

-- Vet reference
ALTER TABLE k9_clients ADD COLUMN IF NOT EXISTS preferred_vet_id TEXT;

-- Service date tracking (rowToClient reads these)
ALTER TABLE k9_clients ADD COLUMN IF NOT EXISTS first_service_date TEXT;
ALTER TABLE k9_clients ADD COLUMN IF NOT EXISTS last_service_date TEXT;

-- Direct columns for formerly-overflowed data
ALTER TABLE k9_clients ADD COLUMN IF NOT EXISTS saved_cards JSONB;
ALTER TABLE k9_clients ADD COLUMN IF NOT EXISTS client_notes JSONB;
ALTER TABLE k9_clients ADD COLUMN IF NOT EXISTS recurring_discount_id TEXT;

-- Notification preferences (clientToRow writes notification_prefs)
ALTER TABLE k9_clients ADD COLUMN IF NOT EXISTS notification_prefs JSONB;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_k9_clients_lifecycle ON k9_clients(lifecycle_stage, location_id);
CREATE INDEX IF NOT EXISTS idx_k9_clients_zip ON k9_clients(zip) WHERE zip IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_k9_clients_state ON k9_clients(state) WHERE state IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_k9_clients_city ON k9_clients(city) WHERE city IS NOT NULL;


-- ============================================================
-- FIX 3: k9_dogs — add ALL missing columns
-- ============================================================
-- useData.js DOG_FIELDS maps JS names → DB column names that may differ
-- from the original normalize-tables.sql definitions.
-- The code writes to these column names (left side = what code writes):
--   dob         → date_of_birth
--   weight      → latest_weight
--   weight_last_updated → latest_weight_date
--   bath_type   → preferred_bath_type
--   temperament → temperament_notes
--   profile_pic → profile_pic_url

ALTER TABLE k9_dogs ADD COLUMN IF NOT EXISTS date_of_birth TEXT;
ALTER TABLE k9_dogs ADD COLUMN IF NOT EXISTS latest_weight TEXT;
ALTER TABLE k9_dogs ADD COLUMN IF NOT EXISTS latest_weight_date TEXT;
ALTER TABLE k9_dogs ADD COLUMN IF NOT EXISTS preferred_bath_type TEXT;
ALTER TABLE k9_dogs ADD COLUMN IF NOT EXISTS temperament_notes TEXT;
ALTER TABLE k9_dogs ADD COLUMN IF NOT EXISTS profile_pic_url TEXT;

-- Additional columns referenced by dogToRow/rowToDog:
ALTER TABLE k9_dogs ADD COLUMN IF NOT EXISTS vet_id TEXT;
ALTER TABLE k9_dogs ADD COLUMN IF NOT EXISTS current_tag TEXT;
ALTER TABLE k9_dogs ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;


-- ============================================================
-- FIX 4: k9_reservations — add missing column
-- ============================================================
-- reservationToRow writes no_deposit but it may not exist
ALTER TABLE k9_reservations ADD COLUMN IF NOT EXISTS no_deposit BOOLEAN DEFAULT false;


-- ============================================================
-- FIX 5: Update create_location() to use empty data blob
-- ============================================================
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
-- DIAGNOSTIC: Verify all columns exist after running this migration
-- ============================================================
-- Run these to confirm:
--
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'k9_clients' ORDER BY ordinal_position;
--
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'k9_dogs' ORDER BY ordinal_position;
--
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'k9_reservations' ORDER BY ordinal_position;
