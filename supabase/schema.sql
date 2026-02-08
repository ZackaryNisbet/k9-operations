-- K9 Operations Database Schema
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor > New Query)

-- 1. Locations table: stores all data for each K9 Resorts location as JSON
--    This is a pragmatic "phase 1" approach that lets us ship fast.
--    We'll normalize into separate tables (clients, dogs, reservations, etc.) in phase 2.
CREATE TABLE IF NOT EXISTS locations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'K9 Resorts',
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. User profiles: links Supabase auth users to locations
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT,
  full_name TEXT,
  role TEXT DEFAULT 'staff' CHECK (role IN ('owner', 'manager', 'staff')),
  location_id UUID REFERENCES locations(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Auto-update the updated_at timestamp on location data changes
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER locations_updated_at
  BEFORE UPDATE ON locations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- 4. Row-Level Security: users can only access their own location's data
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read/update their own profile
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Locations: users can read/update their location
CREATE POLICY "Users can view their location"
  ON locations FOR SELECT
  USING (id IN (SELECT location_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can update their location"
  ON locations FOR UPDATE
  USING (id IN (SELECT location_id FROM profiles WHERE id = auth.uid()));

-- 5. Auto-create profile when a new user signs up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- 6. Create default location and assign first user
-- Run this AFTER creating your first account:
-- INSERT INTO locations (name) VALUES ('K9 Resorts Cherry Hill');
-- UPDATE profiles SET location_id = (SELECT id FROM locations LIMIT 1), role = 'owner' WHERE email = 'zacknisbet@gmail.com';
