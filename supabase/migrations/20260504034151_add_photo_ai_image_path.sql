-- Medium-resolution JPEG derivative used for AI analysis and normal in-app
-- viewing so Supabase Storage does not serve full camera originals for every
-- detection or photo open.
ALTER TABLE photos ADD COLUMN IF NOT EXISTS ai_image_path TEXT;
