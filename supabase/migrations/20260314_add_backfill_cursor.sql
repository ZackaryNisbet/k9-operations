-- Add backfill_cursor to gingr_sync_state for resumable historical sync
ALTER TABLE gingr_sync_state ADD COLUMN IF NOT EXISTS backfill_cursor TEXT;
