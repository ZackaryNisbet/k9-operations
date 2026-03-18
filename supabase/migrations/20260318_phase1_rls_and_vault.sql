-- Phase 1: RLS Policies & Vault Setup
-- Executed: 2026-03-18
--
-- This migration:
-- 1. Creates get_user_location_id() helper function for RLS policies
-- 2. Drops all permissive USING(true) policies on gingr_* tables
-- 3. Adds location-based RLS policies to all gingr_* tables
-- 4. Enables RLS on dashboard_metrics_daily and adds location-based policy
-- 5. Replaces insecure policies on lite_settings and lite_daily_ops
-- 6. Stores Gingr API key in Supabase Vault
-- 7. Creates get_gingr_credentials() abstraction layer function

-- ============================================================================
-- 1. Helper function: get_user_location_id()
-- Returns the current authenticated user's location_id from lite_profiles
-- ============================================================================
CREATE OR REPLACE FUNCTION get_user_location_id()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT location_id FROM lite_profiles WHERE user_id = auth.uid() AND is_active = true LIMIT 1
$$;

-- ============================================================================
-- 2. Drop insecure USING(true) policies on gingr_* tables
-- These policies gave ALL roles (including public/anon) full access
-- ============================================================================

-- gingr_animals
DROP POLICY IF EXISTS "gingr_animals_all" ON gingr_animals;
DROP POLICY IF EXISTS "gingr_animals_service" ON gingr_animals;

-- gingr_breeds
DROP POLICY IF EXISTS "gingr_breeds_all" ON gingr_breeds;
DROP POLICY IF EXISTS "gingr_breeds_service" ON gingr_breeds;

-- gingr_deposits
DROP POLICY IF EXISTS "Authenticated users can read deposits" ON gingr_deposits;
DROP POLICY IF EXISTS "Service role full access deposits" ON gingr_deposits;

-- gingr_immunization_types
DROP POLICY IF EXISTS "gingr_immunization_types_all" ON gingr_immunization_types;
DROP POLICY IF EXISTS "gingr_immunization_types_service" ON gingr_immunization_types;

-- gingr_immunizations
DROP POLICY IF EXISTS "gingr_immunizations_all" ON gingr_immunizations;
DROP POLICY IF EXISTS "gingr_immunizations_service" ON gingr_immunizations;

-- gingr_invoice_payments
DROP POLICY IF EXISTS "Allow all for service role" ON gingr_invoice_payments;

-- gingr_invoices
DROP POLICY IF EXISTS "Authenticated users can read invoices" ON gingr_invoices;
DROP POLICY IF EXISTS "Service role full access invoices" ON gingr_invoices;

-- gingr_owners
DROP POLICY IF EXISTS "gingr_owners_all" ON gingr_owners;
DROP POLICY IF EXISTS "gingr_owners_service" ON gingr_owners;

-- gingr_reservation_types
DROP POLICY IF EXISTS "gingr_reservation_types_all" ON gingr_reservation_types;
DROP POLICY IF EXISTS "gingr_reservation_types_service" ON gingr_reservation_types;

-- gingr_reservations
DROP POLICY IF EXISTS "gingr_reservations_all" ON gingr_reservations;
DROP POLICY IF EXISTS "gingr_reservations_service" ON gingr_reservations;

-- gingr_sync_state
DROP POLICY IF EXISTS "gingr_sync_state_all" ON gingr_sync_state;
DROP POLICY IF EXISTS "gingr_sync_state_service" ON gingr_sync_state;

-- ============================================================================
-- 3. Add location-based RLS policies to gingr_* tables
-- Authenticated users can only SELECT rows matching their location
-- Service role bypasses RLS automatically in Supabase
-- ============================================================================

CREATE POLICY "Users can view own location data" ON gingr_animals
  FOR SELECT TO authenticated
  USING (location_id = get_user_location_id());

CREATE POLICY "Users can view own location data" ON gingr_breeds
  FOR SELECT TO authenticated
  USING (location_id = get_user_location_id());

