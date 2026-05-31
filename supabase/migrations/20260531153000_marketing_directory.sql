-- Marketing Directory (Linear K9-11) — an organizations + affiliated-contacts CRM
-- that backs the grassroots marketing tracker. Organizations hold many contacts;
-- a contact with no org_id is a standalone "individual" (the org-vs-individual pill
-- filter on the page). Business cards and other files attach to either an org or a
-- contact. A change-log table (populated by triggers) powers the History subtab.
--
-- The directory cross-references the tracker: orgs/contacts carry an optional
-- grassroots_target_id so an event organizer or a visited business can be linked to
-- (and kept in sync with) its directory record.
BEGIN;

-- ─── Organizations ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.marketing_directory_orgs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  org_type text,
  address text,
  address_line_1 text,
  address_line_2 text,
  address_city text,
  address_state text,
  address_postal_code text,
  address_country text,
  google_place_id text,
  phone text,
  email text,
  website text,
  notes text,
  grassroots_target_id uuid REFERENCES public.grassroots_targets(id) ON DELETE SET NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid,
  created_by_name text,
  updated_by_user_id uuid,
  updated_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ─── Contacts (org_id NULL ⇒ standalone individual) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.marketing_directory_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  org_id uuid REFERENCES public.marketing_directory_orgs(id) ON DELETE CASCADE,
  first_name text,
  last_name text,
  title text,
  email text,
  phone text,
  notes text,
  grassroots_target_id uuid REFERENCES public.grassroots_targets(id) ON DELETE SET NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid,
  created_by_name text,
  updated_by_user_id uuid,
  updated_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ─── Attachments (business cards + general files), one parent only ───────────
CREATE TABLE IF NOT EXISTS public.marketing_directory_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  org_id uuid REFERENCES public.marketing_directory_orgs(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.marketing_directory_contacts(id) ON DELETE CASCADE,
  attachment_type text NOT NULL DEFAULT 'attachment'
    CHECK (attachment_type IN ('business_card', 'attachment')),
  file_name text NOT NULL,
  storage_bucket text NOT NULL DEFAULT 'marketing-directory-attachments',
  storage_path text NOT NULL,
  mime_type text NOT NULL,
  file_size_bytes bigint NOT NULL CHECK (file_size_bytes > 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  uploaded_by_user_id uuid,
  uploaded_by_name text,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by_user_id uuid,
  deleted_by_name text,
  delete_reason text,
  CONSTRAINT marketing_directory_attachments_parent_chk CHECK (
    (org_id IS NOT NULL AND contact_id IS NULL)
    OR (org_id IS NULL AND contact_id IS NOT NULL)
  ),
  CONSTRAINT marketing_directory_attachments_storage_uidx UNIQUE (storage_bucket, storage_path)
);

-- ─── Change log (drives the History subtab) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.marketing_directory_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('org', 'contact')),
  entity_id uuid NOT NULL,
  entity_name text NOT NULL DEFAULT '',
  event_type text NOT NULL CHECK (event_type IN ('created', 'updated', 'deleted')),
  summary text NOT NULL DEFAULT '',
  changed_by_user_id uuid,
  changed_by_name text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  event_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS marketing_directory_orgs_location_idx
  ON public.marketing_directory_orgs (location_id, name);
CREATE INDEX IF NOT EXISTS marketing_directory_orgs_grassroots_idx
  ON public.marketing_directory_orgs (grassroots_target_id)
  WHERE grassroots_target_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS marketing_directory_contacts_location_idx
  ON public.marketing_directory_contacts (location_id, org_id);
CREATE INDEX IF NOT EXISTS marketing_directory_contacts_individual_idx
  ON public.marketing_directory_contacts (location_id)
  WHERE org_id IS NULL;
