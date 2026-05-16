DROP POLICY IF EXISTS resort_upkeep_storage_select ON storage.objects;
CREATE POLICY resort_upkeep_storage_select
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'resort-upkeep-attachments'
    AND array_length(storage.foldername(name), 1) >= 2
    AND CASE
      WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN public.resort_upkeep_can_access(((storage.foldername(name))[1])::uuid)
      ELSE false
    END
  );

DROP POLICY IF EXISTS resort_upkeep_storage_insert ON storage.objects;
CREATE POLICY resort_upkeep_storage_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'resort-upkeep-attachments'
    AND array_length(storage.foldername(name), 1) >= 2
    AND CASE
      WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN (
          (
            public.resort_upkeep_can_manage(((storage.foldername(name))[1])::uuid)
            AND (
              (storage.foldername(name))[2] IN ('vendors', 'licenses')
              OR (
                (storage.foldername(name))[2] = 'maintenance'
                AND array_length(storage.foldername(name), 1) >= 3
                AND (storage.foldername(name))[3] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                AND EXISTS (
                  SELECT 1
                  FROM public.resort_upkeep_periods p
                  WHERE p.id = ((storage.foldername(name))[3])::uuid
                    AND p.location_id = ((storage.foldername(name))[1])::uuid
                    AND public.resort_upkeep_period_can_edit(p.status, p.period_end, p.first_submitted_at, CURRENT_DATE)
                )
              )
            )
          )
          OR (
            public.resort_upkeep_can_complete(((storage.foldername(name))[1])::uuid)
            AND (storage.foldername(name))[2] = 'maintenance'
            AND array_length(storage.foldername(name), 1) >= 3
            AND (storage.foldername(name))[3] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            AND EXISTS (
              SELECT 1
              FROM public.resort_upkeep_periods p
              WHERE p.id = ((storage.foldername(name))[3])::uuid
                AND p.location_id = ((storage.foldername(name))[1])::uuid
                AND public.resort_upkeep_period_can_edit(p.status, p.period_end, p.first_submitted_at, CURRENT_DATE)
            )
          )
        )
      ELSE false
    END
  );
