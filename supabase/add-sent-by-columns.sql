-- Add sent_by column to k9_messages and agreement_log tables
-- Safe to run multiple times (IF NOT EXISTS)

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'k9_messages' AND column_name = 'sent_by') THEN
    ALTER TABLE k9_messages ADD COLUMN sent_by TEXT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'agreement_log' AND column_name = 'sent_by') THEN
    ALTER TABLE agreement_log ADD COLUMN sent_by TEXT;
  END IF;
END $$;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