CREATE INDEX IF NOT EXISTS marketing_directory_attachments_org_idx
  ON public.marketing_directory_attachments (org_id, uploaded_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS marketing_directory_attachments_contact_idx
  ON public.marketing_directory_attachments (contact_id, uploaded_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS marketing_directory_history_location_idx
  ON public.marketing_directory_history (location_id, event_at DESC);

-- ─── updated_at maintenance ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.marketing_directory_updated_at_trigger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_marketing_directory_orgs_updated ON public.marketing_directory_orgs;
CREATE TRIGGER trg_marketing_directory_orgs_updated
  BEFORE UPDATE ON public.marketing_directory_orgs
  FOR EACH ROW EXECUTE FUNCTION public.marketing_directory_updated_at_trigger();

DROP TRIGGER IF EXISTS trg_marketing_directory_contacts_updated ON public.marketing_directory_contacts;
CREATE TRIGGER trg_marketing_directory_contacts_updated
  BEFORE UPDATE ON public.marketing_directory_contacts
  FOR EACH ROW EXECUTE FUNCTION public.marketing_directory_updated_at_trigger();

-- ─── History logging (SECURITY DEFINER so it can write the audit row regardless
-- of the actor's RLS; the actor still had to pass orgs/contacts write RLS to get
-- here). One function, parameterised by entity type via the trigger argument. ──
CREATE OR REPLACE FUNCTION public.marketing_directory_log_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_entity_type text := TG_ARGV[0];
  v_event text;
  v_row record;
  v_name text;
  v_actor_id uuid;
  v_actor_name text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_event := 'created';
    v_row := NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    v_event := 'updated';
    v_row := NEW;
  ELSE
    v_event := 'deleted';
    v_row := OLD;
  END IF;

  IF v_entity_type = 'org' THEN
    v_name := COALESCE(NULLIF(btrim(v_row.name), ''), 'Untitled organization');
  ELSE
    v_name := COALESCE(NULLIF(btrim(concat_ws(' ', v_row.first_name, v_row.last_name)), ''), 'Unnamed contact');
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_actor_id := v_row.created_by_user_id;
    v_actor_name := v_row.created_by_name;
  ELSIF TG_OP = 'UPDATE' THEN
    v_actor_id := COALESCE(v_row.updated_by_user_id, v_row.created_by_user_id);
    v_actor_name := COALESCE(v_row.updated_by_name, v_row.created_by_name);
  ELSE
    v_actor_id := COALESCE(v_row.updated_by_user_id, v_row.created_by_user_id);
    v_actor_name := COALESCE(v_row.updated_by_name, v_row.created_by_name);
  END IF;

  INSERT INTO public.marketing_directory_history (
    location_id,
    entity_type,
    entity_id,
    entity_name,
    event_type,
    summary,
    changed_by_user_id,
    changed_by_name
  )
  VALUES (
    v_row.location_id,
    v_entity_type,
    v_row.id,
    v_name,
    v_event,
    initcap(v_event) || ' ' || (CASE WHEN v_entity_type = 'org' THEN 'organization' ELSE 'contact' END) || ' "' || v_name || '"',
    v_actor_id,
    v_actor_name
  );

  RETURN v_row;
END;
$$;

DROP TRIGGER IF EXISTS trg_marketing_directory_orgs_history ON public.marketing_directory_orgs;
CREATE TRIGGER trg_marketing_directory_orgs_history
  AFTER INSERT OR UPDATE OR DELETE ON public.marketing_directory_orgs
  FOR EACH ROW EXECUTE FUNCTION public.marketing_directory_log_history('org');

DROP TRIGGER IF EXISTS trg_marketing_directory_contacts_history ON public.marketing_directory_contacts;
CREATE TRIGGER trg_marketing_directory_contacts_history
  AFTER INSERT OR UPDATE OR DELETE ON public.marketing_directory_contacts
  FOR EACH ROW EXECUTE FUNCTION public.marketing_directory_log_history('contact');

-- ─── Row level security ─────────────────────────────────────────────────────
ALTER TABLE public.marketing_directory_orgs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_directory_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_directory_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_directory_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketing_directory_orgs_read ON public.marketing_directory_orgs;
CREATE POLICY marketing_directory_orgs_read ON public.marketing_directory_orgs
  FOR SELECT TO authenticated
  USING (public.labor_has_location_access(location_id));

DROP POLICY IF EXISTS marketing_directory_orgs_insert ON public.marketing_directory_orgs;
CREATE POLICY marketing_directory_orgs_insert ON public.marketing_directory_orgs
  FOR INSERT TO authenticated
  WITH CHECK (public.labor_has_management_access(location_id));

DROP POLICY IF EXISTS marketing_directory_orgs_update ON public.marketing_directory_orgs;
CREATE POLICY marketing_directory_orgs_update ON public.marketing_directory_orgs
  FOR UPDATE TO authenticated
  USING (public.labor_has_management_access(location_id))
  WITH CHECK (public.labor_has_management_access(location_id));

DROP POLICY IF EXISTS marketing_directory_orgs_delete ON public.marketing_directory_orgs;
CREATE POLICY marketing_directory_orgs_delete ON public.marketing_directory_orgs
  FOR DELETE TO authenticated
  USING (public.labor_has_management_access(location_id));

DROP POLICY IF EXISTS marketing_directory_contacts_read ON public.marketing_directory_contacts;
CREATE POLICY marketing_directory_contacts_read ON public.marketing_directory_contacts
  FOR SELECT TO authenticated
  USING (public.labor_has_location_access(location_id));

DROP POLICY IF EXISTS marketing_directory_contacts_insert ON public.marketing_directory_contacts;
CREATE POLICY marketing_directory_contacts_insert ON public.marketing_directory_contacts
  FOR INSERT TO authenticated
  WITH CHECK (
    public.labor_has_management_access(location_id)
    AND (
      org_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.marketing_directory_orgs o
        WHERE o.id = org_id AND o.location_id = marketing_directory_contacts.location_id
      )
    )
  );

DROP POLICY IF EXISTS marketing_directory_contacts_update ON public.marketing_directory_contacts;
CREATE POLICY marketing_directory_contacts_update ON public.marketing_directory_contacts
  FOR UPDATE TO authenticated
  USING (public.labor_has_management_access(location_id))
  WITH CHECK (public.labor_has_management_access(location_id));

DROP POLICY IF EXISTS marketing_directory_contacts_delete ON public.marketing_directory_contacts;
CREATE POLICY marketing_directory_contacts_delete ON public.marketing_directory_contacts
  FOR DELETE TO authenticated
  USING (public.labor_has_management_access(location_id));

DROP POLICY IF EXISTS marketing_directory_attachments_read ON public.marketing_directory_attachments;
CREATE POLICY marketing_directory_attachments_read ON public.marketing_directory_attachments
  FOR SELECT TO authenticated
  USING (public.labor_has_location_access(location_id));

DROP POLICY IF EXISTS marketing_directory_attachments_insert ON public.marketing_directory_attachments;
CREATE POLICY marketing_directory_attachments_insert ON public.marketing_directory_attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.labor_has_management_access(location_id)
    AND storage_bucket = 'marketing-directory-attachments'
    AND (
      (org_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.marketing_directory_orgs o
        WHERE o.id = org_id AND o.location_id = marketing_directory_attachments.location_id
      ))
      OR (contact_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.marketing_directory_contacts c
        WHERE c.id = contact_id AND c.location_id = marketing_directory_attachments.location_id
      ))
    )
  );

