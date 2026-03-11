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
-- FIX 6: RLS POLICY FIX — Owner/Enterprise Admin Override
-- ============================================================
-- ROOT CAUSE OF CLIENT DISAPPEARING BUG:
-- All entity table RLS policies use:
--   FOR ALL USING (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()))
--
-- This means PostgreSQL silently drops INSERT/UPDATE rows when the user's
-- profiles.location_id doesn't match the row's location_id. There is NO
-- error returned — PostgREST reports success with 0 rows affected.
--
-- The `locations` table already has an owner override policy, but entity
-- tables do not. When an owner switches to a new location, there can be
-- a brief timing mismatch between switch_location (updates DB) and the
-- React state refresh. Even without timing issues, Fadi (as a non-owner
-- employee) may simply not have profiles.location_id pointing to the
-- correct location.
--
-- FIX: Drop the restrictive single-policy and replace with separate
-- SELECT/INSERT/UPDATE/DELETE policies that include an owner override.
-- This matches the pattern used on the `locations` table.
-- ============================================================

-- Helper: reusable owner check subquery
-- (Can't create a function for this in a migration, so we inline it)

-- ---- k9_clients ----
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'k9_clients') THEN
    EXECUTE 'DROP POLICY IF EXISTS k9_clients_rls ON k9_clients';
    EXECUTE 'DROP POLICY IF EXISTS k9_clients_select ON k9_clients';
    EXECUTE 'DROP POLICY IF EXISTS k9_clients_insert ON k9_clients';
    EXECUTE 'DROP POLICY IF EXISTS k9_clients_update ON k9_clients';
    EXECUTE 'DROP POLICY IF EXISTS k9_clients_delete ON k9_clients';
    EXECUTE 'CREATE POLICY k9_clients_select ON k9_clients FOR SELECT USING (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (''owner'', ''enterprise_admin'')))';
    EXECUTE 'CREATE POLICY k9_clients_insert ON k9_clients FOR INSERT WITH CHECK (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (''owner'', ''enterprise_admin'')))';
    EXECUTE 'CREATE POLICY k9_clients_update ON k9_clients FOR UPDATE USING (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (''owner'', ''enterprise_admin'')))';
    EXECUTE 'CREATE POLICY k9_clients_delete ON k9_clients FOR DELETE USING (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (''owner'', ''enterprise_admin'')))';
  END IF;
END $$;

-- ---- k9_dogs ----
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'k9_dogs') THEN
    EXECUTE 'DROP POLICY IF EXISTS k9_dogs_rls ON k9_dogs';
    EXECUTE 'DROP POLICY IF EXISTS k9_dogs_select ON k9_dogs';
    EXECUTE 'DROP POLICY IF EXISTS k9_dogs_insert ON k9_dogs';
    EXECUTE 'DROP POLICY IF EXISTS k9_dogs_update ON k9_dogs';
    EXECUTE 'DROP POLICY IF EXISTS k9_dogs_delete ON k9_dogs';
    EXECUTE 'CREATE POLICY k9_dogs_select ON k9_dogs FOR SELECT USING (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (''owner'', ''enterprise_admin'')))';
    EXECUTE 'CREATE POLICY k9_dogs_insert ON k9_dogs FOR INSERT WITH CHECK (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (''owner'', ''enterprise_admin'')))';
    EXECUTE 'CREATE POLICY k9_dogs_update ON k9_dogs FOR UPDATE USING (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (''owner'', ''enterprise_admin'')))';
    EXECUTE 'CREATE POLICY k9_dogs_delete ON k9_dogs FOR DELETE USING (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (''owner'', ''enterprise_admin'')))';
  END IF;
END $$;

-- ---- k9_vaccine_records ----
-- SKIPPED: This table is defined in normalize-tables.sql but was never
-- created in the production database. Policies will be applied when the
-- table is created in a future migration.

