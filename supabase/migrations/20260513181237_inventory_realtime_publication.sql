DO $$
DECLARE
  realtime_table text;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication
    WHERE pubname = 'supabase_realtime'
  ) THEN
    RETURN;
  END IF;

  FOREACH realtime_table IN ARRAY ARRAY[
    'inventory_catalog',
    'inventory_snapshots',
    'inventory_counts',
    'inventory_adhoc_items'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = realtime_table
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', realtime_table);
    END IF;
  END LOOP;
END $$;