DROP POLICY IF EXISTS marketing_directory_attachments_update ON public.marketing_directory_attachments;
CREATE POLICY marketing_directory_attachments_update ON public.marketing_directory_attachments
  FOR UPDATE TO authenticated
  USING (public.labor_has_management_access(location_id))
  WITH CHECK (public.labor_has_management_access(location_id));

DROP POLICY IF EXISTS marketing_directory_history_read ON public.marketing_directory_history;
CREATE POLICY marketing_directory_history_read ON public.marketing_directory_history
  FOR SELECT TO authenticated
  USING (public.labor_has_location_access(location_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_directory_orgs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_directory_contacts TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.marketing_directory_attachments TO authenticated;
-- History is written only by the SECURITY DEFINER trigger; clients read it.
GRANT SELECT ON public.marketing_directory_history TO authenticated;

-- ─── Storage bucket + object policies (business cards / attachments) ─────────
INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'marketing-directory-attachments',
  'marketing-directory-attachments',
  false,
  20971520,
  ARRAY[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/heic',
    'image/heif'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Object paths are {location_id}/{orgs|contacts}/{entity_id}/{attachment_id}-{file}.
-- The location segment is the security boundary.
DROP POLICY IF EXISTS marketing_directory_attachments_storage_select ON storage.objects;
CREATE POLICY marketing_directory_attachments_storage_select
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'marketing-directory-attachments'
    AND array_length(storage.foldername(name), 1) >= 3
    AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND CASE
      WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN public.labor_has_location_access(((storage.foldername(name))[1])::uuid)
      ELSE false
    END
  );

DROP POLICY IF EXISTS marketing_directory_attachments_storage_insert ON storage.objects;
CREATE POLICY marketing_directory_attachments_storage_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'marketing-directory-attachments'
    AND array_length(storage.foldername(name), 1) >= 3
    AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND (storage.foldername(name))[2] IN ('orgs', 'contacts')
    AND (storage.foldername(name))[3] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND CASE
      WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN public.labor_has_management_access(((storage.foldername(name))[1])::uuid)
      ELSE false
    END
  );

COMMIT;