-- ---- k9_reservations ----
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'k9_reservations') THEN
    EXECUTE 'DROP POLICY IF EXISTS k9_reservations_rls ON k9_reservations';
    EXECUTE 'DROP POLICY IF EXISTS k9_reservations_select ON k9_reservations';
    EXECUTE 'DROP POLICY IF EXISTS k9_reservations_insert ON k9_reservations';
    EXECUTE 'DROP POLICY IF EXISTS k9_reservations_update ON k9_reservations';
    EXECUTE 'DROP POLICY IF EXISTS k9_reservations_delete ON k9_reservations';
    EXECUTE 'CREATE POLICY k9_reservations_select ON k9_reservations FOR SELECT USING (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (''owner'', ''enterprise_admin'')))';
    EXECUTE 'CREATE POLICY k9_reservations_insert ON k9_reservations FOR INSERT WITH CHECK (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (''owner'', ''enterprise_admin'')))';
    EXECUTE 'CREATE POLICY k9_reservations_update ON k9_reservations FOR UPDATE USING (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (''owner'', ''enterprise_admin'')))';
    EXECUTE 'CREATE POLICY k9_reservations_delete ON k9_reservations FOR DELETE USING (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (''owner'', ''enterprise_admin'')))';
  END IF;
END $$;

-- ---- k9_evaluations / k9_evaluations_v2 ----
-- The code uses k9_evaluations_v2. Apply policies to whichever exists.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'k9_evaluations_v2') THEN
    EXECUTE 'DROP POLICY IF EXISTS k9_evaluations_v2_rls ON k9_evaluations_v2';
    EXECUTE 'DROP POLICY IF EXISTS k9_evaluations_v2_select ON k9_evaluations_v2';
    EXECUTE 'DROP POLICY IF EXISTS k9_evaluations_v2_insert ON k9_evaluations_v2';
    EXECUTE 'DROP POLICY IF EXISTS k9_evaluations_v2_update ON k9_evaluations_v2';
    EXECUTE 'DROP POLICY IF EXISTS k9_evaluations_v2_delete ON k9_evaluations_v2';
    EXECUTE 'CREATE POLICY k9_evaluations_v2_select ON k9_evaluations_v2 FOR SELECT USING (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (''owner'', ''enterprise_admin'')))';
    EXECUTE 'CREATE POLICY k9_evaluations_v2_insert ON k9_evaluations_v2 FOR INSERT WITH CHECK (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (''owner'', ''enterprise_admin'')))';
    EXECUTE 'CREATE POLICY k9_evaluations_v2_update ON k9_evaluations_v2 FOR UPDATE USING (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (''owner'', ''enterprise_admin'')))';
    EXECUTE 'CREATE POLICY k9_evaluations_v2_delete ON k9_evaluations_v2 FOR DELETE USING (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (''owner'', ''enterprise_admin'')))';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'k9_evaluations') THEN
    EXECUTE 'DROP POLICY IF EXISTS k9_evaluations_rls ON k9_evaluations';
    EXECUTE 'DROP POLICY IF EXISTS k9_evaluations_select ON k9_evaluations';
    EXECUTE 'DROP POLICY IF EXISTS k9_evaluations_insert ON k9_evaluations';
    EXECUTE 'DROP POLICY IF EXISTS k9_evaluations_update ON k9_evaluations';
    EXECUTE 'DROP POLICY IF EXISTS k9_evaluations_delete ON k9_evaluations';
    EXECUTE 'CREATE POLICY k9_evaluations_select ON k9_evaluations FOR SELECT USING (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (''owner'', ''enterprise_admin'')))';
    EXECUTE 'CREATE POLICY k9_evaluations_insert ON k9_evaluations FOR INSERT WITH CHECK (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (''owner'', ''enterprise_admin'')))';
    EXECUTE 'CREATE POLICY k9_evaluations_update ON k9_evaluations FOR UPDATE USING (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (''owner'', ''enterprise_admin'')))';
    EXECUTE 'CREATE POLICY k9_evaluations_delete ON k9_evaluations FOR DELETE USING (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (''owner'', ''enterprise_admin'')))';
  END IF;
END $$;

