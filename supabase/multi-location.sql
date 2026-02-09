-- ============================================================
-- MULTI-LOCATION: Schema changes + RPC functions
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- ============================================================

-- 1. Add slug and region columns to locations table
ALTER TABLE locations ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS region TEXT;

-- Backfill existing locations with slugs generated from their name
UPDATE locations
SET slug = lower(regexp_replace(trim(name), '[^a-zA-Z0-9]+', '-', 'g'))
WHERE slug IS NULL;

-- ============================================================
-- 2. create_location: Creates a new location row
--    Only owners can call. Returns the new location info.
--    Sets data to {"_initialized": true} so the app doesn't
--    auto-populate it with demo data.
-- ============================================================
CREATE OR REPLACE FUNCTION create_location(p_name TEXT, p_region TEXT DEFAULT '')
RETURNS JSONB AS $$
DECLARE
  new_loc_id UUID;
  loc_slug TEXT;
  slug_candidate TEXT;
  slug_suffix INT := 0;
BEGIN
  -- Only owners can create locations
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner') THEN
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

  -- Insert the new location (empty but marked as initialized)
  INSERT INTO locations (name, slug, region, data)
  VALUES (trim(p_name), loc_slug, trim(p_region), '{"_initialized": true}'::jsonb)
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
-- 3. list_locations: Returns all locations for owners,
--    or just the user's assigned location for others.
-- ============================================================
CREATE OR REPLACE FUNCTION list_locations()
RETURNS JSONB AS $$
DECLARE
  user_role TEXT;
BEGIN
  SELECT role INTO user_role FROM profiles WHERE id = auth.uid();

  IF user_role = 'owner' THEN
    -- Owners see all locations
    RETURN (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'id', id,
          'name', name,
          'slug', COALESCE(slug, lower(regexp_replace(trim(name), '[^a-zA-Z0-9]+', '-', 'g'))),
          'region', COALESCE(region, ''),
          'created_at', created_at
        ) ORDER BY created_at
      ), '[]'::jsonb)
      FROM locations
    );
  ELSE
    -- Non-owners see only their assigned location
    RETURN (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'id', l.id,
          'name', l.name,
          'slug', COALESCE(l.slug, lower(regexp_replace(trim(l.name), '[^a-zA-Z0-9]+', '-', 'g'))),
          'region', COALESCE(l.region, ''),
          'created_at', l.created_at
        )
      ), '[]'::jsonb)
      FROM locations l
      INNER JOIN profiles p ON p.location_id = l.id
      WHERE p.id = auth.uid()
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- 4. switch_location: Updates the caller's profile to point
--    to a different location. Only owners can switch.
-- ============================================================
CREATE OR REPLACE FUNCTION switch_location(p_location_id UUID)
RETURNS JSONB AS $$
BEGIN
  -- Only owners can switch locations
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner') THEN
    RETURN jsonb_build_object('success', false, 'message', 'Only owners can switch locations');
  END IF;

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
