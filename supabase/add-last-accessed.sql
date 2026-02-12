-- ============================================================
-- ADD LAST ACCESSED TRACKING
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- ============================================================
-- Adds a last_accessed_at column to profiles that updates every time
-- a user loads the app (not just when they enter credentials).
-- Also adds an RLS policy allowing users to update their own profile.
-- ============================================================

-- Add the column
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_accessed_at TIMESTAMPTZ;

-- Backfill existing profiles with their created_at timestamp
UPDATE profiles SET last_accessed_at = COALESCE(last_accessed_at, created_at);

-- Allow users to update their own profile (for last_accessed_at stamping)
-- Current RLS only allows owners to update OTHER profiles (auth.uid() != id)
-- This policy allows any user to update their own row
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
