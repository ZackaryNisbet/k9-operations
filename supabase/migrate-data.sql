-- © 2026 K9 Operations LLC. All Rights Reserved.
-- One-time data migration: Extract entities from JSONB blob into normalized tables.
--
-- IMPORTANT: Run normalize-tables.sql FIRST to create the tables.
-- This script does NOT modify the original blob — it stays intact as backup.
-- Run this in Supabase SQL Editor.
--
-- Target location: 8ea382b0-63f7-44ac-b6f8-83243c03d946

DO $$
DECLARE
  loc_id UUID := '8ea382b0-63f7-44ac-b6f8-83243c03d946';
  loc_data JSONB;
  elem JSONB;
  elem_id TEXT;
BEGIN
  -- Fetch the full blob
  SELECT data INTO loc_data FROM locations WHERE id = loc_id;

  IF loc_data IS NULL THEN
    RAISE NOTICE 'No data found for location %', loc_id;
    RETURN;
  END IF;

  -- ============================================================
  -- 1. Migrate clients
  -- ============================================================
  IF loc_data->'clients' IS NOT NULL AND jsonb_typeof(loc_data->'clients') = 'array' THEN
    FOR elem IN SELECT * FROM jsonb_array_elements(loc_data->'clients')
    LOOP
      elem_id := elem->>'id';
      IF elem_id IS NOT NULL THEN
        INSERT INTO k9_clients (id, location_id, doc)
        VALUES (elem_id::UUID, loc_id, elem)
        ON CONFLICT (id) DO UPDATE SET doc = EXCLUDED.doc, updated_at = NOW();
      END IF;
    END LOOP;
    RAISE NOTICE 'Migrated % clients', jsonb_array_length(loc_data->'clients');
  END IF;

  -- ============================================================
  -- 2. Migrate dogs
  -- ============================================================
  IF loc_data->'dogs' IS NOT NULL AND jsonb_typeof(loc_data->'dogs') = 'array' THEN
    FOR elem IN SELECT * FROM jsonb_array_elements(loc_data->'dogs')
    LOOP
      elem_id := elem->>'id';
      IF elem_id IS NOT NULL THEN
        INSERT INTO k9_dogs (id, location_id, client_id, doc)
        VALUES (
          elem_id::UUID,
          loc_id,
          CASE WHEN elem->>'clientId' IS NOT NULL THEN (elem->>'clientId')::UUID ELSE NULL END,
          elem
        )
        ON CONFLICT (id) DO UPDATE SET doc = EXCLUDED.doc, client_id = EXCLUDED.client_id, updated_at = NOW();
      END IF;
    END LOOP;
    RAISE NOTICE 'Migrated % dogs', jsonb_array_length(loc_data->'dogs');
  END IF;

  -- ============================================================
  -- 3. Migrate reservations
  -- ============================================================
  IF loc_data->'reservations' IS NOT NULL AND jsonb_typeof(loc_data->'reservations') = 'array' THEN
    FOR elem IN SELECT * FROM jsonb_array_elements(loc_data->'reservations')
    LOOP
      elem_id := elem->>'id';
      IF elem_id IS NOT NULL THEN
        INSERT INTO k9_reservations (id, location_id, client_id, dog_id, status, check_in, check_out, doc)
        VALUES (
          elem_id::UUID,
          loc_id,
          CASE WHEN elem->>'clientId' IS NOT NULL THEN (elem->>'clientId')::UUID ELSE NULL END,
          CASE WHEN elem->>'dogId' IS NOT NULL THEN (elem->>'dogId')::UUID ELSE NULL END,
          elem->>'status',
          CASE WHEN elem->>'checkIn' IS NOT NULL THEN (elem->>'checkIn')::DATE ELSE NULL END,
          CASE WHEN elem->>'checkOut' IS NOT NULL THEN (elem->>'checkOut')::DATE ELSE NULL END,
          elem
        )
        ON CONFLICT (id) DO UPDATE SET doc = EXCLUDED.doc, status = EXCLUDED.status,
          check_in = EXCLUDED.check_in, check_out = EXCLUDED.check_out, updated_at = NOW();
      END IF;
    END LOOP;
    RAISE NOTICE 'Migrated % reservations', jsonb_array_length(loc_data->'reservations');
  END IF;

  -- ============================================================
  -- 4. Migrate packages
  -- ============================================================
  IF loc_data->'packages' IS NOT NULL AND jsonb_typeof(loc_data->'packages') = 'array' THEN
    FOR elem IN SELECT * FROM jsonb_array_elements(loc_data->'packages')
    LOOP
      elem_id := elem->>'id';
      IF elem_id IS NOT NULL THEN
        INSERT INTO k9_packages (id, location_id, doc)
        VALUES (elem_id::UUID, loc_id, elem)
        ON CONFLICT (id) DO UPDATE SET doc = EXCLUDED.doc, updated_at = NOW();
      END IF;
    END LOOP;
    RAISE NOTICE 'Migrated % packages', jsonb_array_length(loc_data->'packages');
  END IF;

  -- ============================================================
  -- 5. Migrate messages
  -- ============================================================
  IF loc_data->'messages' IS NOT NULL AND jsonb_typeof(loc_data->'messages') = 'array' THEN
    FOR elem IN SELECT * FROM jsonb_array_elements(loc_data->'messages')
    LOOP
      elem_id := elem->>'id';
      IF elem_id IS NOT NULL THEN
        INSERT INTO k9_messages (id, location_id, client_id, sent_at, doc)
        VALUES (
          elem_id::UUID,
          loc_id,
          CASE WHEN elem->>'clientId' IS NOT NULL THEN (elem->>'clientId')::UUID ELSE NULL END,
          CASE WHEN elem->>'timestamp' IS NOT NULL THEN (elem->>'timestamp')::TIMESTAMPTZ ELSE NULL END,
          elem
        )
        ON CONFLICT (id) DO UPDATE SET doc = EXCLUDED.doc;
      END IF;
    END LOOP;
    RAISE NOTICE 'Migrated % messages', jsonb_array_length(loc_data->'messages');
  END IF;

  -- ============================================================
  -- 6. Migrate EOD entries (uses TEXT id, not UUID)
  -- ============================================================
  IF loc_data->'eodEntries' IS NOT NULL AND jsonb_typeof(loc_data->'eodEntries') = 'array' THEN
    FOR elem IN SELECT * FROM jsonb_array_elements(loc_data->'eodEntries')
    LOOP
      elem_id := elem->>'id';
      IF elem_id IS NOT NULL THEN
        INSERT INTO k9_eod_entries (id, location_id, entry_date, doc)
        VALUES (
          elem_id,
          loc_id,
          CASE WHEN elem->>'date' IS NOT NULL THEN (elem->>'date')::DATE ELSE NULL END,
          elem
        )
        ON CONFLICT (id) DO UPDATE SET doc = EXCLUDED.doc, updated_at = NOW();
      END IF;
    END LOOP;
    RAISE NOTICE 'Migrated % eodEntries', jsonb_array_length(loc_data->'eodEntries');
  END IF;

  -- ============================================================
  -- 7. Migrate reminder log (uses TEXT id)
  -- ============================================================
  IF loc_data->'automations' IS NOT NULL AND loc_data->'automations'->'reminderLog' IS NOT NULL
     AND jsonb_typeof(loc_data->'automations'->'reminderLog') = 'array' THEN
    FOR elem IN SELECT * FROM jsonb_array_elements(loc_data->'automations'->'reminderLog')
    LOOP
      elem_id := elem->>'id';
      IF elem_id IS NOT NULL THEN
        INSERT INTO k9_reminder_log (id, location_id, client_id, sent_at, doc)
        VALUES (
          elem_id,
          loc_id,
          CASE WHEN elem->>'clientId' IS NOT NULL THEN (elem->>'clientId')::UUID ELSE NULL END,
          CASE WHEN elem->>'sentAt' IS NOT NULL THEN (elem->>'sentAt')::TIMESTAMPTZ ELSE NULL END,
          elem
        )
        ON CONFLICT (id) DO NOTHING;
      END IF;
    END LOOP;
    RAISE NOTICE 'Migrated % reminder log entries', jsonb_array_length(loc_data->'automations'->'reminderLog');
  END IF;

  RAISE NOTICE 'Migration complete for location %', loc_id;
