-- © 2026 K9 Operations LLC. All Rights Reserved.
-- Migration: Add location_limit column to subscriptions table
-- Maps subscription plans to the number of locations allowed:
--   single_location  → 1
--   multi_location_3 → 3
--   multi_location_10 → 10
--   enterprise       → -1 (unlimited)
--
-- DO NOT RUN — migration file for reference. Apply when ready via:
--   supabase db push
-- or manually in the Supabase SQL editor.

-- Add location_limit column
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS location_limit INTEGER DEFAULT 1;

-- Add unique constraint on user_id for upsert support
-- (The webhook uses onConflict: "user_id")
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_user_id_key'
  ) THEN
    ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_user_id_key UNIQUE (user_id);
  END IF;
END $$;

-- Backfill existing rows based on plan_type
UPDATE subscriptions SET location_limit = 1  WHERE plan_type = 'single_location'  AND location_limit IS NULL;
UPDATE subscriptions SET location_limit = 3  WHERE plan_type = 'multi_location_3' AND location_limit IS NULL;
UPDATE subscriptions SET location_limit = 10 WHERE plan_type = 'multi_location_10' AND location_limit IS NULL;
UPDATE subscriptions SET location_limit = -1 WHERE plan_type = 'enterprise'       AND location_limit IS NULL;

-- Comment for documentation
COMMENT ON COLUMN subscriptions.location_limit IS 'Max locations allowed: 1 (Starter), 3 (Growth), 10 (Scale), -1 (Enterprise/unlimited)';
