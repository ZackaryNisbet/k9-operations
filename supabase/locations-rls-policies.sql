-- ============================================================
-- RLS Policies for the `locations` table
-- ============================================================
-- RLS is already enabled (schema.sql) but NO policies exist,
-- which means all direct queries are blocked. This script adds
-- the required policies so the app works with RLS active.
--
-- Run this in your Supabase SQL Editor.
-- ============================================================

-- 1. SELECT: Users can read their own assigned location
DROP POLICY IF EXISTS "Users can view own location" ON locations;
CREATE POLICY "Users can view own location"
  ON locations FOR SELECT
  USING (
    id IN (SELECT location_id FROM profiles WHERE profiles.id = auth.uid())
  );

-- 2. SELECT: Owners and enterprise admins can read ALL locations
--    (needed for enterprise oversight, package push pricing lookups, etc.)
DROP POLICY IF EXISTS "Enterprise admins can view all locations" ON locations;
CREATE POLICY "Enterprise admins can view all locations"
  ON locations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('owner', 'enterprise_admin')
    )
  );

-- 3. UPDATE: Users can update their own location (settings saves)
DROP POLICY IF EXISTS "Users can update own location" ON locations;
CREATE POLICY "Users can update own location"
  ON locations FOR UPDATE
  USING (
    id IN (SELECT location_id FROM profiles WHERE profiles.id = auth.uid())
  );

-- 4. UPDATE: Owners and enterprise admins can update ALL locations
DROP POLICY IF EXISTS "Enterprise admins can update all locations" ON locations;
CREATE POLICY "Enterprise admins can update all locations"
  ON locations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('owner', 'enterprise_admin')
    )
  );

-- 5. INSERT: Only owners can create new locations
DROP POLICY IF EXISTS "Owners can insert locations" ON locations;
CREATE POLICY "Owners can insert locations"
  ON locations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('owner', 'enterprise_admin')
    )
  );

-- 6. DELETE: Only owners can delete locations
DROP POLICY IF EXISTS "Owners can delete locations" ON locations;
CREATE POLICY "Owners can delete locations"
  ON locations FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'owner'
    )
  );


-- ============================================================
-- RLS Policies for the `profiles` table (supplement)
-- ============================================================
-- Allow enterprise admins to view all profiles (for team management)
DROP POLICY IF EXISTS "Enterprise admins can view all profiles" ON profiles;
CREATE POLICY "Enterprise admins can view all profiles"
  ON profiles FOR SELECT
  USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('owner', 'enterprise_admin')
    )
  );
