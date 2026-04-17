-- Employee note attachments
-- Private Storage bucket + document metadata linkage for manager evidence files.

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'labor-employee-attachments',
  'labor-employee-attachments',
  false,
  20971520,
  ARRAY[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

ALTER TABLE public.labor_employee_documents
  ADD COLUMN IF NOT EXISTS labor_employee_note_id uuid
    REFERENCES public.labor_employee_notes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS mime_type text,
  ADD COLUMN IF NOT EXISTS file_size_bytes bigint,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS deleted_by_name text,
  ADD COLUMN IF NOT EXISTS delete_reason text;

CREATE INDEX IF NOT EXISTS labor_employee_documents_note_idx
  ON public.labor_employee_documents (labor_employee_note_id, uploaded_at DESC);

CREATE INDEX IF NOT EXISTS labor_employee_documents_storage_path_idx
  ON public.labor_employee_documents (storage_bucket, storage_path);

CREATE INDEX IF NOT EXISTS labor_employee_documents_active_employee_idx
  ON public.labor_employee_documents (labor_employee_id, uploaded_at DESC)
  WHERE deleted_at IS NULL;

DROP POLICY IF EXISTS labor_employee_attachments_select ON storage.objects;
CREATE POLICY labor_employee_attachments_select
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'labor-employee-attachments'
    AND array_length(storage.foldername(name), 1) >= 1
    AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND EXISTS (
      SELECT 1
      FROM public.labor_employees e
      WHERE e.id = ((storage.foldername(name))[1])::uuid
        AND public.labor_has_management_access(e.location_id)
    )
  );

DROP POLICY IF EXISTS labor_employee_attachments_insert ON storage.objects;
CREATE POLICY labor_employee_attachments_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'labor-employee-attachments'
    AND array_length(storage.foldername(name), 1) >= 2
    AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND EXISTS (
      SELECT 1
      FROM public.labor_employees e
      WHERE e.id = ((storage.foldername(name))[1])::uuid
        AND public.labor_has_management_access(e.location_id)
    )
    AND (
      (
        (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND EXISTS (
          SELECT 1
          FROM public.labor_employee_notes n
          WHERE n.labor_employee_id = ((storage.foldername(name))[1])::uuid
            AND n.id = ((storage.foldername(name))[2])::uuid
        )
      )
      OR (
        array_length(storage.foldername(name), 1) >= 4
        AND (storage.foldername(name))[2] = 'requirements'
      )
    )
  );
