-- Enterprise Directory manual maintenance support.
-- Live backend change if applied: adds editable directory columns, writable RLS
-- policies for manager+ users, private profile-photo storage, and reporting
-- cycle protection.
--
-- Rollback path:
--   DROP TRIGGER IF EXISTS trg_enterprise_directory_edges_prevent_cycles ON public.enterprise_directory_edges;
--   DROP FUNCTION IF EXISTS public.enterprise_directory_prevent_invalid_edge();
--   DROP FUNCTION IF EXISTS public.enterprise_directory_set_primary_manager(uuid, uuid);
--   DROP FUNCTION IF EXISTS public.enterprise_directory_can_manage();
--   DROP POLICY IF EXISTS enterprise_directory_photos_select ON storage.objects;
--   DROP POLICY IF EXISTS enterprise_directory_photos_insert ON storage.objects;
--   DROP POLICY IF EXISTS enterprise_directory_photos_update ON storage.objects;
--   DROP POLICY IF EXISTS enterprise_directory_photos_delete ON storage.objects;
--   DROP POLICY IF EXISTS enterprise_directory_people_manage_insert ON public.enterprise_directory_people;
--   DROP POLICY IF EXISTS enterprise_directory_people_manage_update ON public.enterprise_directory_people;
--   DROP POLICY IF EXISTS enterprise_directory_person_locations_manage_insert ON public.enterprise_directory_person_locations;
--   DROP POLICY IF EXISTS enterprise_directory_person_locations_manage_update ON public.enterprise_directory_person_locations;
--   DROP POLICY IF EXISTS enterprise_directory_person_locations_manage_delete ON public.enterprise_directory_person_locations;
--   DROP POLICY IF EXISTS enterprise_directory_edges_manage_insert ON public.enterprise_directory_edges;
--   DROP POLICY IF EXISTS enterprise_directory_edges_manage_update ON public.enterprise_directory_edges;
--   DROP POLICY IF EXISTS enterprise_directory_edges_manage_delete ON public.enterprise_directory_edges;
--   ALTER TABLE public.enterprise_directory_people
--     DROP COLUMN IF EXISTS department,
--     DROP COLUMN IF EXISTS profile_photo_bucket,
--     DROP COLUMN IF EXISTS profile_photo_path;
--   DELETE FROM storage.buckets WHERE id = 'enterprise-directory-photos';

BEGIN;

ALTER TABLE public.enterprise_directory_people
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS profile_photo_bucket text,
  ADD COLUMN IF NOT EXISTS profile_photo_path text;

CREATE INDEX IF NOT EXISTS idx_enterprise_directory_people_department
  ON public.enterprise_directory_people (department)
  WHERE department IS NOT NULL;

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'enterprise-directory-photos',
  'enterprise-directory-photos',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE OR REPLACE FUNCTION public.enterprise_directory_can_manage()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.lite_profiles lp
      WHERE lp.user_id = auth.uid()
        AND lp.is_active = true
        AND lp.role IN ('manager', 'location_admin', 'enterprise_admin')
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('owner', 'role_owner', 'developer', 'enterprise_admin')
    );
$$;

DROP POLICY IF EXISTS enterprise_directory_people_manage_insert ON public.enterprise_directory_people;
CREATE POLICY enterprise_directory_people_manage_insert
  ON public.enterprise_directory_people
  FOR INSERT
  TO authenticated
  WITH CHECK (public.enterprise_directory_can_manage());

DROP POLICY IF EXISTS enterprise_directory_people_manage_update ON public.enterprise_directory_people;
CREATE POLICY enterprise_directory_people_manage_update
  ON public.enterprise_directory_people
  FOR UPDATE
  TO authenticated
  USING (public.enterprise_directory_can_manage())
  WITH CHECK (public.enterprise_directory_can_manage());

DROP POLICY IF EXISTS enterprise_directory_person_locations_manage_insert ON public.enterprise_directory_person_locations;
CREATE POLICY enterprise_directory_person_locations_manage_insert
  ON public.enterprise_directory_person_locations
  FOR INSERT
  TO authenticated
  WITH CHECK (public.enterprise_directory_can_manage());

DROP POLICY IF EXISTS enterprise_directory_person_locations_manage_update ON public.enterprise_directory_person_locations;
CREATE POLICY enterprise_directory_person_locations_manage_update
  ON public.enterprise_directory_person_locations
  FOR UPDATE
  TO authenticated
  USING (public.enterprise_directory_can_manage())
  WITH CHECK (public.enterprise_directory_can_manage());

