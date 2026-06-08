-- Enterprise Company Directory + Org Chart.
-- Rollback path if needed:
--   DROP VIEW IF EXISTS public.enterprise_directory_org_chart_nodes;
--   DROP VIEW IF EXISTS public.enterprise_directory_people_safe;
--   DROP TABLE IF EXISTS public.enterprise_directory_data_gaps;
--   DROP TABLE IF EXISTS public.enterprise_directory_edges;
--   DROP TABLE IF EXISTS public.enterprise_directory_person_locations;
--   DROP TABLE IF EXISTS public.enterprise_directory_people;
--   DROP TABLE IF EXISTS public.enterprise_directory_locations;
--   DROP FUNCTION IF EXISTS public.set_enterprise_directory_updated_at();

BEGIN;

CREATE TABLE IF NOT EXISTS public.enterprise_directory_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_key text NOT NULL UNIQUE,
  source_location_name text NOT NULL,
  display_name text NOT NULL,
  state_code text,
  region_label text,
  address_line1 text,
  address_line2 text,
  city text,
  postal_code text,
  resort_phone text,
  resort_email text,
  hours jsonb NOT NULL DEFAULT '[]'::jsonb,
  directory_status text NOT NULL DEFAULT 'active'
    CHECK (directory_status IN ('active', 'needs_data', 'inactive')),
  source_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.enterprise_directory_people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_key text NOT NULL UNIQUE,
  first_name text,
  last_name text,
  display_name text NOT NULL,
  email text,
  work_phone text,
  title text,
  person_type text NOT NULL DEFAULT 'person',
  profile_photo_url text,
  directory_status text NOT NULL DEFAULT 'active'
    CHECK (directory_status IN ('active', 'needs_data', 'inactive')),
  linked_lite_profile_id uuid REFERENCES public.lite_profiles(id) ON DELETE SET NULL,
  linked_labor_employee_id uuid REFERENCES public.labor_employees(id) ON DELETE SET NULL,
  source_systems text[] NOT NULL DEFAULT ARRAY[]::text[],
  source_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.enterprise_directory_person_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES public.enterprise_directory_people(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.enterprise_directory_locations(id) ON DELETE CASCADE,
  responsibility_type text NOT NULL,
  title text,
  source text NOT NULL DEFAULT 'manual',
  source_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (person_id, location_id, responsibility_type)
);

CREATE TABLE IF NOT EXISTS public.enterprise_directory_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_person_id uuid NOT NULL REFERENCES public.enterprise_directory_people(id) ON DELETE CASCADE,
  child_person_id uuid NOT NULL REFERENCES public.enterprise_directory_people(id) ON DELETE CASCADE,
  relationship_type text NOT NULL DEFAULT 'reports_to',
  is_primary boolean NOT NULL DEFAULT true,
  source text NOT NULL DEFAULT 'manual',
  source_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (parent_person_id <> child_person_id),
  UNIQUE (parent_person_id, child_person_id, relationship_type)
);

CREATE TABLE IF NOT EXISTS public.enterprise_directory_data_gaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gap_key text NOT NULL UNIQUE,
  entity_type text NOT NULL,
  entity_key text NOT NULL,
  location_id uuid REFERENCES public.enterprise_directory_locations(id) ON DELETE SET NULL,
  person_id uuid REFERENCES public.enterprise_directory_people(id) ON DELETE SET NULL,
  field_name text NOT NULL,
  severity text NOT NULL DEFAULT 'needs_data'
    CHECK (severity IN ('needs_data', 'note', 'warning')),
  status_label text NOT NULL DEFAULT 'Needs data',
  detail text NOT NULL,
  source text NOT NULL DEFAULT 'manual',
  source_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_enterprise_directory_people_email
  ON public.enterprise_directory_people (email)
  WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_enterprise_directory_people_search
  ON public.enterprise_directory_people USING gin (
    to_tsvector('simple', coalesce(display_name, '') || ' ' || coalesce(title, '') || ' ' || coalesce(email, ''))
  );

CREATE INDEX IF NOT EXISTS idx_enterprise_directory_locations_search
  ON public.enterprise_directory_locations USING gin (
    to_tsvector('simple', coalesce(display_name, '') || ' ' || coalesce(city, '') || ' ' || coalesce(state_code, ''))
  );

CREATE INDEX IF NOT EXISTS idx_enterprise_directory_person_locations_person
  ON public.enterprise_directory_person_locations (person_id);

CREATE INDEX IF NOT EXISTS idx_enterprise_directory_person_locations_location
  ON public.enterprise_directory_person_locations (location_id);

CREATE INDEX IF NOT EXISTS idx_enterprise_directory_edges_child
  ON public.enterprise_directory_edges (child_person_id);

CREATE INDEX IF NOT EXISTS idx_enterprise_directory_edges_parent
  ON public.enterprise_directory_edges (parent_person_id);

CREATE OR REPLACE FUNCTION public.set_enterprise_directory_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enterprise_directory_locations_updated_at ON public.enterprise_directory_locations;
CREATE TRIGGER trg_enterprise_directory_locations_updated_at
  BEFORE UPDATE ON public.enterprise_directory_locations
  FOR EACH ROW EXECUTE FUNCTION public.set_enterprise_directory_updated_at();

DROP TRIGGER IF EXISTS trg_enterprise_directory_people_updated_at ON public.enterprise_directory_people;
CREATE TRIGGER trg_enterprise_directory_people_updated_at
  BEFORE UPDATE ON public.enterprise_directory_people
  FOR EACH ROW EXECUTE FUNCTION public.set_enterprise_directory_updated_at();

DROP TRIGGER IF EXISTS trg_enterprise_directory_person_locations_updated_at ON public.enterprise_directory_person_locations;
CREATE TRIGGER trg_enterprise_directory_person_locations_updated_at
  BEFORE UPDATE ON public.enterprise_directory_person_locations
  FOR EACH ROW EXECUTE FUNCTION public.set_enterprise_directory_updated_at();

DROP TRIGGER IF EXISTS trg_enterprise_directory_edges_updated_at ON public.enterprise_directory_edges;
CREATE TRIGGER trg_enterprise_directory_edges_updated_at
  BEFORE UPDATE ON public.enterprise_directory_edges
  FOR EACH ROW EXECUTE FUNCTION public.set_enterprise_directory_updated_at();

DROP TRIGGER IF EXISTS trg_enterprise_directory_data_gaps_updated_at ON public.enterprise_directory_data_gaps;
CREATE TRIGGER trg_enterprise_directory_data_gaps_updated_at
  BEFORE UPDATE ON public.enterprise_directory_data_gaps
  FOR EACH ROW EXECUTE FUNCTION public.set_enterprise_directory_updated_at();

ALTER TABLE public.enterprise_directory_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_directory_people ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_directory_person_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_directory_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_directory_data_gaps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS enterprise_directory_locations_authenticated_read ON public.enterprise_directory_locations;
CREATE POLICY enterprise_directory_locations_authenticated_read
  ON public.enterprise_directory_locations
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS enterprise_directory_people_authenticated_read ON public.enterprise_directory_people;
CREATE POLICY enterprise_directory_people_authenticated_read
  ON public.enterprise_directory_people
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS enterprise_directory_person_locations_authenticated_read ON public.enterprise_directory_person_locations;
CREATE POLICY enterprise_directory_person_locations_authenticated_read
  ON public.enterprise_directory_person_locations
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS enterprise_directory_edges_authenticated_read ON public.enterprise_directory_edges;
CREATE POLICY enterprise_directory_edges_authenticated_read
  ON public.enterprise_directory_edges
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS enterprise_directory_data_gaps_authenticated_read ON public.enterprise_directory_data_gaps;
CREATE POLICY enterprise_directory_data_gaps_authenticated_read
  ON public.enterprise_directory_data_gaps
  FOR SELECT
  TO authenticated
  USING (resolved_at IS NULL);

