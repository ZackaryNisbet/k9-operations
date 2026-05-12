-- Fix Company Directory profile-photo storage writes.
-- The UI uploads to <person_uuid>/<timestamp>-<name>.<ext>; storage.foldername(name)
-- returns only the folder segments, so a single UUID folder is valid.

BEGIN;

DROP POLICY IF EXISTS enterprise_directory_photos_insert ON storage.objects;
CREATE POLICY enterprise_directory_photos_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'enterprise-directory-photos'
    AND public.enterprise_directory_can_manage()
    AND array_length(storage.foldername(name), 1) >= 1
    AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  );

COMMIT;