DROP POLICY IF EXISTS enterprise_directory_person_locations_manage_delete ON public.enterprise_directory_person_locations;
CREATE POLICY enterprise_directory_person_locations_manage_delete
  ON public.enterprise_directory_person_locations
  FOR DELETE
  TO authenticated
  USING (public.enterprise_directory_can_manage());

DROP POLICY IF EXISTS enterprise_directory_edges_manage_insert ON public.enterprise_directory_edges;
CREATE POLICY enterprise_directory_edges_manage_insert
  ON public.enterprise_directory_edges
  FOR INSERT
  TO authenticated
  WITH CHECK (public.enterprise_directory_can_manage());

DROP POLICY IF EXISTS enterprise_directory_edges_manage_update ON public.enterprise_directory_edges;
CREATE POLICY enterprise_directory_edges_manage_update
  ON public.enterprise_directory_edges
  FOR UPDATE
  TO authenticated
  USING (public.enterprise_directory_can_manage())
  WITH CHECK (public.enterprise_directory_can_manage());

DROP POLICY IF EXISTS enterprise_directory_edges_manage_delete ON public.enterprise_directory_edges;
CREATE POLICY enterprise_directory_edges_manage_delete
  ON public.enterprise_directory_edges
  FOR DELETE
  TO authenticated
  USING (public.enterprise_directory_can_manage());

GRANT INSERT, UPDATE ON TABLE public.enterprise_directory_people TO authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.enterprise_directory_person_locations TO authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.enterprise_directory_edges TO authenticated;

DROP POLICY IF EXISTS enterprise_directory_photos_select ON storage.objects;
CREATE POLICY enterprise_directory_photos_select
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'enterprise-directory-photos');

DROP POLICY IF EXISTS enterprise_directory_photos_insert ON storage.objects;
CREATE POLICY enterprise_directory_photos_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'enterprise-directory-photos'
    AND public.enterprise_directory_can_manage()
    AND array_length(storage.foldername(name), 1) >= 2
    AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  );

DROP POLICY IF EXISTS enterprise_directory_photos_update ON storage.objects;
CREATE POLICY enterprise_directory_photos_update
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'enterprise-directory-photos'
    AND public.enterprise_directory_can_manage()
  )
  WITH CHECK (
    bucket_id = 'enterprise-directory-photos'
    AND public.enterprise_directory_can_manage()
  );

DROP POLICY IF EXISTS enterprise_directory_photos_delete ON storage.objects;
CREATE POLICY enterprise_directory_photos_delete
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'enterprise-directory-photos'
    AND public.enterprise_directory_can_manage()
  );

CREATE OR REPLACE FUNCTION public.enterprise_directory_prevent_invalid_edge()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_has_cycle boolean;
BEGIN
  IF NEW.relationship_type <> 'reports_to' THEN
    RETURN NEW;
  END IF;

  IF NEW.parent_person_id = NEW.child_person_id THEN
    RAISE EXCEPTION 'A directory person cannot report to themselves.';
  END IF;

  WITH RECURSIVE descendants(person_id) AS (
    SELECT e.child_person_id
    FROM public.enterprise_directory_edges e
    WHERE e.parent_person_id = NEW.child_person_id
      AND e.relationship_type = 'reports_to'
      AND (TG_OP <> 'UPDATE' OR e.id <> OLD.id)
    UNION
    SELECT e.child_person_id
    FROM public.enterprise_directory_edges e
    JOIN descendants d ON d.person_id = e.parent_person_id
    WHERE e.relationship_type = 'reports_to'
      AND (TG_OP <> 'UPDATE' OR e.id <> OLD.id)
  )
  SELECT EXISTS (
    SELECT 1
    FROM descendants
    WHERE person_id = NEW.parent_person_id
  )
  INTO v_has_cycle;

  IF v_has_cycle THEN
    RAISE EXCEPTION 'That reporting move would create a cycle.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enterprise_directory_edges_prevent_cycles ON public.enterprise_directory_edges;
CREATE TRIGGER trg_enterprise_directory_edges_prevent_cycles
  BEFORE INSERT OR UPDATE ON public.enterprise_directory_edges
  FOR EACH ROW
  EXECUTE FUNCTION public.enterprise_directory_prevent_invalid_edge();