REVOKE ALL ON TABLE public.enterprise_directory_locations FROM anon;
REVOKE ALL ON TABLE public.enterprise_directory_people FROM anon;
REVOKE ALL ON TABLE public.enterprise_directory_person_locations FROM anon;
REVOKE ALL ON TABLE public.enterprise_directory_edges FROM anon;
REVOKE ALL ON TABLE public.enterprise_directory_data_gaps FROM anon;

GRANT SELECT ON TABLE public.enterprise_directory_locations TO authenticated;
GRANT SELECT ON TABLE public.enterprise_directory_people TO authenticated;
GRANT SELECT ON TABLE public.enterprise_directory_person_locations TO authenticated;
GRANT SELECT ON TABLE public.enterprise_directory_edges TO authenticated;
GRANT SELECT ON TABLE public.enterprise_directory_data_gaps TO authenticated;

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
  p.updated_at
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
  0 AS sort_order
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
  1 AS sort_order
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
  END AS sort_order
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

COMMENT ON TABLE public.enterprise_directory_people IS
  'Safe company directory people imported from LPHI and resort contact workbooks. Directory-only contacts are not forced into labor_employees or lite_profiles.';
COMMENT ON TABLE public.enterprise_directory_locations IS
  'Directory-specific resort/location records imported from the GM contact workbook.';
COMMENT ON TABLE public.enterprise_directory_edges IS
  'Directory reporting relationships. The org-chart node view converts these into id/pid nodes for Balkan OrgChartJS.';
COMMENT ON TABLE public.enterprise_directory_data_gaps IS
  'Visible import/data-quality gaps that should render as Needs data instead of disappearing.';

-- BEGIN GENERATED DIRECTORY IMPORT
-- Deterministic import generated by scripts/import_enterprise_directory.py.
-- Source workbooks:
-- - (local source file)
-- - (local source file)

