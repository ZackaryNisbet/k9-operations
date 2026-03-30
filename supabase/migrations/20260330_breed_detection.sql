-- Add multi-breed detection columns
ALTER TABLE photos ADD COLUMN IF NOT EXISTS detected_breeds JSONB DEFAULT '[]'::jsonb;
ALTER TABLE photos ADD COLUMN IF NOT EXISTS breed_detection_status TEXT DEFAULT 'pending';
-- breed_detection_status: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped'
