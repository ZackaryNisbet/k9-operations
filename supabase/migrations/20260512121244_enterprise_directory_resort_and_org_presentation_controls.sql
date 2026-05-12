-- Company Directory resort editing + org-chart presentation metadata.
-- Live backend change if applied: allows manager+ users to update resort
-- directory rows and adds K9-owned org presentation metadata fields. BALKAN
-- remains a rendering adapter; these fields are semantic directory metadata.
--
-- Rollback path:
--   DROP POLICY IF EXISTS enterprise_directory_locations_manage_update ON public.enterprise_directory_locations;
--   REVOKE UPDATE ON TABLE public.enterprise_directory_locations FROM authenticated;
--   ALTER TABLE public.enterprise_directory_people
--     DROP COLUMN IF EXISTS org_chart_display_role,
--     DROP COLUMN IF EXISTS org_chart_partner_person_id,
--     DROP COLUMN IF EXISTS org_chart_branch_layout;

BEGIN;

ALTER TABLE public.enterprise_directory_people
  ADD COLUMN IF NOT EXISTS org_chart_display_role text NOT NULL DEFAULT 'standard'
    CHECK (org_chart_display_role IN ('standard', 'side_by_side_leader', 'assistant')),
  ADD COLUMN IF NOT EXISTS org_chart_partner_person_id uuid
    REFERENCES public.enterprise_directory_people(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS org_chart_branch_layout text NOT NULL DEFAULT 'standard_tree'
    CHECK (org_chart_branch_layout IN ('standard_tree', 'compact_tree', 'compact_list'));

CREATE INDEX IF NOT EXISTS idx_enterprise_directory_people_org_chart_partner
  ON public.enterprise_directory_people (org_chart_partner_person_id)
  WHERE org_chart_partner_person_id IS NOT NULL;

DROP POLICY IF EXISTS enterprise_directory_locations_manage_update ON public.enterprise_directory_locations;
CREATE POLICY enterprise_directory_locations_manage_update
  ON public.enterprise_directory_locations
  FOR UPDATE
  TO authenticated
  USING (public.enterprise_directory_can_manage())
  WITH CHECK (public.enterprise_directory_can_manage());

GRANT UPDATE ON TABLE public.enterprise_directory_locations TO authenticated;

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
  p.profile_photo_path,
  p.org_chart_display_role,
  p.org_chart_partner_person_id,
  p.org_chart_branch_layout
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

GRANT SELECT ON public.enterprise_directory_people_safe TO authenticated;

COMMENT ON COLUMN public.enterprise_directory_people.org_chart_display_role IS
  'K9 directory presentation role: standard, side-by-side leader, or assistant. This is semantic org presentation metadata, not a BALKAN-owned blob.';
COMMENT ON COLUMN public.enterprise_directory_people.org_chart_partner_person_id IS
  'Optional side-by-side leader partner person. Rendering adapters may derive BALKAN ppid/tags from this without changing reports_to.';
COMMENT ON COLUMN public.enterprise_directory_people.org_chart_branch_layout IS
  'Preferred branch presentation: standard tree, compact tree, or compact list. Rendering adapters derive layout tags from this value.';

COMMIT;