-- ---- k9_daily_ops ----
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'k9_daily_ops') THEN
    EXECUTE 'DROP POLICY IF EXISTS k9_daily_ops_rls ON k9_daily_ops';
    EXECUTE 'DROP POLICY IF EXISTS k9_daily_ops_select ON k9_daily_ops';
    EXECUTE 'DROP POLICY IF EXISTS k9_daily_ops_insert ON k9_daily_ops';
    EXECUTE 'DROP POLICY IF EXISTS k9_daily_ops_update ON k9_daily_ops';
    EXECUTE 'DROP POLICY IF EXISTS k9_daily_ops_delete ON k9_daily_ops';
    EXECUTE 'CREATE POLICY k9_daily_ops_select ON k9_daily_ops FOR SELECT USING (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (''owner'', ''enterprise_admin'')))';
    EXECUTE 'CREATE POLICY k9_daily_ops_insert ON k9_daily_ops FOR INSERT WITH CHECK (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (''owner'', ''enterprise_admin'')))';
    EXECUTE 'CREATE POLICY k9_daily_ops_update ON k9_daily_ops FOR UPDATE USING (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (''owner'', ''enterprise_admin'')))';
    EXECUTE 'CREATE POLICY k9_daily_ops_delete ON k9_daily_ops FOR DELETE USING (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (''owner'', ''enterprise_admin'')))';
  END IF;
END $$;

-- ---- k9_payments ----
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'k9_payments') THEN
    EXECUTE 'DROP POLICY IF EXISTS k9_payments_rls ON k9_payments';
    EXECUTE 'DROP POLICY IF EXISTS k9_payments_select ON k9_payments';
    EXECUTE 'DROP POLICY IF EXISTS k9_payments_insert ON k9_payments';
    EXECUTE 'DROP POLICY IF EXISTS k9_payments_update ON k9_payments';
    EXECUTE 'DROP POLICY IF EXISTS k9_payments_delete ON k9_payments';
    EXECUTE 'CREATE POLICY k9_payments_select ON k9_payments FOR SELECT USING (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (''owner'', ''enterprise_admin'')))';
    EXECUTE 'CREATE POLICY k9_payments_insert ON k9_payments FOR INSERT WITH CHECK (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (''owner'', ''enterprise_admin'')))';
    EXECUTE 'CREATE POLICY k9_payments_update ON k9_payments FOR UPDATE USING (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (''owner'', ''enterprise_admin'')))';
    EXECUTE 'CREATE POLICY k9_payments_delete ON k9_payments FOR DELETE USING (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (''owner'', ''enterprise_admin'')))';
  END IF;
END $$;

-- ---- k9_packages / enterprise_packages ----
-- Code uses enterprise_packages (global). Apply to whichever exists.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'k9_packages') THEN
    EXECUTE 'DROP POLICY IF EXISTS k9_packages_rls ON k9_packages';
    EXECUTE 'DROP POLICY IF EXISTS k9_packages_select ON k9_packages';
    EXECUTE 'DROP POLICY IF EXISTS k9_packages_insert ON k9_packages';
    EXECUTE 'DROP POLICY IF EXISTS k9_packages_update ON k9_packages';
    EXECUTE 'DROP POLICY IF EXISTS k9_packages_delete ON k9_packages';
    EXECUTE 'CREATE POLICY k9_packages_select ON k9_packages FOR SELECT USING (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (''owner'', ''enterprise_admin'')))';
    EXECUTE 'CREATE POLICY k9_packages_insert ON k9_packages FOR INSERT WITH CHECK (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (''owner'', ''enterprise_admin'')))';
    EXECUTE 'CREATE POLICY k9_packages_update ON k9_packages FOR UPDATE USING (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (''owner'', ''enterprise_admin'')))';
    EXECUTE 'CREATE POLICY k9_packages_delete ON k9_packages FOR DELETE USING (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (''owner'', ''enterprise_admin'')))';
  END IF;
END $$;

