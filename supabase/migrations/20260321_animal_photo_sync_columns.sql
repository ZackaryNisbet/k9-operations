ALTER TABLE gingr_animals
  ADD COLUMN IF NOT EXISTS local_photo_url TEXT,
  ADD COLUMN IF NOT EXISTS photo_synced_from TEXT;
