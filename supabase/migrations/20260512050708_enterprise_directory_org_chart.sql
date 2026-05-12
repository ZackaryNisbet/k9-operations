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
    WHEN p.person_key IN ('alan-leibman', 'phil-nisbet', 'lia-moncholi') THEN 'group:co-ceos'
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
    CASE WHEN p.person_key IN ('alan-leibman', 'phil-nisbet') THEN 'co-ceo' END,
    CASE WHEN p.person_key = 'lia-moncholi' THEN 'coo' END,
    CASE WHEN p.person_key = 'sean-powell' THEN 'resort-operations' END,
    CASE WHEN p.person_key = 'zack-nisbet' THEN 'director-resorts' END,
    CASE WHEN person_locations.location_names IS NOT NULL THEN 'location-responsibility' END
  ], NULL)::text[] AS tags,
  CASE
    WHEN p.person_key IN ('alan-leibman', 'phil-nisbet') THEN 10
    WHEN p.person_key = 'lia-moncholi' THEN 20
    WHEN p.person_key = 'sean-powell' THEN 30
    WHEN p.person_key = 'zack-nisbet' THEN 40
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
-- - /Users/zacknisbet/Downloads/LPHI Directory.xlsx
-- - /Users/zacknisbet/Downloads/Gm Contact List (1).xlsx

