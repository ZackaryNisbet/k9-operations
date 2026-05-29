-- Storage bucket for uploaded incident report PDFs (Incidents module).
--
-- The Incidents module was reworked from a form-filling tool into a simple
-- "upload the signed PDF + log the entry" table. Uploaded documents live in a
-- private bucket and are referenced from client_incident_cases.metadata.document.
--
-- Path convention: <location_id>/<case_id>/<filename>
--   foldername[1] = location_id  -> gates access by the same management helper
--   the client_incident_* tables already use (labor_has_management_access).

BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'incident-documents',
  'incident-documents',
  false,
  26214400, -- 25 MB
  ARRAY['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/heic']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS incident_documents_select ON storage.objects;
CREATE POLICY incident_documents_select
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'incident-documents'
    AND array_length(storage.foldername(name), 1) >= 1
    AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.labor_has_management_access(((storage.foldername(name))[1])::uuid)
  );

DROP POLICY IF EXISTS incident_documents_insert ON storage.objects;
CREATE POLICY incident_documents_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'incident-documents'
    AND array_length(storage.foldername(name), 1) >= 1
    AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.labor_has_management_access(((storage.foldername(name))[1])::uuid)
  );

DROP POLICY IF EXISTS incident_documents_update ON storage.objects;
CREATE POLICY incident_documents_update
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'incident-documents'
    AND array_length(storage.foldername(name), 1) >= 1
    AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.labor_has_management_access(((storage.foldername(name))[1])::uuid)
  )
  WITH CHECK (
    bucket_id = 'incident-documents'
    AND array_length(storage.foldername(name), 1) >= 1
    AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.labor_has_management_access(((storage.foldername(name))[1])::uuid)
  );

DROP POLICY IF EXISTS incident_documents_delete ON storage.objects;
CREATE POLICY incident_documents_delete
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'incident-documents'
    AND array_length(storage.foldername(name), 1) >= 1
    AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.labor_has_management_access(((storage.foldername(name))[1])::uuid)
  );

COMMIT;