-- ---- k9_package_sales / k9_package_sales_v2 ----
-- Code uses k9_package_sales_v2. Apply to whichever exists.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'k9_package_sales_v2') THEN
    EXECUTE 'DROP POLICY IF EXISTS k9_package_sales_v2_rls ON k9_package_sales_v2';
    EXECUTE 'DROP POLICY IF EXISTS k9_package_sales_v2_select ON k9_package_sales_v2';
    EXECUTE 'DROP POLICY IF EXISTS k9_package_sales_v2_insert ON k9_package_sales_v2';
    EXECUTE 'DROP POLICY IF EXISTS k9_package_sales_v2_update ON k9_package_sales_v2';
    EXECUTE 'DROP POLICY IF EXISTS k9_package_sales_v2_delete ON k9_package_sales_v2';
    EXECUTE 'CREATE POLICY k9_package_sales_v2_select ON k9_package_sales_v2 FOR SELECT USING (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (''owner'', ''enterprise_admin'')))';
    EXECUTE 'CREATE POLICY k9_package_sales_v2_insert ON k9_package_sales_v2 FOR INSERT WITH CHECK (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (''owner'', ''enterprise_admin'')))';
    EXECUTE 'CREATE POLICY k9_package_sales_v2_update ON k9_package_sales_v2 FOR UPDATE USING (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (''owner'', ''enterprise_admin'')))';
    EXECUTE 'CREATE POLICY k9_package_sales_v2_delete ON k9_package_sales_v2 FOR DELETE USING (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (''owner'', ''enterprise_admin'')))';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'k9_package_sales') THEN
    EXECUTE 'DROP POLICY IF EXISTS k9_package_sales_rls ON k9_package_sales';
    EXECUTE 'DROP POLICY IF EXISTS k9_package_sales_select ON k9_package_sales';
    EXECUTE 'DROP POLICY IF EXISTS k9_package_sales_insert ON k9_package_sales';
    EXECUTE 'DROP POLICY IF EXISTS k9_package_sales_update ON k9_package_sales';
    EXECUTE 'DROP POLICY IF EXISTS k9_package_sales_delete ON k9_package_sales';
    EXECUTE 'CREATE POLICY k9_package_sales_select ON k9_package_sales FOR SELECT USING (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (''owner'', ''enterprise_admin'')))';
    EXECUTE 'CREATE POLICY k9_package_sales_insert ON k9_package_sales FOR INSERT WITH CHECK (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (''owner'', ''enterprise_admin'')))';
    EXECUTE 'CREATE POLICY k9_package_sales_update ON k9_package_sales FOR UPDATE USING (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (''owner'', ''enterprise_admin'')))';
    EXECUTE 'CREATE POLICY k9_package_sales_delete ON k9_package_sales FOR DELETE USING (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (''owner'', ''enterprise_admin'')))';
  END IF;
END $$;

-- ---- k9_messages ----
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'k9_messages') THEN
    EXECUTE 'DROP POLICY IF EXISTS k9_messages_rls ON k9_messages';
    EXECUTE 'DROP POLICY IF EXISTS k9_messages_select ON k9_messages';
    EXECUTE 'DROP POLICY IF EXISTS k9_messages_insert ON k9_messages';
    EXECUTE 'DROP POLICY IF EXISTS k9_messages_update ON k9_messages';
    EXECUTE 'DROP POLICY IF EXISTS k9_messages_delete ON k9_messages';
    EXECUTE 'CREATE POLICY k9_messages_select ON k9_messages FOR SELECT USING (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (''owner'', ''enterprise_admin'')))';
    EXECUTE 'CREATE POLICY k9_messages_insert ON k9_messages FOR INSERT WITH CHECK (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (''owner'', ''enterprise_admin'')))';
    EXECUTE 'CREATE POLICY k9_messages_update ON k9_messages FOR UPDATE USING (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (''owner'', ''enterprise_admin'')))';
    EXECUTE 'CREATE POLICY k9_messages_delete ON k9_messages FOR DELETE USING (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (''owner'', ''enterprise_admin'')))';
  END IF;
END $$;