END $$;

-- ============================================================
-- Verification queries — run these after migration to confirm counts
-- ============================================================
-- SELECT 'k9_clients' AS tbl, COUNT(*) FROM k9_clients WHERE location_id = '8ea382b0-63f7-44ac-b6f8-83243c03d946'
-- UNION ALL SELECT 'k9_dogs', COUNT(*) FROM k9_dogs WHERE location_id = '8ea382b0-63f7-44ac-b6f8-83243c03d946'
-- UNION ALL SELECT 'k9_reservations', COUNT(*) FROM k9_reservations WHERE location_id = '8ea382b0-63f7-44ac-b6f8-83243c03d946'
-- UNION ALL SELECT 'k9_packages', COUNT(*) FROM k9_packages WHERE location_id = '8ea382b0-63f7-44ac-b6f8-83243c03d946'
-- UNION ALL SELECT 'k9_messages', COUNT(*) FROM k9_messages WHERE location_id = '8ea382b0-63f7-44ac-b6f8-83243c03d946'
-- UNION ALL SELECT 'k9_eod_entries', COUNT(*) FROM k9_eod_entries WHERE location_id = '8ea382b0-63f7-44ac-b6f8-83243c03d946'
-- UNION ALL SELECT 'k9_reminder_log', COUNT(*) FROM k9_reminder_log WHERE location_id = '8ea382b0-63f7-44ac-b6f8-83243c03d946';
