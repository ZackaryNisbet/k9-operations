-- ============================================================================
-- Fix RLS infinite recursion on lite_profiles
-- The SELECT policy was self-referencing, causing all lite_* table queries to fail
-- Fix: use a SECURITY DEFINER function that bypasses RLS to check membership
-- ============================================================================

-- Step 1: Create a helper function that bypasses RLS to look up user's locations
CREATE OR REPLACE FUNCTION get_my_lite_location_ids()
RETURNS SETOF TEXT
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT location_id FROM lite_profiles WHERE user_id = auth.uid() AND is_active = true;
$$;

CREATE OR REPLACE FUNCTION is_lite_owner_or_enterprise()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM lite_profiles
    WHERE user_id = auth.uid() AND is_active = true AND role IN ('enterprise_admin')
  );
$$;

CREATE OR REPLACE FUNCTION is_lite_manager_plus()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM lite_profiles
    WHERE user_id = auth.uid() AND is_active = true AND role IN ('enterprise_admin', 'location_admin', 'manager')
  );
$$;

-- Step 2: Drop all existing recursive policies on lite_profiles
DROP POLICY IF EXISTS lite_profiles_select ON lite_profiles;
DROP POLICY IF EXISTS lite_profiles_insert ON lite_profiles;
DROP POLICY IF EXISTS lite_profiles_update ON lite_profiles;
DROP POLICY IF EXISTS lite_profiles_delete ON lite_profiles;

-- Step 3: Recreate non-recursive policies using the helper functions
CREATE POLICY lite_profiles_select ON lite_profiles
  FOR SELECT TO authenticated USING (
    user_id = auth.uid()
    OR location_id IN (SELECT get_my_lite_location_ids())
    OR is_lite_owner_or_enterprise()
  );

CREATE POLICY lite_profiles_insert ON lite_profiles
  FOR INSERT TO authenticated WITH CHECK (
    is_lite_manager_plus()
  );

CREATE POLICY lite_profiles_update ON lite_profiles
  FOR UPDATE TO authenticated USING (
    user_id = auth.uid()
    OR is_lite_manager_plus()
  );

CREATE POLICY lite_profiles_delete ON lite_profiles
  FOR DELETE TO authenticated USING (
    is_lite_owner_or_enterprise()
  );

-- Step 4: Fix policies on other lite_* tables that also reference lite_profiles directly
-- Replace with the helper functions

-- lite_settings
DROP POLICY IF EXISTS lite_settings_select ON lite_settings;
DROP POLICY IF EXISTS lite_settings_insert ON lite_settings;
DROP POLICY IF EXISTS lite_settings_update ON lite_settings;
DROP POLICY IF EXISTS lite_settings_delete ON lite_settings;

CREATE POLICY lite_settings_select ON lite_settings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY lite_settings_insert ON lite_settings
  FOR INSERT TO authenticated WITH CHECK (
    location_id IN (SELECT get_my_lite_location_ids()) OR is_lite_owner_or_enterprise()
  );
CREATE POLICY lite_settings_update ON lite_settings
  FOR UPDATE TO authenticated USING (
    location_id IN (SELECT get_my_lite_location_ids()) OR is_lite_owner_or_enterprise()
  );
CREATE POLICY lite_settings_delete ON lite_settings
  FOR DELETE TO authenticated USING (
    is_lite_owner_or_enterprise()
  );

-- lite_checklist_templates
DROP POLICY IF EXISTS lite_checklist_templates_select ON lite_checklist_templates;
DROP POLICY IF EXISTS lite_checklist_templates_insert ON lite_checklist_templates;
DROP POLICY IF EXISTS lite_checklist_templates_update ON lite_checklist_templates;
DROP POLICY IF EXISTS lite_checklist_templates_delete ON lite_checklist_templates;

CREATE POLICY lite_checklist_templates_select ON lite_checklist_templates
  FOR SELECT TO authenticated USING (true);
CREATE POLICY lite_checklist_templates_insert ON lite_checklist_templates
  FOR INSERT TO authenticated WITH CHECK (
    location_id IN (SELECT get_my_lite_location_ids()) OR is_lite_owner_or_enterprise()
  );
CREATE POLICY lite_checklist_templates_update ON lite_checklist_templates
  FOR UPDATE TO authenticated USING (
    location_id IN (SELECT get_my_lite_location_ids()) OR is_lite_owner_or_enterprise()
  );
CREATE POLICY lite_checklist_templates_delete ON lite_checklist_templates
  FOR DELETE TO authenticated USING (
    is_lite_owner_or_enterprise()
  );

-- lite_permissions
DROP POLICY IF EXISTS lite_permissions_select ON lite_permissions;
DROP POLICY IF EXISTS lite_permissions_insert ON lite_permissions;
DROP POLICY IF EXISTS lite_permissions_update ON lite_permissions;
DROP POLICY IF EXISTS lite_permissions_delete ON lite_permissions;

CREATE POLICY lite_permissions_select ON lite_permissions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY lite_permissions_insert ON lite_permissions
  FOR INSERT TO authenticated WITH CHECK (is_lite_manager_plus());
CREATE POLICY lite_permissions_update ON lite_permissions
  FOR UPDATE TO authenticated USING (is_lite_manager_plus());
CREATE POLICY lite_permissions_delete ON lite_permissions
  FOR DELETE TO authenticated USING (is_lite_owner_or_enterprise());

-- lite_daily_ops
DROP POLICY IF EXISTS lite_daily_ops_select ON lite_daily_ops;
DROP POLICY IF EXISTS lite_daily_ops_insert ON lite_daily_ops;
DROP POLICY IF EXISTS lite_daily_ops_update ON lite_daily_ops;
DROP POLICY IF EXISTS lite_daily_ops_delete ON lite_daily_ops;

CREATE POLICY lite_daily_ops_select ON lite_daily_ops
  FOR SELECT TO authenticated USING (true);
CREATE POLICY lite_daily_ops_insert ON lite_daily_ops
  FOR INSERT TO authenticated WITH CHECK (
    location_id IN (SELECT get_my_lite_location_ids()) OR is_lite_owner_or_enterprise()
  );
CREATE POLICY lite_daily_ops_update ON lite_daily_ops
  FOR UPDATE TO authenticated USING (
    location_id IN (SELECT get_my_lite_location_ids()) OR is_lite_owner_or_enterprise()
  );
CREATE POLICY lite_daily_ops_delete ON lite_daily_ops
  FOR DELETE TO authenticated USING (
    is_lite_owner_or_enterprise()
  );

-- lite_audit_log
DROP POLICY IF EXISTS lite_audit_log_select ON lite_audit_log;
DROP POLICY IF EXISTS lite_audit_log_insert ON lite_audit_log;
DROP POLICY IF EXISTS lite_audit_log_update ON lite_audit_log;
DROP POLICY IF EXISTS lite_audit_log_delete ON lite_audit_log;

CREATE POLICY lite_audit_log_select ON lite_audit_log
  FOR SELECT TO authenticated USING (true);
CREATE POLICY lite_audit_log_insert ON lite_audit_log
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY lite_audit_log_update ON lite_audit_log
  FOR UPDATE TO authenticated USING (false);
CREATE POLICY lite_audit_log_delete ON lite_audit_log
  FOR DELETE TO authenticated USING (false);