CREATE OR REPLACE FUNCTION public.enterprise_directory_set_primary_manager(
  p_child_person_id uuid,
  p_parent_person_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_child_exists boolean;
  v_parent_exists boolean;
  v_has_cycle boolean;
BEGIN
  IF NOT public.enterprise_directory_can_manage() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient permissions to manage the company directory.');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.enterprise_directory_people WHERE id = p_child_person_id
  ) INTO v_child_exists;

  IF NOT v_child_exists THEN
    RETURN jsonb_build_object('success', false, 'error', 'Directory person not found.');
  END IF;

  IF p_parent_person_id IS NOT NULL THEN
    IF p_parent_person_id = p_child_person_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'A person cannot report to themselves.');
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM public.enterprise_directory_people
      WHERE id = p_parent_person_id
        AND directory_status <> 'inactive'
    ) INTO v_parent_exists;

    IF NOT v_parent_exists THEN
      RETURN jsonb_build_object('success', false, 'error', 'Manager was not found or is inactive.');
    END IF;

    WITH RECURSIVE descendants(person_id) AS (
      SELECT e.child_person_id
      FROM public.enterprise_directory_edges e
      WHERE e.parent_person_id = p_child_person_id
        AND e.relationship_type = 'reports_to'
      UNION
      SELECT e.child_person_id
      FROM public.enterprise_directory_edges e
      JOIN descendants d ON d.person_id = e.parent_person_id
      WHERE e.relationship_type = 'reports_to'
    )
    SELECT EXISTS (
      SELECT 1 FROM descendants WHERE person_id = p_parent_person_id
    ) INTO v_has_cycle;

    IF v_has_cycle THEN
      RETURN jsonb_build_object('success', false, 'error', 'That reporting move would create a cycle.');
    END IF;
  END IF;

  DELETE FROM public.enterprise_directory_edges
  WHERE child_person_id = p_child_person_id
    AND relationship_type = 'reports_to'
    AND is_primary = true;

  IF p_parent_person_id IS NOT NULL THEN
    INSERT INTO public.enterprise_directory_edges (
      parent_person_id,
      child_person_id,
      relationship_type,
      is_primary,
      source,
      source_metadata
    )
    VALUES (
      p_parent_person_id,
      p_child_person_id,
      'reports_to',
      true,
      'manual',
      jsonb_build_object('maintained_in', 'company_directory')
    )
    ON CONFLICT (parent_person_id, child_person_id, relationship_type)
    DO UPDATE SET
      is_primary = true,
      source = 'manual',
      source_metadata = EXCLUDED.source_metadata,
      updated_at = now();
  END IF;

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN others THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.enterprise_directory_set_primary_manager(uuid, uuid) TO authenticated;

CREATE OR REPLACE VIEW public.enterprise_directory_people_safe
WITH (security_invoker = true)
AS
SELECT
  p.id,
  p.person_key,
  p.first_name,
  p.last_name,
  p.display_name,
  p.email,
  p.work_phone,
  p.title,
  p.person_type,
  p.profile_photo_url,
  p.directory_status,
  p.source_systems,
  COALESCE(manager_rows.managers, '[]'::jsonb) AS managers,
  COALESCE(report_rows.direct_report_count, 0) AS direct_report_count,
  COALESCE(location_rows.locations, '[]'::jsonb) AS locations,
  p.updated_at,
  p.department,
  p.profile_photo_bucket,
  p.profile_photo_path
FROM public.enterprise_directory_people p
LEFT JOIN LATERAL (
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', manager.id,
      'person_key', manager.person_key,
      'display_name', manager.display_name,
      'title', manager.title,
      'is_primary', e.is_primary
    )
    ORDER BY e.is_primary DESC, manager.display_name
  ) AS managers
  FROM public.enterprise_directory_edges e
  JOIN public.enterprise_directory_people manager
    ON manager.id = e.parent_person_id
  WHERE e.child_person_id = p.id
) manager_rows ON true
LEFT JOIN LATERAL (
  SELECT count(*)::integer AS direct_report_count
  FROM public.enterprise_directory_edges e
  WHERE e.parent_person_id = p.id
) report_rows ON true
LEFT JOIN LATERAL (
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', l.id,
      'location_key', l.location_key,
      'display_name', l.display_name,
      'city', l.city,
      'state_code', l.state_code,
      'responsibility_type', pl.responsibility_type,
      'title', pl.title
    )
    ORDER BY
      CASE pl.responsibility_type
        WHEN 'directory_location' THEN 0
        WHEN 'general_manager' THEN 1
        WHEN 'regional_manager' THEN 2
        ELSE 3
      END,
      l.display_name
  ) AS locations
  FROM public.enterprise_directory_person_locations pl
  JOIN public.enterprise_directory_locations l
    ON l.id = pl.location_id
  WHERE pl.person_id = p.id
) location_rows ON true;

