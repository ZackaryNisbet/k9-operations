-- Marketing Directory notes — a running, timestamped note log per directory record
-- (organization or contact). Relational, one row per note (no JSON blobs), so notes
-- carry author + time and can be added/removed independently. Mirrors the
-- attachment table's parent model: exactly one of org_id / contact_id is set.
BEGIN;

CREATE TABLE IF NOT EXISTS public.marketing_directory_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  org_id uuid REFERENCES public.marketing_directory_orgs(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.marketing_directory_contacts(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_by_user_id uuid,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by_user_id uuid,
  deleted_by_name text,
  CONSTRAINT marketing_directory_notes_parent_chk CHECK (
    (org_id IS NOT NULL AND contact_id IS NULL)
    OR (org_id IS NULL AND contact_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS marketing_directory_notes_org_idx
  ON public.marketing_directory_notes (org_id, created_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS marketing_directory_notes_contact_idx
  ON public.marketing_directory_notes (contact_id, created_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS marketing_directory_notes_location_idx
  ON public.marketing_directory_notes (location_id, created_at DESC);

ALTER TABLE public.marketing_directory_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketing_directory_notes_read ON public.marketing_directory_notes;
CREATE POLICY marketing_directory_notes_read ON public.marketing_directory_notes
  FOR SELECT TO authenticated
  USING (public.labor_has_location_access(location_id));

DROP POLICY IF EXISTS marketing_directory_notes_insert ON public.marketing_directory_notes;
CREATE POLICY marketing_directory_notes_insert ON public.marketing_directory_notes
  FOR INSERT TO authenticated
  WITH CHECK (
    public.labor_has_management_access(location_id)
    AND (
      (org_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.marketing_directory_orgs o
        WHERE o.id = org_id AND o.location_id = marketing_directory_notes.location_id
      ))
      OR (contact_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.marketing_directory_contacts c
        WHERE c.id = contact_id AND c.location_id = marketing_directory_notes.location_id
      ))
    )
  );

DROP POLICY IF EXISTS marketing_directory_notes_update ON public.marketing_directory_notes;
CREATE POLICY marketing_directory_notes_update ON public.marketing_directory_notes
  FOR UPDATE TO authenticated
  USING (public.labor_has_management_access(location_id))
  WITH CHECK (public.labor_has_management_access(location_id));

GRANT SELECT, INSERT, UPDATE ON public.marketing_directory_notes TO authenticated;

COMMIT;