CREATE POLICY "Users can view own location data" ON gingr_deposits
  FOR SELECT TO authenticated
  USING (location_id = get_user_location_id());

CREATE POLICY "Users can view own location data" ON gingr_immunization_types
  FOR SELECT TO authenticated
  USING (location_id = get_user_location_id());

CREATE POLICY "Users can view own location data" ON gingr_immunizations
  FOR SELECT TO authenticated
  USING (location_id = get_user_location_id());

CREATE POLICY "Users can view own location data" ON gingr_invoice_payments
  FOR SELECT TO authenticated
  USING (location_id = get_user_location_id());

CREATE POLICY "Users can view own location data" ON gingr_invoices
  FOR SELECT TO authenticated
  USING (location_id = get_user_location_id());

CREATE POLICY "Users can view own location data" ON gingr_owners
  FOR SELECT TO authenticated
  USING (location_id = get_user_location_id());

CREATE POLICY "Users can view own location data" ON gingr_reservation_types
  FOR SELECT TO authenticated
  USING (location_id = get_user_location_id());

CREATE POLICY "Users can view own location data" ON gingr_reservations
  FOR SELECT TO authenticated
  USING (location_id = get_user_location_id());

CREATE POLICY "Users can view own location data" ON gingr_sync_state
  FOR SELECT TO authenticated
  USING (location_id = get_user_location_id());

-- ============================================================================
-- 4. Enable RLS on dashboard_metrics_daily and add location-based policy
-- ============================================================================

ALTER TABLE dashboard_metrics_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own location data" ON dashboard_metrics_daily
  FOR SELECT TO authenticated
  USING (location_id = get_user_location_id());

-- ============================================================================
-- 5. Replace insecure policies on lite_settings and lite_daily_ops
-- ============================================================================

-- lite_settings: replace USING(true) ALL policy with location-scoped policies
DROP POLICY IF EXISTS "lite_settings_all" ON lite_settings;

CREATE POLICY "Users can view own location settings" ON lite_settings
  FOR SELECT TO authenticated
  USING (location_id = get_user_location_id());

CREATE POLICY "Users can update own location settings" ON lite_settings
  FOR UPDATE TO authenticated
  USING (location_id = get_user_location_id())
  WITH CHECK (location_id = get_user_location_id());

CREATE POLICY "Users can insert own location settings" ON lite_settings
  FOR INSERT TO authenticated
  WITH CHECK (location_id = get_user_location_id());

-- lite_daily_ops: replace USING(true) SELECT policy with location-scoped policy
DROP POLICY IF EXISTS "lite_daily_ops_select" ON lite_daily_ops;

CREATE POLICY "Users can view own location data" ON lite_daily_ops
  FOR SELECT TO authenticated
  USING (location_id IN (SELECT get_my_lite_location_ids()));

-- ============================================================================
-- 6. Store Gingr API key in Supabase Vault (encrypted at rest)
-- ============================================================================

SELECT vault.create_secret(
  'a0fec5e66b3c3be8b6085b2708b3806e',
  'gingr_api_key_your-gingr-subdomain',
  'Gingr API key for K9 Adair Forsythe location'
);

-- ============================================================================
-- 7. Credential abstraction layer function
-- Edge functions should call this instead of reading lite_settings directly.
-- Currently reads from lite_settings; will be updated to decrypt from Vault.
-- ============================================================================

CREATE OR REPLACE FUNCTION get_gingr_credentials(p_location_id TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_config JSON;
BEGIN
  -- Read gingr_config from lite_settings for the given location
  SELECT setting_value::json INTO v_config
  FROM lite_settings
  WHERE setting_key = 'gingr_config'
  AND location_id = p_location_id;

  -- If not found by direct match, try joining through lite_profiles
  -- (handles UUID vs slug location_id mismatch)
  IF v_config IS NULL THEN
    SELECT setting_value::json INTO v_config
    FROM lite_settings ls
    JOIN lite_profiles lp ON ls.location_id = lp.location_id
    WHERE ls.setting_key = 'gingr_config'
    AND lp.location_id = p_location_id;
  END IF;

  RETURN v_config;
END;
$$;
