-- Allow managers/admins to insert private interview documents under
-- <location_id>/... paths. The initial policy had a malformed UUID pattern
-- that omitted one UUID segment, which can block template/audio uploads.
DROP POLICY IF EXISTS labor_interview_documents_insert ON storage.objects;
CREATE POLICY labor_interview_documents_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'labor-interview-documents'
    AND array_length(storage.foldername(name), 1) >= 2
    AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.labor_has_management_access(((storage.foldername(name))[1])::uuid)
  );
