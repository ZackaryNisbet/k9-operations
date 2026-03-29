-- Add thumbnail_path for JPEG thumbnails generated on upload
ALTER TABLE photos ADD COLUMN IF NOT EXISTS thumbnail_path TEXT;

-- Add multi-dog pairing columns (JSONB arrays)
ALTER TABLE photos ADD COLUMN IF NOT EXISTS paired_dog_ids JSONB DEFAULT '[]'::jsonb;
ALTER TABLE photos ADD COLUMN IF NOT EXISTS paired_dog_names JSONB DEFAULT '[]'::jsonb;