WITH payload AS (
  SELECT $k9dir${
  "edges": [
    {
      "child_key": "cameron-rhodes-15",
      "is_primary": true,
      "parent_key": "logan-hale-1",
      "relationship_type": "reports_to",
      "source": "hierarchy_rule",
      "source_metadata": {
        "note": ""
      }
    },
    {
      "child_key": "cameron-beckett-2",
      "is_primary": true,
      "parent_key": "ellis-bennett-8",
      "relationship_type": "reports_to",
      "source": "gm_contact_list",
      "source_metadata": {}
    },
    {
      "child_key": "casey-brooks-3",
      "is_primary": true,
      "parent_key": "ellis-bennett-8",
      "relationship_type": "reports_to",
      "source": "gm_contact_list",
      "source_metadata": {}
    },
    {
      "child_key": "hayden-sterling-4",
      "is_primary": true,
      "parent_key": "ellis-bennett-8",
      "relationship_type": "reports_to",
      "source": "gm_contact_list",
      "source_metadata": {}
    },
    {
      "child_key": "devon-ellison-6",
      "is_primary": true,
      "parent_key": "ellis-bennett-8",
      "relationship_type": "reports_to",
      "source": "gm_contact_list",
      "source_metadata": {}
    },
    {
      "child_key": "casey-beckett-13",
      "is_primary": true,
      "parent_key": "ellis-bennett-8",
      "relationship_type": "reports_to",
      "source": "gm_contact_list",
      "source_metadata": {}
    },
    {
      "child_key": "aubrey-rhodes-16",
      "is_primary": true,
      "parent_key": "ellis-bennett-8",
      "relationship_type": "reports_to",
      "source": "gm_contact_list",
      "source_metadata": {}
    },
    {
      "child_key": "devon-calloway-24",
      "is_primary": true,
      "parent_key": "ellis-bennett-8",
      "relationship_type": "reports_to",
      "source": "gm_contact_list",
      "source_metadata": {}
    },
    {
      "child_key": "avery-reed-9",
      "is_primary": true,
      "parent_key": "cameron-marsh-11",
      "relationship_type": "reports_to",
      "source": "gm_contact_list",
      "source_metadata": {}
    },
    {
      "child_key": "jordan-foster-10",
      "is_primary": true,
      "parent_key": "cameron-marsh-11",
      "relationship_type": "reports_to",
      "source": "gm_contact_list",
      "source_metadata": {}
    },
    {
      "child_key": "marlowe-howell-17",
      "is_primary": true,
      "parent_key": "cameron-marsh-11",
      "relationship_type": "reports_to",
      "source": "gm_contact_list",
      "source_metadata": {}
    },
    {
      "child_key": "blake-bennett-23",
      "is_primary": true,
      "parent_key": "cameron-marsh-11",
      "relationship_type": "reports_to",
      "source": "gm_contact_list",
      "source_metadata": {}
    },
    {
      "child_key": "emerson-maddox-27",
      "is_primary": true,
      "parent_key": "cameron-marsh-11",
      "relationship_type": "reports_to",
      "source": "gm_contact_list",
      "source_metadata": {}
    },
    {
      "child_key": "rowan-beckett-25",
      "is_primary": true,
      "parent_key": "cameron-rhodes-15",
      "relationship_type": "reports_to",
      "source": "hierarchy_rule",
      "source_metadata": {}
    },
    {
      "child_key": "cameron-rhodes-15",
      "is_primary": false,
      "parent_key": "finley-prescott-21",
      "relationship_type": "reports_to",
      "source": "hierarchy_rule",
      "source_metadata": {
        "note": ""
      }
    },
    {
      "child_key": "sawyer-maddox-5",
      "is_primary": true,
      "parent_key": "rowan-beckett-25",
      "relationship_type": "reports_to",
      "source": "gm_contact_list",
      "source_metadata": {
        "note": ""
      }
    },
    {
      "child_key": "ellis-bennett-8",
      "is_primary": true,
      "parent_key": "rowan-beckett-25",
      "relationship_type": "reports_to",
      "source": "hierarchy_rule",
      "source_metadata": {}
    },
    {
      "child_key": "cameron-marsh-11",
      "is_primary": true,
      "parent_key": "rowan-beckett-25",
      "relationship_type": "reports_to",
      "source": "hierarchy_rule",
      "source_metadata": {}
    },
    {
      "child_key": "aubrey-forsythe-12",
      "is_primary": true,
      "parent_key": "rowan-beckett-25",
      "relationship_type": "reports_to",
      "source": "gm_contact_list",
      "source_metadata": {
        "note": ""
      }
    },
    {
      "child_key": "avery-bennett-26",
      "is_primary": true,
      "parent_key": "rowan-beckett-25",
      "relationship_type": "reports_to",
      "source": "hierarchy_rule",
      "source_metadata": {}
    },
    {
      "child_key": "aubrey-nolan-28",
      "is_primary": true,
      "parent_key": "rowan-beckett-25",
      "relationship_type": "reports_to",
      "source": "hierarchy_rule",
      "source_metadata": {
        "note": ""
      }
    }
  ],
  "gaps": [
    {
      "detail": "",
      "entity_key": "cherry-hill",
      "entity_type": "location",
      "field_name": "regional_manager",
      "gap_key": "cherry-hill:regional:missing",
      "location_key": "cherry-hill",
      "person_key": "",
      "severity": "needs_data",
      "source_metadata": {
        "block_start_row": 17,
        "column": 3,
        "sheet": "Sheet1",
        "workbook": "Gm Contact List (1).xlsx"
      },
      "status_label": "Needs data"
    },
    {
      "detail": "",
      "entity_key": "greece",
      "entity_type": "location",
      "field_name": "regional_manager",
      "gap_key": "greece:regional:sean-direct",
      "location_key": "greece",
      "person_key": "",
      "severity": "note",
      "source_metadata": {
        "column": 5,
        "row": 28,
        "sheet": "Sheet1",
        "workbook": "Gm Contact List (1).xlsx"
      },
      "status_label": "Needs data"
    },
    {
      "detail": "",
      "entity_key": "hamilton",
      "entity_type": "location",
      "field_name": "general_manager",
      "gap_key": "hamilton:gm:missing",
      "location_key": "hamilton",
      "person_key": "",
      "severity": "needs_data",
      "source_metadata": {
        "block_start_row": 2,
        "column": 3,
        "sheet": "Sheet1",
        "workbook": "Gm Contact List (1).xlsx"
      },
      "status_label": "Needs data"
    },
    {
      "detail": "",
      "entity_key": "penfield",
      "entity_type": "location",
      "field_name": "regional_manager",
      "gap_key": "penfield:regional:sean-direct",
      "location_key": "penfield",
      "person_key": "",
      "severity": "note",
      "source_metadata": {
        "column": 5,
        "row": 13,
        "sheet": "Sheet1",
        "workbook": "Gm Contact List (1).xlsx"
      },
      "status_label": "Needs data"
    },
    {
      "detail": "",
      "entity_key": "ca-az",
      "entity_type": "regional_assignment",
      "field_name": "regional_manager",
      "gap_key": "regional-list:ca-az-conflict",
      "location_key": "",
      "person_key": "avery-bennett-26",
      "severity": "note",
      "source_metadata": {
        "rows": [
          85,
          86,
          87,
          88
        ],
        "sheet": "Sheet1",
        "workbook": "Gm Contact List (1).xlsx"
      },
      "status_label": "Needs data"
    }
  ],
  "locations": [
    {
      "address_line1": "Adair Forsythe, NJ 08003",
      "address_line2": "(555) 621-9221",
      "city": "",
      "directory_status": "active",
      "display_name": "Adair Forsythe",
      "hours": [
        "Daycare: M-F 7am-7pm",
        "Sat-Sun 9am-530pm"
      ],
      "location_key": "cherry-hill",
      "postal_code": "",
      "region_label": "NJ",
      "resort_email": "quinn.ashford75@example.com",
      "resort_phone": "(555) 621-9221",
      "source_location_name": "K9 Adair Forsythe",
      "source_metadata": {
        "block_start_row": 17,
        "column": 3,
        "sheet": "Sheet1",
        "workbook": "Gm Contact List (1).xlsx"
      },
      "state_code": ""
    },
    {
      "address_line1": "Remy Calloway, IL 60015",
      "address_line2": "(555) 604-7204",
      "city": "",
      "directory_status": "active",
      "display_name": "Remy Calloway",
      "hours": [
        "Boarding: M-F 9am-530pm",
        "Daycare: M-F 7am-7pm",
        "Sat-Sun 9am-530pm"
      ],
      "location_key": "deerfield",
      "postal_code": "",
      "region_label": "IL",
      "resort_email": "tatum.marsh13@example.com",
      "resort_phone": "(555) 604-7204",
      "source_location_name": "Remy Calloway",
      "source_metadata": {
        "block_start_row": 2,
        "column": 15,
        "sheet": "Sheet1",
        "workbook": "Gm Contact List (1).xlsx"
      },
      "state_code": ""
    },
    {
      "address_line1": "Jordan Ramsey, NJ 07004",
      "address_line2": "(555) 351-6151",
      "city": "",
      "directory_status": "active",
      "display_name": "Jordan Ramsey",
      "hours": [
        "Boarding: M-F 9am-530pm",
        "Daycare: M-F 7am-7pm",
        "Sat-Sun 9am-530pm"
      ],
      "location_key": "fairfield",
      "postal_code": "",
      "region_label": "NJ",
      "resort_email": "aubrey.ellison93@example.com",
      "resort_phone": "(555) 351-6151",
      "source_location_name": "K9 Jordan Ramsey",
      "source_metadata": {
        "block_start_row": 32,
        "column": 3,
        "sheet": "Sheet1",
        "workbook": "Gm Contact List (1).xlsx"
      },
      "state_code": ""
    },
    {
      "address_line1": "Skyler Hale, NY 14626",
      "address_line2": "(555) 555-5555",
      "city": "",
      "directory_status": "active",
      "display_name": "Skyler Hale",
      "hours": [
        "Boarding: M-F 9am-530pm",
        "Daycare: M-F 7am-7pm",
        "Sat-Sun 9am-530pm"
      ],
      "location_key": "greece",
      "postal_code": "",
      "region_label": "NY",
      "resort_email": "hayden.calloway38@example.com",
      "resort_phone": "(555) 555-5555",
      "source_location_name": "K9 Skyler Hale",
      "source_metadata": {
        "block_start_row": 17,
        "column": 5,
        "sheet": "Sheet1",
        "workbook": "Gm Contact List (1).xlsx"
      },
      "state_code": ""
    },
    {
      "address_line1": "Hamiton, NJ 08619",
      "address_line2": "(555) 327-4527",
      "city": "",
      "directory_status": "active",
      "display_name": "Ellis Mercer",
      "hours": [
        "Boarding: M-F 9am-530pm",
        "Daycare: M-F 7am-7pm",
        "Sat-Sun 9am-530pm"
      ],
      "location_key": "hamilton",
      "postal_code": "",
      "region_label": "NJ",
      "resort_email": "parker.rhodes51@example.com",
      "resort_phone": "(555) 327-4527",
      "source_location_name": "K9 Mercer",
      "source_metadata": {
        "block_start_row": 2,
        "column": 3,
        "sheet": "Sheet1",
        "workbook": "Gm Contact List (1).xlsx"
      },
      "state_code": ""
    },
    {
      "address_line1": "Los Angeles, CA 90045",
      "address_line2": "(555) 602-3202",
      "city": "",
      "directory_status": "active",
      "display_name": "Spencer Lambert",
      "hours": [
        "Boarding: M-F 9am-530pm",
        "Daycare: M-F 7am-7pm",
        "Sat-Sun 9am-530pm"
      ],
      "location_key": "hindry-1001",
      "postal_code": "",
      "region_label": "CA",
      "resort_email": "remy.sterling28@example.com",
      "resort_phone": "(555) 602-3202",
      "source_location_name": "K9 Resort Spencer Lambert",
      "source_metadata": {
        "block_start_row": 2,
        "column": 19,
        "sheet": "Sheet1",
        "workbook": "Gm Contact List (1).xlsx"
      },
      "state_code": ""
    },
    {
      "address_line1": "Casey Beckett, NJ 07940",
      "address_line2": "(555) 976-1576",
      "city": "",
      "directory_status": "active",
      "display_name": "Casey Beckett",
      "hours": [
        "Boarding: M-F 9am-530pm",
        "Daycare: M-F 7am-7pm",
        "Sat-Sun 9am-530pm"
      ],
      "location_key": "madison",
      "postal_code": "",
      "region_label": "NJ",
      "resort_email": "cameron.mercer74@example.com",
      "resort_phone": "(555) 976-1576",
      "source_location_name": "K9 Casey Beckett",
      "source_metadata": {
        "block_start_row": 47,
        "column": 3,
        "sheet": "Sheet1",
        "workbook": "Gm Contact List (1).xlsx"
      },
      "state_code": ""
    },
    {
      "address_line1": "Rowan Larsen, PA 19355",
      "address_line2": "(555) 256-5656",
      "city": "",
      "directory_status": "active",
      "display_name": "Rowan Larsen",
      "hours": [
        "Boarding: M-F 9am-530pm",
        "Daycare: M-F 7am-7pm",
        "Sat-Sun 9am-530pm"
      ],
      "location_key": "malvern",
      "postal_code": "",
      "region_label": "PA",
      "resort_email": "sage.sloan16@example.com",
      "resort_phone": "(555) 256-5656",
      "source_location_name": "K9 Rowan Larsen",
      "source_metadata": {
        "block_start_row": 2,
        "column": 9,
        "sheet": "Sheet1",
        "workbook": "Gm Contact List (1).xlsx"
      },
      "state_code": ""
    },
    {
      "address_line1": "N. Olmsted, OH 44070",
      "address_line2": "(555) 483-9083",
      "city": "",
      "directory_status": "active",
      "display_name": "Parker Foster",
      "hours": [
        "Boarding: M-F 9am-530pm",
        "Daycare: M-F 7am-7pm",
        "Sat-Sun 9am-530pm"
      ],
      "location_key": "north-olmsted",
      "postal_code": "",
      "region_label": "OH",
      "resort_email": "adair.prescott58@example.com",
      "resort_phone": "(555) 621-1221",
      "source_location_name": "K9 Parker Foster",
      "source_metadata": {
        "block_start_row": 2,
        "column": 11,
        "sheet": "Sheet1",
        "workbook": "Gm Contact List (1).xlsx"
      },
      "state_code": ""
    },
    {
      "address_line1": "Oviedo, FL 32765",
      "address_line2": "(555) 979-0779",
      "city": "",
      "directory_status": "active",
      "display_name": "Ellis Vance",
      "hours": [
        "Boarding: M-F 9am-530pm",
        "Daycare: M-F 7am-7pm",
        "Sat-Sun 9am-530pm"
      ],
      "location_key": "oviedo-4004",
      "postal_code": "",
      "region_label": "FL",
      "resort_email": "finley.foster93@example.com",
      "resort_phone": "(555) 519-9519",
      "source_location_name": "K9 Ellis Vance",
      "source_metadata": {
        "block_start_row": 32,
        "column": 13,
        "sheet": "Sheet1",
        "workbook": "Gm Contact List (1).xlsx"
      },
      "state_code": ""
    },
    {
      "address_line1": "Devon Ashford, NY 14526",
      "address_line2": "(555) 909-5909",
      "city": "",
      "directory_status": "active",
      "display_name": "Devon Ashford",
      "hours": [
        "Boarding: M-F 9am-530pm",
        "Daycare: M-F 7am-7pm",
        "Sat-Sun 9am-530pm"
      ],
      "location_key": "penfield",
      "postal_code": "",
      "region_label": "NY",
      "resort_email": "jordan.howell86@example.com",
      "resort_phone": "(555) 909-5909",
      "source_location_name": "K9 Devon Ashford",
      "source_metadata": {
        "block_start_row": 2,
        "column": 5,
        "sheet": "Sheet1",
        "workbook": "Gm Contact List (1).xlsx"
      },
      "state_code": ""
    },
    {
      "address_line1": "Pompano Beach, FL 33064",
      "address_line2": "(555) 751-6151",
      "city": "",
      "directory_status": "active",
      "display_name": "Riley Forsythe",
      "hours": [
        "Boarding: M-F 9am-530pm",
        "Daycare: M-F 7am-7pm",
        "Sat-Sun 9am-530pm"
      ],
      "location_key": "pompano-beach-4002",
      "postal_code": "",
      "region_label": "FL",
      "resort_email": "drew.howell54@example.com",
      "resort_phone": "(555) 751-6151",
      "source_location_name": "K9 Riley Forsythe",
      "source_metadata": {
        "block_start_row": 17,
        "column": 13,
        "sheet": "Sheet1",
        "workbook": "Gm Contact List (1).xlsx"
      },
      "state_code": ""
    },
    {
      "address_line1": "Succasunna, NJ 07876",
      "address_line2": "(555) 309-0109",
      "city": "",
      "directory_status": "active",
      "display_name": "Quinn Vance",
      "hours": [
        "Boarding: M-F 9am-530pm",
        "Daycare: M-F 7am-7pm",
        "Sat-Sun 9am-530pm"
      ],
      "location_key": "roxbury",
      "postal_code": "",
      "region_label": "NJ",
      "resort_email": "drew.ashford76@example.com",
      "resort_phone": "(555) 309-0109",
      "source_location_name": "K9 Quinn Vance",
      "source_metadata": {
        "block_start_row": 62,
        "column": 3,
        "sheet": "Sheet1",
        "workbook": "Gm Contact List (1).xlsx"
      },
      "state_code": ""
    },
    {
      "address_line1": "Ellisonsdale, AZ 85259",
      "address_line2": "(555) 713-1713",
      "city": "",
      "directory_status": "active",
      "display_name": "Taylor Sterling",
      "hours": [
        "Boarding: M-F 9am-530pm",
        "Daycare: M-F 7am-7pm",
        "Sat-Sun 9am-530pm"
      ],
      "location_key": "scottsdale-5001",
      "postal_code": "",
      "region_label": "AZ",
      "resort_email": "dakota.foster53@example.com",
      "resort_phone": "(555) 713-1713",
      "source_location_name": "K9 Taylor Sterling",
      "source_metadata": {
        "block_start_row": 2,
        "column": 17,
        "sheet": "Sheet1",
        "workbook": "Gm Contact List (1).xlsx"
      },
      "state_code": ""
    },
    {
      "address_line1": "Ellis Vance, CT 06902",
      "address_line2": "(555) 402-1802",
      "city": "",
      "directory_status": "active",
      "display_name": "Ellis Vance",
      "hours": [
        "Boarding: M-F 9am-530pm",
        "Daycare: M-F 7am-7pm",
        "Sat-Sun 9am-530pm"
      ],
      "location_key": "stamford",
      "postal_code": "",
      "region_label": "CT",
      "resort_email": "parker.sloan81@example.com",
      "resort_phone": "(555) 402-1802",
      "source_location_name": "K9 Ellis Vance",
      "source_metadata": {
        "block_start_row": 2,
        "column": 7,
        "sheet": "Sheet1",
        "workbook": "Gm Contact List (1).xlsx"
      },
      "state_code": ""
    },
    {
      "address_line1": "Wellington, FL 33414",
      "address_line2": "(555) 418-6618",
      "city": "",
      "directory_status": "active",
      "display_name": "Peyton Donovan",
      "hours": [
        "Boarding: M-F 9am-530pm",
        "Daycare: M-F 7am-7pm",
        "Sat-Sun 9am-530pm"
      ],
      "location_key": "wellington-4001",
      "postal_code": "",
      "region_label": "FL",
      "resort_email": "ellis.prescott48@example.com",
      "resort_phone": "(555) 418-6618",
      "source_location_name": "K9 Peyton Donovan",
      "source_metadata": {
        "block_start_row": 2,
        "column": 13,
        "sheet": "Sheet1",
        "workbook": "Gm Contact List (1).xlsx"
      },
      "state_code": ""
    }
  ],
  "people": [
    {
      "directory_status": "active",
      "display_name": "Peyton Hale",
      "email": "marlowe.rhodes84@example.com",
      "first_name": "Remy",
      "last_name": "Prescott",
      "person_key": "logan-hale-1",
      "person_type": "person",
      "source_metadata": {
        "lphi_directory": {
          "row": 2,
          "sheet": "LPHI Directory",
          "workbook": "LPHI Directory.xlsx"
        }
      },
      "source_systems": [
        "lphi_directory"
      ],
      "title": "Co-CEO",
      "work_phone": "(555) 994-0794"
    },
    {
      "directory_status": "active",
      "display_name": "Finley Bennett",
      "email": "",
      "first_name": "Sawyer",
      "last_name": "Mercer",
      "person_key": "cameron-beckett-2",
      "person_type": "person",
      "source_metadata": {
        "gm_contact_list": {
          "column": 19,
          "resort": "K9 Resort Spencer Lambert",
          "row": 10,
          "sheet": "Sheet1",
          "workbook": "Gm Contact List (1).xlsx"
        }
      },
      "source_systems": [
        "gm_contact_list"
      ],
      "title": "General Manager",
      "work_phone": ""
    },
    {
      "directory_status": "active",
      "display_name": "Ellis Whitfield",
      "email": "",
      "first_name": "Skyler",
      "last_name": "Marsh",
      "person_key": "casey-brooks-3",
      "person_type": "person",
      "source_metadata": {
        "gm_contact_list": {
          "column": 17,
          "resort": "K9 Taylor Sterling",
          "row": 10,
          "sheet": "Sheet1",
          "workbook": "Gm Contact List (1).xlsx"
        }
      },
      "source_systems": [
        "gm_contact_list"
      ],
      "title": "General Manager",
      "work_phone": "(555) 560-8760"
    },
    {
      "directory_status": "active",
      "display_name": "Quinn Sterling",
      "email": "",
      "first_name": "Aubrey",
      "last_name": "Howell",
      "person_key": "hayden-sterling-4",
      "person_type": "person",
      "source_metadata": {
        "gm_contact_list": {
          "column": 13,
          "resort": "K9 Ellis Vance",
          "row": 40,
          "sheet": "Sheet1",
          "workbook": "Gm Contact List (1).xlsx"
        }
      },
      "source_systems": [
        "gm_contact_list"
      ],
      "title": "General Manager",
      "work_phone": ""
    },
    {
      "directory_status": "active",
      "display_name": "Jordan Calloway",
      "email": "",
      "first_name": "Harper",
      "last_name": "Beckett",
      "person_key": "sawyer-maddox-5",
      "person_type": "person",
      "source_metadata": {
        "gm_contact_list": {
          "column": 5,
          "resort": "K9 Skyler Hale",
          "row": 25,
          "sheet": "Sheet1",
          "workbook": "Gm Contact List (1).xlsx"
        }
      },
      "source_systems": [
        "gm_contact_list"
      ],
      "title": "General Manager",
      "work_phone": "(555) 971-3171"
    },
    {
      "directory_status": "active",
      "display_name": "Ellis Reed",
      "email": "",
      "first_name": "Sawyer",
      "last_name": "Vance",
      "person_key": "devon-ellison-6",
      "person_type": "person",
      "source_metadata": {
        "gm_contact_list": {
          "column": 13,
          "resort": "K9 Peyton Donovan",
          "row": 10,
          "sheet": "Sheet1",
          "workbook": "Gm Contact List (1).xlsx"
        }
      },
      "source_systems": [
        "gm_contact_list"
      ],
      "title": "General Manager",
      "work_phone": "(555) 482-1482"
    },
    {
      "directory_status": "active",
      "display_name": "Peyton Hale",
      "email": "peyton.forsythe50@example.com",
      "first_name": "Hayden",
      "last_name": "Lambert",
      "person_key": "riley-ellison-7",
      "person_type": "person",
      "source_metadata": {
        "lphi_directory": {
          "row": 8,
          "sheet": "LPHI Directory",
          "workbook": "LPHI Directory.xlsx"
        }
      },
      "source_systems": [
        "lphi_directory"
      ],
      "title": "Director of Real Estate",
      "work_phone": "(555) 223-8823"
    },
    {
      "directory_status": "active",
      "display_name": "Parker Sloan",
      "email": "skyler.bennett51@example.com",
      "first_name": "Emerson",
      "last_name": "Rhodes",
      "person_key": "ellis-bennett-8",
      "person_type": "person",
      "source_metadata": {
        "gm_contact_list": {
          "column": 13,
          "resort": "K9 Ellis Vance",
          "row": 43,
          "sheet": "Sheet1",
          "workbook": "Gm Contact List (1).xlsx"
        },
        "lphi_directory": {
          "row": 9,
          "sheet": "LPHI Directory",
          "workbook": "LPHI Directory.xlsx"
        }
      },
      "source_systems": [
        "gm_contact_list",
        "lphi_directory"
      ],
      "title": "Regional Manager",
      "work_phone": "(555) 984-0784"
    },
    {
      "directory_status": "active",
      "display_name": "Cameron Hale",
      "email": "",
      "first_name": "Drew",
      "last_name": "Delgado",
      "person_key": "avery-reed-9",
      "person_type": "person",
      "source_metadata": {
        "gm_contact_list": {
          "column": 3,
          "resort": "K9 Quinn Vance",
          "row": 70,
          "sheet": "Sheet1",
          "workbook": "Gm Contact List (1).xlsx"
        }
      },
      "source_systems": [
        "gm_contact_list"
      ],
      "title": "General Manager",
      "work_phone": "(555) 628-0828"
    },
    {
      "directory_status": "active",
      "display_name": "Quinn Nolan",
      "email": "",
      "first_name": "Devon",
      "last_name": "Bennett",
      "person_key": "jordan-foster-10",
      "person_type": "person",
      "source_metadata": {
        "gm_contact_list": {
          "column": 3,
          "resort": "K9 Casey Beckett",
          "row": 55,
          "sheet": "Sheet1",
          "workbook": "Gm Contact List (1).xlsx"
        }
      },
      "source_systems": [
        "gm_contact_list"
      ],
      "title": "General Manager",
      "work_phone": "(555) 602-6002"
    },
    {
      "directory_status": "active",
      "display_name": "Dakota Howell",
      "email": "hayden.rhodes56@example.com",
      "first_name": "Quinn",
      "last_name": "Ashford",
      "person_key": "cameron-marsh-11",
      "person_type": "person",
      "source_metadata": {
        "gm_contact_list": {
          "column": 3,
          "resort": "K9 Quinn Vance",
          "row": 73,
          "sheet": "Sheet1",
          "workbook": "Gm Contact List (1).xlsx"
        },
        "lphi_directory": {
          "row": 14,
          "sheet": "LPHI Directory",
          "workbook": "LPHI Directory.xlsx"
        }
      },
      "source_systems": [
        "gm_contact_list",
        "lphi_directory"
      ],
      "title": "Regional Manager",
      "work_phone": "(555) 558-6358"
    },
    {
      "directory_status": "active",
      "display_name": "Drew Sutton",
      "email": "",
      "first_name": "Avery",
      "last_name": "Beckett",
      "person_key": "aubrey-forsythe-12",
      "person_type": "person",
      "source_metadata": {
        "gm_contact_list": {
          "column": 5,
          "resort": "K9 Devon Ashford",
          "row": 10,
          "sheet": "Sheet1",
          "workbook": "Gm Contact List (1).xlsx"
        }
      },
      "source_systems": [
        "gm_contact_list"
      ],
      "title": "General Manager",
      "work_phone": "(555) 975-2775"
    },
    {
      "directory_status": "active",
      "display_name": "Jordan Sterling",
      "email": "",
      "first_name": "Finley",
      "last_name": "Ellison",
      "person_key": "casey-beckett-13",
      "person_type": "person",
      "source_metadata": {
        "gm_contact_list": {
          "column": 13,
          "resort": "K9 Riley Forsythe",
          "row": 25,
          "sheet": "Sheet1",
          "workbook": "Gm Contact List (1).xlsx"
        }
      },
      "source_systems": [
        "gm_contact_list"
      ],
      "title": "General Manager",
      "work_phone": ""
    },
    {
      "directory_status": "active",
      "display_name": "Harper Rhodes",
      "email": "remy.lambert36@example.com",
      "first_name": "Remy",
      "last_name": "Sutton",
      "person_key": "quinn-marsh-14",
      "person_type": "person",
      "source_metadata": {
        "lphi_directory": {
          "row": 11,
          "sheet": "LPHI Directory",
          "workbook": "LPHI Directory.xlsx"
        }
      },
      "source_systems": [
        "lphi_directory"
      ],
      "title": "Operations/Training Manager",
      "work_phone": "(555) 300-8100"
    },
    {
      "directory_status": "active",
      "display_name": "Skyler Carter",
      "email": "avery.foster81@example.com",
      "first_name": "Emerson",
      "last_name": "Vance",
      "person_key": "cameron-rhodes-15",
      "person_type": "person",
      "source_metadata": {
        "lphi_directory": {
          "row": 4,
          "sheet": "LPHI Directory",
          "workbook": "LPHI Directory.xlsx"
        }
      },
      "source_systems": [
        "lphi_directory"
      ],
      "title": "COO",
      "work_phone": "(555) 685-8485"
    },
    {
      "directory_status": "active",
      "display_name": "Ellis Carter",
      "email": "",
      "first_name": "Quinn",
      "last_name": "Vance",
      "person_key": "aubrey-rhodes-16",
      "person_type": "person",
      "source_metadata": {
        "gm_contact_list": {
          "column": 11,
          "resort": "K9 Parker Foster",
          "row": 10,
          "sheet": "Sheet1",
          "workbook": "Gm Contact List (1).xlsx"
        }
      },
      "source_systems": [
        "gm_contact_list"
      ],
      "title": "General Manager",
      "work_phone": "(555) 214-3214"
    },
    {
      "directory_status": "active",
      "display_name": "Quinn Vance",
      "email": "",
      "first_name": "Riley",
      "last_name": "Mercer",
      "person_key": "marlowe-howell-17",
      "person_type": "person",
      "source_metadata": {
        "gm_contact_list": {
          "column": 3,
          "resort": "K9 Jordan Ramsey",
          "row": 40,
          "sheet": "Sheet1",
          "workbook": "Gm Contact List (1).xlsx"
        }
      },
      "source_systems": [
        "gm_contact_list"
      ],
      "title": "General Manager",
      "work_phone": "(555) 804-5804"
    },
    {
      "directory_status": "active",
      "display_name": "Sage Donovan",
      "email": "cameron.sloan92@example.com",
      "first_name": "Reese",
      "last_name": "Beckett",
      "person_key": "blake-sutton-18",
      "person_type": "person",
      "source_metadata": {
        "lphi_directory": {
          "row": 5,
          "sheet": "LPHI Directory",
          "workbook": "LPHI Directory.xlsx"
        }
      },
      "source_systems": [
        "lphi_directory"
      ],
      "title": "CFO",
      "work_phone": "(555) 983-5583"
    },
    {
      "directory_status": "active",
      "display_name": "Morgan Marsh",
      "email": "harper.delgado20@example.com",
      "first_name": "Hayden",
      "last_name": "Ramsey",
      "person_key": "parker-foster-19",
      "person_type": "person",
      "source_metadata": {
        "lphi_directory": {
          "row": 7,
          "sheet": "LPHI Directory",
          "workbook": "LPHI Directory.xlsx"
        }
      },
      "source_systems": [
        "lphi_directory"
      ],
      "title": "CDO",
      "work_phone": "(555) 593-7993"
    },
    {
      "directory_status": "active",
      "display_name": "Taylor Reed",
      "email": "ellis.ellison72@example.com",
      "first_name": "Skyler",
      "last_name": "Sterling",
      "person_key": "tatum-howell-20",
      "person_type": "person",
      "source_metadata": {
        "lphi_directory": {
          "row": 6,
          "sheet": "LPHI Directory",
          "workbook": "LPHI Directory.xlsx"
        }
      },
      "source_systems": [
        "lphi_directory"
      ],
      "title": "CMO",
      "work_phone": "(555) 444-6244"
    },
    {
      "directory_status": "active",
      "display_name": "Sage Vance",
      "email": "sage.foster98@example.com",
      "first_name": "Blake",
      "last_name": "Brooks",
      "person_key": "finley-prescott-21",
      "person_type": "person",
      "source_metadata": {
        "lphi_directory": {
          "row": 3,
          "sheet": "LPHI Directory",
          "workbook": "LPHI Directory.xlsx"
        }
      },
      "source_systems": [
        "lphi_directory"
      ],
      "title": "Co-CEO",
      "work_phone": "(555) 768-4568"
    },
    {
      "directory_status": "active",
      "display_name": "Sawyer Sutton",
      "email": "dakota.nolan39@example.com",
      "first_name": "Jordan",
      "last_name": "Lambert",
      "person_key": "emerson-bennett-22",
      "person_type": "person",
      "source_metadata": {
        "lphi_directory": {
          "row": 13,
          "sheet": "LPHI Directory",
          "workbook": "LPHI Directory.xlsx"
        }
      },
      "source_systems": [
        "lphi_directory"
      ],
      "title": "Real Estate Analyst",
      "work_phone": "(555) 324-6124"
    },
    {
      "directory_status": "active",
      "display_name": "Remy Forsythe",
      "email": "",
      "first_name": "Emerson",
      "last_name": "Bennett",
      "person_key": "blake-bennett-23",
      "person_type": "person",
      "source_metadata": {
        "gm_contact_list": {
          "column": 7,
          "resort": "K9 Ellis Vance",
          "row": 10,
          "sheet": "Sheet1",
          "workbook": "Gm Contact List (1).xlsx"
        }
      },
      "source_systems": [
        "gm_contact_list"
      ],
      "title": "General Manager",
      "work_phone": "(555) 938-3938"
    },
    {
      "directory_status": "active",
      "display_name": "Spencer Nolan",
      "email": "",
      "first_name": "Casey",
      "last_name": "Delgado",
      "person_key": "devon-calloway-24",
      "person_type": "person",
      "source_metadata": {
        "gm_contact_list": {
          "column": 15,
          "resort": "Remy Calloway",
          "row": 10,
          "sheet": "Sheet1",
          "workbook": "Gm Contact List (1).xlsx"
        }
      },
      "source_systems": [
        "gm_contact_list"
      ],
      "title": "General Manager",
      "work_phone": "(555) 791-7791"
    },
    {
      "directory_status": "active",
      "display_name": "Harper Sterling",
      "email": "remy.sloan36@example.com",
      "first_name": "Sawyer",
      "last_name": "Lambert",
      "person_key": "rowan-beckett-25",
      "person_type": "person",
      "source_metadata": {
        "gm_contact_list": {
          "column": 5,
          "resort": "K9 Skyler Hale",
          "row": 28,
          "sheet": "Sheet1",
          "workbook": "Gm Contact List (1).xlsx"
        },
        "lphi_directory": {
          "row": 10,
          "sheet": "LPHI Directory",
          "workbook": "LPHI Directory.xlsx"
        }
      },
      "source_systems": [
        "gm_contact_list",
        "lphi_directory"
      ],
      "title": "Regional Manager",
      "work_phone": "(555) 219-5619"
    },
    {
      "directory_status": "active",
      "display_name": "Cameron Nolan",
      "email": "jordan.marsh32@example.com",
      "first_name": "Elliot",
      "last_name": "Ramsey",
      "person_key": "avery-bennett-26",
      "person_type": "person",
      "source_metadata": {
        "lphi_directory": {
          "row": 12,
          "sheet": "LPHI Directory",
          "workbook": "LPHI Directory.xlsx"
        }
      },
      "source_systems": [
        "lphi_directory"
      ],
      "title": "HR Manager",
      "work_phone": "(555) 929-6329"
    },
    {
      "directory_status": "active",
      "display_name": "Aubrey Prescott",
      "email": "",
      "first_name": "Taylor",
      "last_name": "Brooks",
      "person_key": "emerson-maddox-27",
      "person_type": "person",
      "source_metadata": {
        "gm_contact_list": {
          "column": 9,
          "resort": "K9 Rowan Larsen",
          "row": 10,
          "sheet": "Sheet1",
          "workbook": "Gm Contact List (1).xlsx"
        }
      },
      "source_systems": [
        "gm_contact_list"
      ],
      "title": "General Manager",
      "work_phone": "(555) 644-8444"
    },
    {
      "directory_status": "active",
      "display_name": "Drew Beckett",
      "email": "hayden.ellison42@example.com",
      "first_name": "Skyler",
      "last_name": "Brooks",
      "person_key": "aubrey-nolan-28",
      "person_type": "person",
      "source_metadata": {
        "gm_contact_list": {
          "column": 3,
          "resort": "K9 Adair Forsythe",
          "row": 25,
          "sheet": "Sheet1",
          "workbook": "Gm Contact List (1).xlsx"
        },
        "hierarchy_rule": {
          "note": ""
        },
        "lphi_directory": {
          "row": 15,
          "sheet": "LPHI Directory",
          "workbook": "LPHI Directory.xlsx"
        }
      },
      "source_systems": [
        "gm_contact_list",
        "lphi_directory"
      ],
      "title": "Director of Resorts / General Manager, Adair Forsythe",
      "work_phone": "(555) 516-8716"
    }
  ],
  "person_locations": [
    {
      "location_key": "cherry-hill",
      "person_key": "aubrey-nolan-28",
      "responsibility_type": "general_manager",
      "source": "gm_contact_list",
      "source_metadata": {
        "column": 3,
        "row": 25
      },
      "title": "General Manager"
    },
    {
      "location_key": "deerfield",
      "person_key": "devon-calloway-24",
      "responsibility_type": "general_manager",
      "source": "gm_contact_list",
      "source_metadata": {
        "column": 15,
        "row": 10
      },
      "title": "General Manager"
    },
    {
      "location_key": "deerfield",
      "person_key": "ellis-bennett-8",
      "responsibility_type": "regional_manager",
      "source": "gm_contact_list",
      "source_metadata": {
        "column": 15,
        "row": 13
      },
      "title": "Regional Manager"
    },
    {
      "location_key": "fairfield",
      "person_key": "marlowe-howell-17",
      "responsibility_type": "general_manager",
      "source": "gm_contact_list",
      "source_metadata": {
        "column": 3,
        "row": 40
      },
      "title": "General Manager"
    },
    {
      "location_key": "fairfield",
      "person_key": "cameron-marsh-11",
      "responsibility_type": "regional_manager",
      "source": "gm_contact_list",
      "source_metadata": {
        "column": 3,
        "row": 43
      },
      "title": "Regional Manager"
    },
    {
      "location_key": "greece",
      "person_key": "sawyer-maddox-5",
      "responsibility_type": "general_manager",
      "source": "gm_contact_list",
      "source_metadata": {
        "column": 5,
        "row": 25
      },
      "title": "General Manager"
    },
    {
      "location_key": "greece",
      "person_key": "rowan-beckett-25",
      "responsibility_type": "regional_manager",
      "source": "gm_contact_list",
      "source_metadata": {
        "column": 5,
        "row": 28
      },
      "title": "Regional Manager"
    },
    {
      "location_key": "hamilton",
      "person_key": "cameron-marsh-11",
      "responsibility_type": "regional_manager",
      "source": "gm_contact_list",
      "source_metadata": {
        "column": 3,
        "row": 13
      },
      "title": "Regional Manager"
    },
    {
      "location_key": "hindry-1001",
      "person_key": "cameron-beckett-2",
      "responsibility_type": "general_manager",
      "source": "gm_contact_list",
      "source_metadata": {
        "column": 19,
        "row": 10
      },
      "title": "General Manager"
    },
    {
      "location_key": "hindry-1001",
      "person_key": "ellis-bennett-8",
      "responsibility_type": "regional_manager",
      "source": "gm_contact_list",
      "source_metadata": {
        "column": 19,
        "row": 13
      },
      "title": "Regional Manager"
    },
    {
      "location_key": "madison",
      "person_key": "jordan-foster-10",
      "responsibility_type": "general_manager",
      "source": "gm_contact_list",
      "source_metadata": {
        "column": 3,
        "row": 55
      },
      "title": "General Manager"
    },
    {
      "location_key": "madison",
      "person_key": "cameron-marsh-11",
      "responsibility_type": "regional_manager",
      "source": "gm_contact_list",
      "source_metadata": {
        "column": 3,
        "row": 58
      },
      "title": "Regional Manager"
    },
    {
      "location_key": "malvern",
      "person_key": "emerson-maddox-27",
      "responsibility_type": "general_manager",
      "source": "gm_contact_list",
      "source_metadata": {
        "column": 9,
        "row": 10
      },
      "title": "General Manager"
    },
    {
      "location_key": "malvern",
      "person_key": "cameron-marsh-11",
      "responsibility_type": "regional_manager",
      "source": "gm_contact_list",
      "source_metadata": {
        "column": 9,
        "row": 13
      },
      "title": "Regional Manager"
    },
    {
      "location_key": "north-olmsted",
      "person_key": "aubrey-rhodes-16",
      "responsibility_type": "general_manager",
      "source": "gm_contact_list",
      "source_metadata": {
        "column": 11,
        "row": 10
      },
      "title": "General Manager"
    },
    {
      "location_key": "north-olmsted",
      "person_key": "ellis-bennett-8",
      "responsibility_type": "regional_manager",
      "source": "gm_contact_list",
      "source_metadata": {
        "column": 11,
        "row": 13
      },
      "title": "Regional Manager"
    },
    {
      "location_key": "oviedo-4004",
      "person_key": "hayden-sterling-4",
      "responsibility_type": "general_manager",
      "source": "gm_contact_list",
      "source_metadata": {
        "column": 13,
        "row": 40
      },
      "title": "General Manager"
    },
    {
      "location_key": "oviedo-4004",
      "person_key": "ellis-bennett-8",
      "responsibility_type": "regional_manager",
      "source": "gm_contact_list",
      "source_metadata": {
        "column": 13,
        "row": 43
      },
      "title": "Regional Manager"
    },
    {
      "location_key": "penfield",
      "person_key": "aubrey-forsythe-12",
      "responsibility_type": "general_manager",
      "source": "gm_contact_list",
      "source_metadata": {
        "column": 5,
        "row": 10
      },
      "title": "General Manager"
    },
    {
      "location_key": "penfield",
      "person_key": "rowan-beckett-25",
      "responsibility_type": "regional_manager",
      "source": "gm_contact_list",
      "source_metadata": {
        "column": 5,
        "row": 13
      },
      "title": "Regional Manager"
    },
    {
      "location_key": "pompano-beach-4002",
      "person_key": "casey-beckett-13",
      "responsibility_type": "general_manager",
      "source": "gm_contact_list",
      "source_metadata": {
        "column": 13,
        "row": 25
      },
      "title": "General Manager"
    },
    {
      "location_key": "pompano-beach-4002",
      "person_key": "ellis-bennett-8",
      "responsibility_type": "regional_manager",
      "source": "gm_contact_list",
      "source_metadata": {
        "column": 13,
        "row": 28
      },
      "title": "Regional Manager"
    },
    {
      "location_key": "roxbury",
      "person_key": "avery-reed-9",
      "responsibility_type": "general_manager",
      "source": "gm_contact_list",
      "source_metadata": {
        "column": 3,
        "row": 70
      },
      "title": "General Manager"
    },
    {
      "location_key": "roxbury",
      "person_key": "cameron-marsh-11",
      "responsibility_type": "regional_manager",
      "source": "gm_contact_list",
      "source_metadata": {
        "column": 3,
        "row": 73
      },
      "title": "Regional Manager"
    },
    {
      "location_key": "scottsdale-5001",
      "person_key": "casey-brooks-3",
      "responsibility_type": "general_manager",
      "source": "gm_contact_list",
      "source_metadata": {
        "column": 17,
        "row": 10
      },
      "title": "General Manager"
    },
    {
      "location_key": "scottsdale-5001",
      "person_key": "ellis-bennett-8",
      "responsibility_type": "regional_manager",
      "source": "gm_contact_list",
      "source_metadata": {
        "column": 17,
        "row": 13
      },
      "title": "Regional Manager"
    },
    {
      "location_key": "stamford",
      "person_key": "blake-bennett-23",
      "responsibility_type": "general_manager",
      "source": "gm_contact_list",
      "source_metadata": {
        "column": 7,
        "row": 10
      },
      "title": "General Manager"
    },
    {
      "location_key": "stamford",
      "person_key": "cameron-marsh-11",
      "responsibility_type": "regional_manager",
      "source": "gm_contact_list",
      "source_metadata": {
        "column": 7,
        "row": 13
      },
      "title": "Regional Manager"
    },
    {
      "location_key": "wellington-4001",
      "person_key": "devon-ellison-6",
      "responsibility_type": "general_manager",
      "source": "gm_contact_list",
      "source_metadata": {
        "column": 13,
        "row": 10
      },
      "title": "General Manager"
    },
    {
      "location_key": "wellington-4001",
      "person_key": "ellis-bennett-8",
      "responsibility_type": "regional_manager",
      "source": "gm_contact_list",
      "source_metadata": {
        "column": 13,
        "row": 13
      },
      "title": "Regional Manager"
    }
  ],
  "source_files": {
    "corporate": "(local source file)",
    "resorts": "(local source file)"
  }
}$k9dir$::jsonb AS data
),
locations_input AS (
  SELECT *
  FROM payload, jsonb_to_recordset(data->'locations') AS row(
    location_key text,
    source_location_name text,
    display_name text,
    state_code text,
    region_label text,
    address_line1 text,
    address_line2 text,
    city text,
    postal_code text,
    resort_phone text,
    resort_email text,
    hours jsonb,
    directory_status text,
    source_metadata jsonb
  )
),
people_input AS (
  SELECT *
  FROM payload, jsonb_to_recordset(data->'people') AS row(
    person_key text,
    first_name text,
    last_name text,
    display_name text,
    email text,
    work_phone text,
    title text,
    person_type text,
    directory_status text,
    source_systems text[],
    source_metadata jsonb
  )
),
person_locations_input AS (
  SELECT *
  FROM payload, jsonb_to_recordset(data->'person_locations') AS row(
    person_key text,
    location_key text,
    responsibility_type text,
    title text,
    source text,
    source_metadata jsonb
  )
),
edges_input AS (
  SELECT *
  FROM payload, jsonb_to_recordset(data->'edges') AS row(
    parent_key text,
    child_key text,
    relationship_type text,
    is_primary boolean,
    source text,
    source_metadata jsonb
  )
),
gaps_input AS (
  SELECT *
  FROM payload, jsonb_to_recordset(data->'gaps') AS row(
    gap_key text,
    entity_type text,
    entity_key text,
    location_key text,
    person_key text,
    field_name text,
    severity text,
    status_label text,
    detail text,
    source_metadata jsonb
  )
),
upsert_locations AS (
  INSERT INTO public.enterprise_directory_locations (
    location_key,
    source_location_name,
    display_name,
    state_code,
    region_label,
    address_line1,
    address_line2,
    city,
    postal_code,
    resort_phone,
    resort_email,
    hours,
    directory_status,
    source_metadata
  )
  SELECT
    location_key,
    source_location_name,
    display_name,
    NULLIF(state_code, ''),
    NULLIF(region_label, ''),
    NULLIF(address_line1, ''),
    NULLIF(address_line2, ''),
    NULLIF(city, ''),
    NULLIF(postal_code, ''),
    NULLIF(resort_phone, ''),
    NULLIF(resort_email, ''),
    COALESCE(hours, '[]'::jsonb),
    directory_status,
    source_metadata
  FROM locations_input
  ON CONFLICT (location_key) DO UPDATE SET
    source_location_name = EXCLUDED.source_location_name,
    display_name = EXCLUDED.display_name,
    state_code = EXCLUDED.state_code,
    region_label = EXCLUDED.region_label,
    address_line1 = EXCLUDED.address_line1,
    address_line2 = EXCLUDED.address_line2,
    city = EXCLUDED.city,
    postal_code = EXCLUDED.postal_code,
    resort_phone = EXCLUDED.resort_phone,
    resort_email = EXCLUDED.resort_email,
    hours = EXCLUDED.hours,
    directory_status = EXCLUDED.directory_status,
    source_metadata = EXCLUDED.source_metadata,
    updated_at = now()
  RETURNING id, location_key
),
upsert_people AS (
  INSERT INTO public.enterprise_directory_people (
    person_key,
    first_name,
    last_name,
    display_name,
    email,
    work_phone,
    title,
    person_type,
    directory_status,
    source_systems,
    source_metadata
  )
  SELECT
    person_key,
    NULLIF(first_name, ''),
    NULLIF(last_name, ''),
    display_name,
    NULLIF(email, ''),
    NULLIF(work_phone, ''),
    NULLIF(title, ''),
    person_type,
    directory_status,
    source_systems,
    source_metadata
  FROM people_input
  ON CONFLICT (person_key) DO UPDATE SET
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    display_name = EXCLUDED.display_name,
    email = EXCLUDED.email,
    work_phone = EXCLUDED.work_phone,
    title = EXCLUDED.title,
    person_type = EXCLUDED.person_type,
    directory_status = EXCLUDED.directory_status,
    source_systems = EXCLUDED.source_systems,
    source_metadata = EXCLUDED.source_metadata,
    updated_at = now()
  RETURNING id, person_key
),
delete_assignments AS (
  DELETE FROM public.enterprise_directory_person_locations
  WHERE source = 'gm_contact_list'
),
insert_assignments AS (
  INSERT INTO public.enterprise_directory_person_locations (
    person_id,
    location_id,
    responsibility_type,
    title,
    source,
    source_metadata
  )
  SELECT
    p.id,
    l.id,
    pli.responsibility_type,
    NULLIF(pli.title, ''),
    pli.source,
    pli.source_metadata
  FROM person_locations_input pli
  JOIN public.enterprise_directory_people p ON p.person_key = pli.person_key
  JOIN public.enterprise_directory_locations l ON l.location_key = pli.location_key
  ON CONFLICT (person_id, location_id, responsibility_type) DO UPDATE SET
    title = EXCLUDED.title,
    source = EXCLUDED.source,
    source_metadata = EXCLUDED.source_metadata,
    updated_at = now()
),
delete_edges AS (
  DELETE FROM public.enterprise_directory_edges
  WHERE source IN ('hierarchy_rule', 'gm_contact_list')
),
insert_edges AS (
  INSERT INTO public.enterprise_directory_edges (
    parent_person_id,
    child_person_id,
    relationship_type,
    is_primary,
    source,
    source_metadata
  )
  SELECT
    parent.id,
    child.id,
    ei.relationship_type,
    ei.is_primary,
    ei.source,
    ei.source_metadata
  FROM edges_input ei
  JOIN public.enterprise_directory_people parent ON parent.person_key = ei.parent_key
  JOIN public.enterprise_directory_people child ON child.person_key = ei.child_key
  WHERE parent.id <> child.id
  ON CONFLICT (parent_person_id, child_person_id, relationship_type) DO UPDATE SET
    is_primary = EXCLUDED.is_primary,
    source = EXCLUDED.source,
    source_metadata = EXCLUDED.source_metadata,
    updated_at = now()
),
delete_gaps AS (
  DELETE FROM public.enterprise_directory_data_gaps
  WHERE source = 'directory_workbook_import'
),
insert_gaps AS (
  INSERT INTO public.enterprise_directory_data_gaps (
    gap_key,
    entity_type,
    entity_key,
    location_id,
    person_id,
    field_name,
    severity,
    status_label,
    detail,
    source,
    source_metadata
  )
  SELECT
    gi.gap_key,
    gi.entity_type,
    gi.entity_key,
    l.id,
    p.id,
    gi.field_name,
    gi.severity,
    gi.status_label,
    gi.detail,
    'directory_workbook_import',
    gi.source_metadata
  FROM gaps_input gi
  LEFT JOIN public.enterprise_directory_locations l ON l.location_key = NULLIF(gi.location_key, '')
  LEFT JOIN public.enterprise_directory_people p ON p.person_key = NULLIF(gi.person_key, '')
  ON CONFLICT (gap_key) DO UPDATE SET
    entity_type = EXCLUDED.entity_type,
    entity_key = EXCLUDED.entity_key,
    location_id = EXCLUDED.location_id,
    person_id = EXCLUDED.person_id,
    field_name = EXCLUDED.field_name,
    severity = EXCLUDED.severity,
    status_label = EXCLUDED.status_label,
    detail = EXCLUDED.detail,
    source = EXCLUDED.source,
    source_metadata = EXCLUDED.source_metadata,
    updated_at = now()
)
SELECT
  (SELECT count(*) FROM locations_input) AS imported_locations,
  (SELECT count(*) FROM people_input) AS imported_people,
  (SELECT count(*) FROM person_locations_input) AS imported_person_locations,
  (SELECT count(*) FROM edges_input) AS imported_edges,
  (SELECT count(*) FROM gaps_input) AS imported_gaps;
-- END GENERATED DIRECTORY IMPORT

COMMIT;