-- ---- audit_log / k9_audit_log ----
-- Code uses 'audit_log'. Apply to whichever exists.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'audit_log') THEN
    EXECUTE 'DROP POLICY IF EXISTS audit_log_rls ON audit_log';
    EXECUTE 'DROP POLICY IF EXISTS audit_log_select ON audit_log';
    EXECUTE 'DROP POLICY IF EXISTS audit_log_insert ON audit_log';
    EXECUTE 'DROP POLICY IF EXISTS audit_log_update ON audit_log';
    EXECUTE 'DROP POLICY IF EXISTS audit_log_delete ON audit_log';
    EXECUTE 'CREATE POLICY audit_log_select ON audit_log FOR SELECT USING (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (''owner'', ''enterprise_admin'')))';
    EXECUTE 'CREATE POLICY audit_log_insert ON audit_log FOR INSERT WITH CHECK (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (''owner'', ''enterprise_admin'')))';
    EXECUTE 'CREATE POLICY audit_log_update ON audit_log FOR UPDATE USING (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (''owner'', ''enterprise_admin'')))';
    EXECUTE 'CREATE POLICY audit_log_delete ON audit_log FOR DELETE USING (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (''owner'', ''enterprise_admin'')))';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'k9_audit_log') THEN
    EXECUTE 'DROP POLICY IF EXISTS k9_audit_log_rls ON k9_audit_log';
    EXECUTE 'DROP POLICY IF EXISTS k9_audit_log_select ON k9_audit_log';
    EXECUTE 'DROP POLICY IF EXISTS k9_audit_log_insert ON k9_audit_log';
    EXECUTE 'DROP POLICY IF EXISTS k9_audit_log_update ON k9_audit_log';
    EXECUTE 'DROP POLICY IF EXISTS k9_audit_log_delete ON k9_audit_log';
    EXECUTE 'CREATE POLICY k9_audit_log_select ON k9_audit_log FOR SELECT USING (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (''owner'', ''enterprise_admin'')))';
    EXECUTE 'CREATE POLICY k9_audit_log_insert ON k9_audit_log FOR INSERT WITH CHECK (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (''owner'', ''enterprise_admin'')))';
    EXECUTE 'CREATE POLICY k9_audit_log_update ON k9_audit_log FOR UPDATE USING (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (''owner'', ''enterprise_admin'')))';
    EXECUTE 'CREATE POLICY k9_audit_log_delete ON k9_audit_log FOR DELETE USING (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (''owner'', ''enterprise_admin'')))';
  END IF;
END $$;

-- ---- k9_reminder_log ----
-- May not exist in production. Skip safely if missing.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'k9_reminder_log') THEN
    EXECUTE 'DROP POLICY IF EXISTS k9_reminder_log_rls ON k9_reminder_log';
    EXECUTE 'DROP POLICY IF EXISTS k9_reminder_log_select ON k9_reminder_log';
    EXECUTE 'DROP POLICY IF EXISTS k9_reminder_log_insert ON k9_reminder_log';
    EXECUTE 'DROP POLICY IF EXISTS k9_reminder_log_update ON k9_reminder_log';
    EXECUTE 'DROP POLICY IF EXISTS k9_reminder_log_delete ON k9_reminder_log';
    EXECUTE 'CREATE POLICY k9_reminder_log_select ON k9_reminder_log FOR SELECT USING (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (''owner'', ''enterprise_admin'')))';
    EXECUTE 'CREATE POLICY k9_reminder_log_insert ON k9_reminder_log FOR INSERT WITH CHECK (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (''owner'', ''enterprise_admin'')))';
    EXECUTE 'CREATE POLICY k9_reminder_log_update ON k9_reminder_log FOR UPDATE USING (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (''owner'', ''enterprise_admin'')))';
    EXECUTE 'CREATE POLICY k9_reminder_log_delete ON k9_reminder_log FOR DELETE USING (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (''owner'', ''enterprise_admin'')))';
  END IF;
END $$;


-- ============================================================
-- FIX 7: Update switch_location to work for ALL authenticated users
-- ============================================================
-- Currently switch_location only allows owners/enterprise_admins.
-- But regular staff (like Fadi) also need to switch locations if
-- they are assigned to a new one. Update to allow any authenticated
-- user to switch to a location they have access to.
-- ============================================================
CREATE OR REPLACE FUNCTION switch_location(p_location_id UUID)
RETURNS JSONB AS $$
BEGIN
  -- Verify location exists
  IF NOT EXISTS (SELECT 1 FROM locations WHERE id = p_location_id) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Location not found');
  END IF;

  -- Update the user's active location
  UPDATE profiles
  SET location_id = p_location_id
  WHERE id = auth.uid();

  RETURN jsonb_build_object('success', true, 'location_id', p_location_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- DIAGNOSTIC: Verify all columns and policies after running
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
--
-- SELECT tablename, policyname FROM pg_policies
-- WHERE tablename LIKE 'k9_%' ORDER BY tablename, policyname;