CREATE OR REPLACE VIEW public.enterprise_directory_org_chart_nodes
WITH (security_invoker = true)
AS
WITH primary_edges AS (
  SELECT DISTINCT ON (e.child_person_id)
    e.child_person_id,
    e.parent_person_id
  FROM public.enterprise_directory_edges e
  ORDER BY e.child_person_id, e.is_primary DESC, e.created_at
),
person_locations AS (
  SELECT
    pl.person_id,
    string_agg(l.display_name, ', ' ORDER BY l.display_name) AS location_names
  FROM public.enterprise_directory_person_locations pl
  JOIN public.enterprise_directory_locations l
    ON l.id = pl.location_id
  GROUP BY pl.person_id
)
SELECT
  'group:co-ceos'::text AS id,
  NULL::text AS pid,
  NULL::uuid AS person_id,
  'Co-CEOs'::text AS display_name,
  'Executive leadership'::text AS title,
  'group'::text AS node_type,
  NULL::text AS email,
  NULL::text AS work_phone,
  NULL::text AS profile_photo_url,
  NULL::text AS location_names,
  ARRAY['executive-group']::text[] AS tags,
  0 AS sort_order,
  NULL::text AS department,
  NULL::text AS profile_photo_bucket,
  NULL::text AS profile_photo_path
UNION ALL
SELECT
  'group:leadership'::text AS id,
  'group:co-ceos'::text AS pid,
  NULL::uuid AS person_id,
  'Corporate Leadership'::text AS display_name,
  'Manager data to be refined as the directory matures'::text AS title,
  'group'::text AS node_type,
  NULL::text AS email,
  NULL::text AS work_phone,
  NULL::text AS profile_photo_url,
  NULL::text AS location_names,
  ARRAY['corporate-group']::text[] AS tags,
  1 AS sort_order,
  NULL::text AS department,
  NULL::text AS profile_photo_bucket,
  NULL::text AS profile_photo_path
UNION ALL
SELECT
  'person:' || p.person_key AS id,
  CASE
    WHEN p.person_key IN ('logan-hale-1', 'finley-prescott-21', 'cameron-rhodes-15') THEN 'group:co-ceos'
    WHEN manager.person_key IS NOT NULL THEN 'person:' || manager.person_key
    ELSE 'group:leadership'
  END AS pid,
  p.id AS person_id,
  p.display_name,
  p.title,
  'person'::text AS node_type,
  p.email,
  p.work_phone,
  p.profile_photo_url,
  person_locations.location_names,
  ARRAY_REMOVE(ARRAY[
    CASE WHEN p.person_key IN ('logan-hale-1', 'finley-prescott-21') THEN 'co-ceo' END,
    CASE WHEN p.person_key = 'cameron-rhodes-15' THEN 'coo' END,
    CASE WHEN p.person_key = 'rowan-beckett-25' THEN 'resort-operations' END,
    CASE WHEN p.person_key = 'aubrey-nolan-28' THEN 'director-resorts' END,
    CASE WHEN person_locations.location_names IS NOT NULL THEN 'location-responsibility' END
  ], NULL)::text[] AS tags,
  CASE
    WHEN p.person_key IN ('logan-hale-1', 'finley-prescott-21') THEN 10
    WHEN p.person_key = 'cameron-rhodes-15' THEN 20
    WHEN p.person_key = 'rowan-beckett-25' THEN 30
    WHEN p.person_key = 'aubrey-nolan-28' THEN 40
    ELSE 100
  END AS sort_order,
  p.department,
  p.profile_photo_bucket,
  p.profile_photo_path
FROM public.enterprise_directory_people p
LEFT JOIN primary_edges pe
  ON pe.child_person_id = p.id
LEFT JOIN public.enterprise_directory_people manager
  ON manager.id = pe.parent_person_id
LEFT JOIN person_locations
  ON person_locations.person_id = p.id
WHERE p.directory_status = 'active';

GRANT SELECT ON public.enterprise_directory_people_safe TO authenticated;
GRANT SELECT ON public.enterprise_directory_org_chart_nodes TO authenticated;

COMMENT ON FUNCTION public.enterprise_directory_set_primary_manager(uuid, uuid) IS
  'Updates the canonical primary reports_to edge for one directory person. Balkan is only a renderer; this function mutates enterprise_directory_edges.';
COMMENT ON COLUMN public.enterprise_directory_people.department IS
  'Manual directory department/group label rendered in table and generated org chart.';
COMMENT ON COLUMN public.enterprise_directory_people.profile_photo_path IS
  'Private enterprise-directory-photos storage object path for signed client display.';

COMMIT;
