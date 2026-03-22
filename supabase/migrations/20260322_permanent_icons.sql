-- Make animal icons permanent: stop deleting on checkout, add tracking timestamps
ALTER TABLE gingr_animal_icons_live
  ADD COLUMN IF NOT EXISTS first_seen_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ DEFAULT now();

-- Backfill existing rows
UPDATE gingr_animal_icons_live
SET first_seen_at = synced_at, last_seen_at = synced_at
WHERE first_seen_at IS NULL;