WITH payload AS (
  SELECT $k9dir${
  "edges": [
    {
      "child_key": "lia-moncholi",
      "is_primary": true,
      "parent_key": "alan-leibman",
      "relationship_type": "reports_to",
      "source": "hierarchy_rule",
      "source_metadata": {
        "note": "Lia reports to both Co-CEOs; Alan is primary for table edge ordering."
      }
    },
    {
      "child_key": "cheyenne-hamilton",
      "is_primary": true,
      "parent_key": "johnny-meeth",
      "relationship_type": "reports_to",
      "source": "gm_contact_list",
      "source_metadata": {}
    },
    {
      "child_key": "coby-shepard",
      "is_primary": true,
      "parent_key": "johnny-meeth",
      "relationship_type": "reports_to",
      "source": "gm_contact_list",
      "source_metadata": {}
    },
    {
      "child_key": "daravanh-vongsouvanh",
      "is_primary": true,
      "parent_key": "johnny-meeth",
      "relationship_type": "reports_to",
      "source": "gm_contact_list",
      "source_metadata": {}
    },
    {
      "child_key": "francesa-smith",
      "is_primary": true,
      "parent_key": "johnny-meeth",
      "relationship_type": "reports_to",
      "source": "gm_contact_list",
      "source_metadata": {}
    },
    {
      "child_key": "kyle-scott",
      "is_primary": true,
      "parent_key": "johnny-meeth",
      "relationship_type": "reports_to",
      "source": "gm_contact_list",
      "source_metadata": {}
    },
    {
      "child_key": "logan-chilton",
      "is_primary": true,
      "parent_key": "johnny-meeth",
      "relationship_type": "reports_to",
      "source": "gm_contact_list",
      "source_metadata": {}
    },
    {
      "child_key": "sarah-evers",
      "is_primary": true,
      "parent_key": "johnny-meeth",
      "relationship_type": "reports_to",
      "source": "gm_contact_list",
      "source_metadata": {}
    },
    {
      "child_key": "juan-francisco",
      "is_primary": true,
      "parent_key": "kevin-russell",
      "relationship_type": "reports_to",
      "source": "gm_contact_list",
      "source_metadata": {}
    },
    {
      "child_key": "kelly-peterson",
      "is_primary": true,
      "parent_key": "kevin-russell",
      "relationship_type": "reports_to",
      "source": "gm_contact_list",
      "source_metadata": {}
    },
    {
      "child_key": "mary-barrett",
      "is_primary": true,
      "parent_key": "kevin-russell",
      "relationship_type": "reports_to",
      "source": "gm_contact_list",
      "source_metadata": {}
    },
    {
      "child_key": "ruby-martinez",
      "is_primary": true,
      "parent_key": "kevin-russell",
      "relationship_type": "reports_to",
      "source": "gm_contact_list",
      "source_metadata": {}
    },
    {
      "child_key": "tyler-matunis",
      "is_primary": true,
      "parent_key": "kevin-russell",
      "relationship_type": "reports_to",
      "source": "gm_contact_list",
      "source_metadata": {}
    },
    {
      "child_key": "sean-powell",
      "is_primary": true,
      "parent_key": "lia-moncholi",
      "relationship_type": "reports_to",
      "source": "hierarchy_rule",
      "source_metadata": {}
    },
    {
      "child_key": "lia-moncholi",
      "is_primary": false,
      "parent_key": "phil-nisbet",
      "relationship_type": "reports_to",
      "source": "hierarchy_rule",
      "source_metadata": {
        "note": "Lia reports to both Co-CEOs."
      }
    },
    {
      "child_key": "elizabeth-arnold",
      "is_primary": true,
      "parent_key": "sean-powell",
      "relationship_type": "reports_to",
      "source": "gm_contact_list",
      "source_metadata": {
        "note": "No separate regional manager listed."
      }
    },
    {
      "child_key": "johnny-meeth",
      "is_primary": true,
      "parent_key": "sean-powell",
      "relationship_type": "reports_to",
      "source": "hierarchy_rule",
      "source_metadata": {}
    },
    {
      "child_key": "kevin-russell",
      "is_primary": true,
      "parent_key": "sean-powell",
      "relationship_type": "reports_to",
      "source": "hierarchy_rule",
      "source_metadata": {}
    },
    {
      "child_key": "kim-levine",
      "is_primary": true,
      "parent_key": "sean-powell",
      "relationship_type": "reports_to",
      "source": "gm_contact_list",
      "source_metadata": {
        "note": "No separate regional manager listed."
      }
    },
    {
      "child_key": "stevyn-dockery",
      "is_primary": true,
      "parent_key": "sean-powell",
      "relationship_type": "reports_to",
      "source": "hierarchy_rule",
      "source_metadata": {}
    },
    {
      "child_key": "zack-nisbet",
      "is_primary": true,
      "parent_key": "sean-powell",
      "relationship_type": "reports_to",
      "source": "hierarchy_rule",
      "source_metadata": {
        "note": "Zack is Director of Resorts and GM for Cherry Hill; represented once."
      }
    }
  ],
  "gaps": [
    {
      "detail": "Cherry Hill is missing regional manager data in the workbook.",
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
      "detail": "Greece: No separate regional manager listed.",
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
      "detail": "Hamilton is missing GM name/email/phone data in the workbook.",
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
      "detail": "Penfield: No separate regional manager listed.",
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
      "detail": "Regional Managers list names Stevyn Dockery for CA/AZ, while the CA/AZ resort rows list Johnny Meeth as ERVP.",
      "entity_key": "ca-az",
      "entity_type": "regional_assignment",
      "field_name": "regional_manager",
      "gap_key": "regional-list:ca-az-conflict",
      "location_key": "",
      "person_key": "stevyn-dockery",
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
      "address_line1": "Cherry Hill, NJ 08003",
      "address_line2": "(856) 322-8044",
      "city": "",
      "directory_status": "active",
      "display_name": "Cherry Hill",
      "hours": [
        "Daycare: M-F 7am-7pm",
        "Sat-Sun 9am-530pm"
      ],
      "location_key": "cherry-hill",
      "postal_code": "",
      "region_label": "NJ",
      "resort_email": "cherryhill@k9resorts.com",
      "resort_phone": "(856) 322-8044",
      "source_location_name": "K9 Cherry Hill",
      "source_metadata": {
        "block_start_row": 17,
        "column": 3,
        "sheet": "Sheet1",
        "workbook": "Gm Contact List (1).xlsx"
      },
      "state_code": ""
    },
    {
      "address_line1": "Deerfield, IL 60015",
      "address_line2": "(847) 443-9086",
      "city": "",
      "directory_status": "active",
      "display_name": "Deerfield",
      "hours": [
        "Boarding: M-F 9am-530pm",
        "Daycare: M-F 7am-7pm",
        "Sat-Sun 9am-530pm"
      ],
      "location_key": "deerfield",
      "postal_code": "",
      "region_label": "IL",
      "resort_email": "deerfield@k9resorts.com",
      "resort_phone": "(847) 443-9086",
      "source_location_name": "Deerfield",
      "source_metadata": {
        "block_start_row": 2,
        "column": 15,
        "sheet": "Sheet1",
        "workbook": "Gm Contact List (1).xlsx"
      },
      "state_code": ""
    },
    {
      "address_line1": "Fairfield, NJ 07004",
      "address_line2": "(973) 756-3815",
      "city": "",
      "directory_status": "active",
      "display_name": "Fairfield",
      "hours": [
        "Boarding: M-F 9am-530pm",
        "Daycare: M-F 7am-7pm",
        "Sat-Sun 9am-530pm"
      ],
      "location_key": "fairfield",
      "postal_code": "",
      "region_label": "NJ",
      "resort_email": "fairfield@k9resorts.com",
      "resort_phone": "(973) 756-3815",
      "source_location_name": "K9 Fairfield",
      "source_metadata": {
        "block_start_row": 32,
        "column": 3,
        "sheet": "Sheet1",
        "workbook": "Gm Contact List (1).xlsx"
      },
      "state_code": ""
    },
    {
      "address_line1": "Greece, NY 14626",
      "address_line2": "(585) 541-3911",
      "city": "",
      "directory_status": "active",
      "display_name": "Greece",
      "hours": [
        "Boarding: M-F 9am-530pm",
        "Daycare: M-F 7am-7pm",
        "Sat-Sun 9am-530pm"
      ],
      "location_key": "greece",
      "postal_code": "",
      "region_label": "NY",
      "resort_email": "greece@k9resorts.com",
      "resort_phone": "(585) 541-3911",
      "source_location_name": "K9 Greece",
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
      "address_line2": "(609) 546-4233",
      "city": "",
      "directory_status": "active",
      "display_name": "Hamilton",
      "hours": [
        "Boarding: M-F 9am-530pm",
        "Daycare: M-F 7am-7pm",
        "Sat-Sun 9am-530pm"
      ],
      "location_key": "hamilton",
      "postal_code": "",
      "region_label": "NJ",
      "resort_email": "hamilton@k9resorts.com",
      "resort_phone": "(609) 546-4233",
      "source_location_name": "K9 Hamilton",
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
      "address_line2": "(323) 968-9489",
      "city": "",
      "directory_status": "active",
      "display_name": "Hindry 1001",
      "hours": [
        "Boarding: M-F 9am-530pm",
        "Daycare: M-F 7am-7pm",
        "Sat-Sun 9am-530pm"
      ],
      "location_key": "hindry-1001",
      "postal_code": "",
      "region_label": "CA",
      "resort_email": "losangeles@k9resorts.com",
      "resort_phone": "(323) 968-9489",
      "source_location_name": "K9 Resort Hindry 1001",
      "source_metadata": {
        "block_start_row": 2,
        "column": 19,
        "sheet": "Sheet1",
        "workbook": "Gm Contact List (1).xlsx"
      },
      "state_code": ""
    },
    {
      "address_line1": "Madison, NJ 07940",
      "address_line2": "(973) 756-3717",
      "city": "",
      "directory_status": "active",
      "display_name": "Madison",
      "hours": [
        "Boarding: M-F 9am-530pm",
        "Daycare: M-F 7am-7pm",
        "Sat-Sun 9am-530pm"
      ],
      "location_key": "madison",
      "postal_code": "",
      "region_label": "NJ",
      "resort_email": "madison@k9resorts.com",
      "resort_phone": "(973) 756-3717",
      "source_location_name": "K9 Madison",
      "source_metadata": {
        "block_start_row": 47,
        "column": 3,
        "sheet": "Sheet1",
        "workbook": "Gm Contact List (1).xlsx"
      },
      "state_code": ""
    },
    {
      "address_line1": "Malvern, PA 19355",
      "address_line2": "(610) 365-4547",
      "city": "",
      "directory_status": "active",
      "display_name": "Malvern",
      "hours": [
        "Boarding: M-F 9am-530pm",
        "Daycare: M-F 7am-7pm",
        "Sat-Sun 9am-530pm"
      ],
      "location_key": "malvern",
      "postal_code": "",
      "region_label": "PA",
      "resort_email": "malvern@k9resorts.com",
      "resort_phone": "(610) 365-4547",
      "source_location_name": "K9 Malvern",
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
      "address_line2": "440-577-4070",
      "city": "",
      "directory_status": "active",
      "display_name": "North Olmsted",
      "hours": [
        "Boarding: M-F 9am-530pm",
        "Daycare: M-F 7am-7pm",
        "Sat-Sun 9am-530pm"
      ],
      "location_key": "north-olmsted",
      "postal_code": "",
      "region_label": "OH",
      "resort_email": "north.olmsted@k9resorts.com",
      "resort_phone": "(440) 577-4070",
      "source_location_name": "K9 North Olmsted",
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
      "address_line2": "(321)471-5500",
      "city": "",
      "directory_status": "active",
      "display_name": "Oviedo 4004",
      "hours": [
        "Boarding: M-F 9am-530pm",
        "Daycare: M-F 7am-7pm",
        "Sat-Sun 9am-530pm"
      ],
      "location_key": "oviedo-4004",
      "postal_code": "",
      "region_label": "FL",
      "resort_email": "oviedo@k9resorts.com",
      "resort_phone": "(321) 471-5500",
      "source_location_name": "K9 Oviedo 4004",
      "source_metadata": {
        "block_start_row": 32,
        "column": 13,
        "sheet": "Sheet1",
        "workbook": "Gm Contact List (1).xlsx"
      },
      "state_code": ""
    },
    {
      "address_line1": "Penfield, NY 14526",
      "address_line2": "(585) 946-8416",
      "city": "",
      "directory_status": "active",
      "display_name": "Penfield",
      "hours": [
        "Boarding: M-F 9am-530pm",
        "Daycare: M-F 7am-7pm",
        "Sat-Sun 9am-530pm"
      ],
      "location_key": "penfield",
      "postal_code": "",
      "region_label": "NY",
      "resort_email": "penfield@k9resorts.com",
      "resort_phone": "(585) 946-8416",
      "source_location_name": "K9 Penfield",
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
      "address_line2": "(754) 704-5725",
      "city": "",
      "directory_status": "active",
      "display_name": "Pompano Beach 4002",
      "hours": [
        "Boarding: M-F 9am-530pm",
        "Daycare: M-F 7am-7pm",
        "Sat-Sun 9am-530pm"
      ],
      "location_key": "pompano-beach-4002",
      "postal_code": "",
      "region_label": "FL",
      "resort_email": "pompanobeach@k9resorts.com",
      "resort_phone": "(754) 704-5725",
      "source_location_name": "K9 Pompano Beach 4002",
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
      "address_line2": "(973) 453-0924",
      "city": "",
      "directory_status": "active",
      "display_name": "Roxbury",
      "hours": [
        "Boarding: M-F 9am-530pm",
        "Daycare: M-F 7am-7pm",
        "Sat-Sun 9am-530pm"
      ],
      "location_key": "roxbury",
      "postal_code": "",
      "region_label": "NJ",
      "resort_email": "roxbury@k9resorts.com",
      "resort_phone": "(973) 453-0924",
      "source_location_name": "K9 Roxbury",
      "source_metadata": {
        "block_start_row": 62,
        "column": 3,
        "sheet": "Sheet1",
        "workbook": "Gm Contact List (1).xlsx"
      },
      "state_code": ""
    },
    {
      "address_line1": "Scottsdale, AZ 85259",
      "address_line2": "(480) 999-7776",
      "city": "",
      "directory_status": "active",
      "display_name": "Scottsdale 5001",
      "hours": [
        "Boarding: M-F 9am-530pm",
        "Daycare: M-F 7am-7pm",
        "Sat-Sun 9am-530pm"
      ],
      "location_key": "scottsdale-5001",
      "postal_code": "",
      "region_label": "AZ",
      "resort_email": "scottsdale@k9resorts.com",
      "resort_phone": "(480) 999-7776",
      "source_location_name": "K9 Scottsdale 5001",
      "source_metadata": {
        "block_start_row": 2,
        "column": 17,
        "sheet": "Sheet1",
        "workbook": "Gm Contact List (1).xlsx"
      },
      "state_code": ""
    },
    {
      "address_line1": "Stamford, CT 06902",
      "address_line2": "(203) 344-7615",
      "city": "",
      "directory_status": "active",
      "display_name": "Stamford",
      "hours": [
        "Boarding: M-F 9am-530pm",
        "Daycare: M-F 7am-7pm",
        "Sat-Sun 9am-530pm"
      ],
      "location_key": "stamford",
      "postal_code": "",
      "region_label": "CT",
      "resort_email": "stamford@k9resorts.com",
      "resort_phone": "(203) 344-7615",
      "source_location_name": "K9 Stamford",
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
      "address_line2": "(561) 464-5730",
      "city": "",
      "directory_status": "active",
      "display_name": "Wellington 4001",
      "hours": [
        "Boarding: M-F 9am-530pm",
        "Daycare: M-F 7am-7pm",
        "Sat-Sun 9am-530pm"
      ],
      "location_key": "wellington-4001",
      "postal_code": "",
      "region_label": "FL",
      "resort_email": "wellington@k9resorts.com",
      "resort_phone": "(561) 464-5730",
      "source_location_name": "K9 Wellington 4001",
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
      "display_name": "Alan Leibman",
      "email": "alan.leibman@lphik9.com",
      "first_name": "Alan",
      "last_name": "Leibman",
      "person_key": "alan-leibman",
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
      "work_phone": "(646) 239-2203"
    },
    {
      "directory_status": "active",
      "display_name": "Cheyenne Hamilton",
      "email": "",
      "first_name": "Cheyenne",
      "last_name": "Hamilton",
      "person_key": "cheyenne-hamilton",
      "person_type": "person",
      "source_metadata": {
        "gm_contact_list": {
          "column": 19,
          "resort": "K9 Resort Hindry 1001",
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
      "display_name": "Coby Shepard",
      "email": "",
      "first_name": "Coby",
      "last_name": "Shepard",
      "person_key": "coby-shepard",
      "person_type": "person",
      "source_metadata": {
        "gm_contact_list": {
          "column": 17,
          "resort": "K9 Scottsdale 5001",
          "row": 10,
          "sheet": "Sheet1",
          "workbook": "Gm Contact List (1).xlsx"
        }
      },
      "source_systems": [
        "gm_contact_list"
      ],
      "title": "General Manager",
      "work_phone": "(417) 342-0714"
    },
    {
      "directory_status": "active",
      "display_name": "Daravanh Vongsouvanh",
      "email": "",
      "first_name": "Daravanh",
      "last_name": "Vongsouvanh",
      "person_key": "daravanh-vongsouvanh",
      "person_type": "person",
      "source_metadata": {
        "gm_contact_list": {
          "column": 13,
          "resort": "K9 Oviedo 4004",
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
      "display_name": "Elizabeth Arnold",
      "email": "",
      "first_name": "Elizabeth",
      "last_name": "Arnold",
      "person_key": "elizabeth-arnold",
      "person_type": "person",
      "source_metadata": {
        "gm_contact_list": {
          "column": 5,
          "resort": "K9 Greece",
          "row": 25,
          "sheet": "Sheet1",
          "workbook": "Gm Contact List (1).xlsx"
        }
      },
      "source_systems": [
        "gm_contact_list"
      ],
      "title": "General Manager",
      "work_phone": "(585) 474-5886"
    },
    {
      "directory_status": "active",
      "display_name": "Francesa Smith",
      "email": "",
      "first_name": "Francesa",
      "last_name": "Smith",
      "person_key": "francesa-smith",
      "person_type": "person",
      "source_metadata": {
        "gm_contact_list": {
          "column": 13,
          "resort": "K9 Wellington 4001",
          "row": 10,
          "sheet": "Sheet1",
          "workbook": "Gm Contact List (1).xlsx"
        }
      },
      "source_systems": [
        "gm_contact_list"
      ],
      "title": "General Manager",
      "work_phone": "(917) 951-9271"
    },
    {
      "directory_status": "active",
      "display_name": "Jerry Kallman",
      "email": "jerry.kallman@lphik9.com",
      "first_name": "Jerry",
      "last_name": "Kallman",
      "person_key": "jerry-kallman",
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
      "work_phone": "(201) 456-0767"
    },
    {
      "directory_status": "active",
      "display_name": "Johnny Meeth",
      "email": "johnny.meeth@lphik9.com",
      "first_name": "Johnny",
      "last_name": "Meeth",
      "person_key": "johnny-meeth",
      "person_type": "person",
      "source_metadata": {
        "gm_contact_list": {
          "column": 13,
          "resort": "K9 Oviedo 4004",
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
      "work_phone": "(551) 655-0206"
    },
    {
      "directory_status": "active",
      "display_name": "Juan Francisco",
      "email": "",
      "first_name": "Juan",
      "last_name": "Francisco",
      "person_key": "juan-francisco",
      "person_type": "person",
      "source_metadata": {
        "gm_contact_list": {
          "column": 3,
          "resort": "K9 Roxbury",
          "row": 70,
          "sheet": "Sheet1",
          "workbook": "Gm Contact List (1).xlsx"
        }
      },
      "source_systems": [
        "gm_contact_list"
      ],
      "title": "General Manager",
      "work_phone": "(862) 462-1448"
    },
    {
      "directory_status": "active",
      "display_name": "Kelly Peterson",
      "email": "",
      "first_name": "Kelly",
      "last_name": "Peterson",
      "person_key": "kelly-peterson",
      "person_type": "person",
      "source_metadata": {
        "gm_contact_list": {
          "column": 3,
          "resort": "K9 Madison",
          "row": 55,
          "sheet": "Sheet1",
          "workbook": "Gm Contact List (1).xlsx"
        }
      },
      "source_systems": [
        "gm_contact_list"
      ],
      "title": "General Manager",
      "work_phone": "(732) 570-2836"
    },
    {
      "directory_status": "active",
      "display_name": "Kevin Russell",
      "email": "kevin.russell@k9resorts.com",
      "first_name": "Kevin",
      "last_name": "Russell",
      "person_key": "kevin-russell",
      "person_type": "person",
      "source_metadata": {
        "gm_contact_list": {
          "column": 3,
          "resort": "K9 Roxbury",
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
      "work_phone": "(609) 462-8279"
    },
    {
      "directory_status": "active",
      "display_name": "Kim Levine",
      "email": "",
      "first_name": "Kim",
      "last_name": "Levine",
      "person_key": "kim-levine",
      "person_type": "person",
      "source_metadata": {
        "gm_contact_list": {
          "column": 5,
          "resort": "K9 Penfield",
          "row": 10,
          "sheet": "Sheet1",
          "workbook": "Gm Contact List (1).xlsx"
        }
      },
      "source_systems": [
        "gm_contact_list"
      ],
      "title": "General Manager",
      "work_phone": "(585) 953-1415"
    },
    {
      "directory_status": "active",
      "display_name": "Kyle Scott",
      "email": "",
      "first_name": "Kyle",
      "last_name": "Scott",
      "person_key": "kyle-scott",
      "person_type": "person",
      "source_metadata": {
        "gm_contact_list": {
          "column": 13,
          "resort": "K9 Pompano Beach 4002",
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
      "display_name": "Kyrie Farrell",
      "email": "kyrie.farrell@lphik9.com",
      "first_name": "Kyrie",
      "last_name": "Farrell",
      "person_key": "kyrie-farrell",
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
      "work_phone": "(509) 939-7162"
    },
    {
      "directory_status": "active",
      "display_name": "Lia Moncholi",
      "email": "lia.moncholi@lphik9.com",
      "first_name": "Lia",
      "last_name": "Moncholi",
      "person_key": "lia-moncholi",
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
      "work_phone": "(561) 635-6305"
    },
    {
      "directory_status": "active",
      "display_name": "Logan Chilton",
      "email": "",
      "first_name": "Logan",
      "last_name": "Chilton",
      "person_key": "logan-chilton",
      "person_type": "person",
      "source_metadata": {
        "gm_contact_list": {
          "column": 11,
          "resort": "K9 North Olmsted",
          "row": 10,
          "sheet": "Sheet1",
          "workbook": "Gm Contact List (1).xlsx"
        }
      },
      "source_systems": [
        "gm_contact_list"
      ],
      "title": "General Manager",
      "work_phone": "(512) 426-2533"
    },
    {
      "directory_status": "active",
      "display_name": "Mary Barrett",
      "email": "",
      "first_name": "Mary",
      "last_name": "Barrett",
      "person_key": "mary-barrett",
      "person_type": "person",
      "source_metadata": {
        "gm_contact_list": {
          "column": 3,
          "resort": "K9 Fairfield",
          "row": 40,
          "sheet": "Sheet1",
          "workbook": "Gm Contact List (1).xlsx"
        }
      },
      "source_systems": [
        "gm_contact_list"
      ],
      "title": "General Manager",
      "work_phone": "(201) 906-9653"
    },
    {
      "directory_status": "active",
      "display_name": "Matthew Muckerheide",
      "email": "matthew.muckerheide@lphik9.com",
      "first_name": "Matthew",
      "last_name": "Muckerheide",
      "person_key": "matthew-muckerheide",
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
      "work_phone": "(630) 689-6288"
    },
    {
      "directory_status": "active",
      "display_name": "Mike Williams",
      "email": "mike.williams@lphik9.com",
      "first_name": "Mike",
      "last_name": "Williams",
      "person_key": "mike-williams",
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
      "work_phone": "(623) 261-3294"
    },
    {
      "directory_status": "active",
      "display_name": "Nehme Abouzeid",
      "email": "nehme.abouzeid@lphik9.com",
      "first_name": "Nehme",
      "last_name": "Abouzeid",
      "person_key": "nehme-abouzeid",
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
      "work_phone": "(702) 279-6172"
    },
    {
      "directory_status": "active",
      "display_name": "Phil Nisbet",
      "email": "phil.nisbet@lphik9.com",
      "first_name": "Phil",
      "last_name": "Nisbet",
      "person_key": "phil-nisbet",
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
      "work_phone": "(908) 433-3401"
    },
    {
      "directory_status": "active",
      "display_name": "RJ Cancilla",
      "email": "r.cancilla@lphik9.com",
      "first_name": "RJ",
      "last_name": "Cancilla",
      "person_key": "rj-cancilla",
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
      "work_phone": "(585) 967-6489"
    },
    {
      "directory_status": "active",
      "display_name": "Ruby Martinez",
      "email": "",
      "first_name": "Ruby",
      "last_name": "Martinez",
      "person_key": "ruby-martinez",
      "person_type": "person",
      "source_metadata": {
        "gm_contact_list": {
          "column": 7,
          "resort": "K9 Stamford",
          "row": 10,
          "sheet": "Sheet1",
          "workbook": "Gm Contact List (1).xlsx"
        }
      },
      "source_systems": [
        "gm_contact_list"
      ],
      "title": "General Manager",
      "work_phone": "(802) 380-9386"
    },
    {
      "directory_status": "active",
      "display_name": "Sarah Evers",
      "email": "",
      "first_name": "Sarah",
      "last_name": "Evers",
      "person_key": "sarah-evers",
      "person_type": "person",
      "source_metadata": {
        "gm_contact_list": {
          "column": 15,
          "resort": "Deerfield",
          "row": 10,
          "sheet": "Sheet1",
          "workbook": "Gm Contact List (1).xlsx"
        }
      },
      "source_systems": [
        "gm_contact_list"
      ],
      "title": "General Manager",
      "work_phone": "(708) 446-6759"
    },
    {
      "directory_status": "active",
      "display_name": "Sean Powell",
      "email": "sean.powell@lphik9.com",
      "first_name": "Sean",
      "last_name": "Powell",
      "person_key": "sean-powell",
      "person_type": "person",
      "source_metadata": {
        "gm_contact_list": {
          "column": 5,
          "resort": "K9 Greece",
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
      "work_phone": "(732) 259-2112"
    },
    {
      "directory_status": "active",
      "display_name": "Stevyn Dockery",
      "email": "stevyn.dockery@lphik9.com",
      "first_name": "Stevyn",
      "last_name": "Dockery",
      "person_key": "stevyn-dockery",
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
      "work_phone": "(747) 888-8318"
    },
    {
      "directory_status": "active",
      "display_name": "Tyler Matunis",
      "email": "",
      "first_name": "Tyler",
      "last_name": "Matunis",
      "person_key": "tyler-matunis",
      "person_type": "person",
      "source_metadata": {
        "gm_contact_list": {
          "column": 9,
          "resort": "K9 Malvern",
          "row": 10,
          "sheet": "Sheet1",
          "workbook": "Gm Contact List (1).xlsx"
        }
      },
      "source_systems": [
        "gm_contact_list"
      ],
      "title": "General Manager",
      "work_phone": "(215) 900-6895"
    },
    {
      "directory_status": "active",
      "display_name": "Zack Nisbet",
      "email": "zack.nisbet@lphik9.com",
      "first_name": "Zack",
      "last_name": "Nisbet",
      "person_key": "zack-nisbet",
      "person_type": "person",
      "source_metadata": {
        "gm_contact_list": {
          "column": 3,
          "resort": "K9 Cherry Hill",
          "row": 25,
          "sheet": "Sheet1",
          "workbook": "Gm Contact List (1).xlsx"
        },
        "hierarchy_rule": {
          "note": "Represent Zack once under Sean; attach Cherry Hill GM responsibility."
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
      "title": "Director of Resorts / General Manager, Cherry Hill",
      "work_phone": "(518) 860-5101"
    }
  ],
  "person_locations": [
    {
      "location_key": "cherry-hill",
      "person_key": "zack-nisbet",
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
      "person_key": "sarah-evers",
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
      "person_key": "johnny-meeth",
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
      "person_key": "mary-barrett",
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
      "person_key": "kevin-russell",
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
      "person_key": "elizabeth-arnold",
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
      "person_key": "sean-powell",
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
      "person_key": "kevin-russell",
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
      "person_key": "cheyenne-hamilton",
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
      "person_key": "johnny-meeth",
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
      "person_key": "kelly-peterson",
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
      "person_key": "kevin-russell",
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
      "person_key": "tyler-matunis",
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
      "person_key": "kevin-russell",
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
      "person_key": "logan-chilton",
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
      "person_key": "johnny-meeth",
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
      "person_key": "daravanh-vongsouvanh",
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
      "person_key": "johnny-meeth",
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
      "person_key": "kim-levine",
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
      "person_key": "sean-powell",
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
      "person_key": "kyle-scott",
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
      "person_key": "johnny-meeth",
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
      "person_key": "juan-francisco",
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
      "person_key": "kevin-russell",
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
      "person_key": "coby-shepard",
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
      "person_key": "johnny-meeth",
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
      "person_key": "ruby-martinez",
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
      "person_key": "kevin-russell",
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
      "person_key": "francesa-smith",
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
      "person_key": "johnny-meeth",
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
    "corporate": "/Users/zacknisbet/Downloads/LPHI Directory.xlsx",
    "resorts": "/Users/zacknisbet/Downloads/Gm Contact List (1).xlsx"
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
