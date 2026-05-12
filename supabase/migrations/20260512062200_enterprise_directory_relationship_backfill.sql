-- Backfills deterministic Enterprise Directory relationships after the initial directory seed.
-- Rollback path:
--   DELETE FROM public.enterprise_directory_edges WHERE source IN ('hierarchy_rule', 'gm_contact_list');
--   DELETE FROM public.enterprise_directory_person_locations WHERE source IN ('hierarchy_rule', 'gm_contact_list');

WITH person_locations_input(person_key, location_key, responsibility_type, title, source, source_metadata) AS (
  VALUES
    ('zack-nisbet', 'cherry-hill', 'general_manager', 'General Manager', 'gm_contact_list', '{"column": 3, "row": 25}'::jsonb),
    ('sarah-evers', 'deerfield', 'general_manager', 'General Manager', 'gm_contact_list', '{"column": 15, "row": 10}'::jsonb),
    ('johnny-meeth', 'deerfield', 'regional_manager', 'Regional Manager', 'gm_contact_list', '{"column": 15, "row": 13}'::jsonb),
    ('mary-barrett', 'fairfield', 'general_manager', 'General Manager', 'gm_contact_list', '{"column": 3, "row": 40}'::jsonb),
    ('kevin-russell', 'fairfield', 'regional_manager', 'Regional Manager', 'gm_contact_list', '{"column": 3, "row": 43}'::jsonb),
    ('elizabeth-arnold', 'greece', 'general_manager', 'General Manager', 'gm_contact_list', '{"column": 5, "row": 25}'::jsonb),
    ('sean-powell', 'greece', 'regional_manager', 'Regional Manager', 'gm_contact_list', '{"column": 5, "row": 28}'::jsonb),
    ('kevin-russell', 'hamilton', 'regional_manager', 'Regional Manager', 'gm_contact_list', '{"column": 3, "row": 13}'::jsonb),
    ('cheyenne-hamilton', 'hindry-1001', 'general_manager', 'General Manager', 'gm_contact_list', '{"column": 19, "row": 10}'::jsonb),
    ('johnny-meeth', 'hindry-1001', 'regional_manager', 'Regional Manager', 'gm_contact_list', '{"column": 19, "row": 13}'::jsonb),
    ('kelly-peterson', 'madison', 'general_manager', 'General Manager', 'gm_contact_list', '{"column": 3, "row": 55}'::jsonb),
    ('kevin-russell', 'madison', 'regional_manager', 'Regional Manager', 'gm_contact_list', '{"column": 3, "row": 58}'::jsonb),
    ('tyler-matunis', 'malvern', 'general_manager', 'General Manager', 'gm_contact_list', '{"column": 9, "row": 10}'::jsonb),
    ('kevin-russell', 'malvern', 'regional_manager', 'Regional Manager', 'gm_contact_list', '{"column": 9, "row": 13}'::jsonb),
    ('logan-chilton', 'north-olmsted', 'general_manager', 'General Manager', 'gm_contact_list', '{"column": 11, "row": 10}'::jsonb),
    ('johnny-meeth', 'north-olmsted', 'regional_manager', 'Regional Manager', 'gm_contact_list', '{"column": 11, "row": 13}'::jsonb),
    ('daravanh-vongsouvanh', 'oviedo-4004', 'general_manager', 'General Manager', 'gm_contact_list', '{"column": 13, "row": 40}'::jsonb),
    ('johnny-meeth', 'oviedo-4004', 'regional_manager', 'Regional Manager', 'gm_contact_list', '{"column": 13, "row": 43}'::jsonb),
    ('kim-levine', 'penfield', 'general_manager', 'General Manager', 'gm_contact_list', '{"column": 5, "row": 10}'::jsonb),
    ('sean-powell', 'penfield', 'regional_manager', 'Regional Manager', 'gm_contact_list', '{"column": 5, "row": 13}'::jsonb),
    ('kyle-scott', 'pompano-beach-4002', 'general_manager', 'General Manager', 'gm_contact_list', '{"column": 13, "row": 25}'::jsonb),
    ('johnny-meeth', 'pompano-beach-4002', 'regional_manager', 'Regional Manager', 'gm_contact_list', '{"column": 13, "row": 28}'::jsonb),
    ('juan-francisco', 'roxbury', 'general_manager', 'General Manager', 'gm_contact_list', '{"column": 3, "row": 70}'::jsonb),
    ('kevin-russell', 'roxbury', 'regional_manager', 'Regional Manager', 'gm_contact_list', '{"column": 3, "row": 73}'::jsonb),
    ('coby-shepard', 'scottsdale-5001', 'general_manager', 'General Manager', 'gm_contact_list', '{"column": 17, "row": 10}'::jsonb),
    ('johnny-meeth', 'scottsdale-5001', 'regional_manager', 'Regional Manager', 'gm_contact_list', '{"column": 17, "row": 13}'::jsonb),
    ('ruby-martinez', 'stamford', 'general_manager', 'General Manager', 'gm_contact_list', '{"column": 7, "row": 10}'::jsonb),
    ('kevin-russell', 'stamford', 'regional_manager', 'Regional Manager', 'gm_contact_list', '{"column": 7, "row": 13}'::jsonb),
    ('francesa-smith', 'wellington-4001', 'general_manager', 'General Manager', 'gm_contact_list', '{"column": 13, "row": 10}'::jsonb),
    ('johnny-meeth', 'wellington-4001', 'regional_manager', 'Regional Manager', 'gm_contact_list', '{"column": 13, "row": 13}'::jsonb)
),
delete_relationships AS (
  DELETE FROM public.enterprise_directory_person_locations WHERE source IN ('hierarchy_rule', 'gm_contact_list')
)
INSERT INTO public.enterprise_directory_person_locations (person_id, location_id, responsibility_type, title, source, source_metadata)
SELECT p.id, l.id, pli.responsibility_type, NULLIF(pli.title, ''), pli.source, pli.source_metadata
FROM person_locations_input pli
JOIN public.enterprise_directory_people p ON p.person_key = pli.person_key
JOIN public.enterprise_directory_locations l ON l.location_key = pli.location_key
ON CONFLICT (person_id, location_id, responsibility_type) DO UPDATE SET
  title = EXCLUDED.title,
  source = EXCLUDED.source,
  source_metadata = EXCLUDED.source_metadata,
  updated_at = now();

WITH edges_input(parent_key, child_key, relationship_type, is_primary, source, source_metadata) AS (
  VALUES
    ('alan-leibman', 'lia-moncholi', 'reports_to', true, 'hierarchy_rule', '{"note": "Lia reports to both Co-CEOs; Alan is primary for table edge ordering."}'::jsonb),
    ('johnny-meeth', 'cheyenne-hamilton', 'reports_to', true, 'gm_contact_list', '{}'::jsonb),
    ('johnny-meeth', 'coby-shepard', 'reports_to', true, 'gm_contact_list', '{}'::jsonb),
    ('johnny-meeth', 'daravanh-vongsouvanh', 'reports_to', true, 'gm_contact_list', '{}'::jsonb),
    ('johnny-meeth', 'francesa-smith', 'reports_to', true, 'gm_contact_list', '{}'::jsonb),
    ('johnny-meeth', 'kyle-scott', 'reports_to', true, 'gm_contact_list', '{}'::jsonb),
    ('johnny-meeth', 'logan-chilton', 'reports_to', true, 'gm_contact_list', '{}'::jsonb),
    ('johnny-meeth', 'sarah-evers', 'reports_to', true, 'gm_contact_list', '{}'::jsonb),
    ('kevin-russell', 'juan-francisco', 'reports_to', true, 'gm_contact_list', '{}'::jsonb),
    ('kevin-russell', 'kelly-peterson', 'reports_to', true, 'gm_contact_list', '{}'::jsonb),
    ('kevin-russell', 'mary-barrett', 'reports_to', true, 'gm_contact_list', '{}'::jsonb),
    ('kevin-russell', 'ruby-martinez', 'reports_to', true, 'gm_contact_list', '{}'::jsonb),
    ('kevin-russell', 'tyler-matunis', 'reports_to', true, 'gm_contact_list', '{}'::jsonb),
    ('lia-moncholi', 'sean-powell', 'reports_to', true, 'hierarchy_rule', '{}'::jsonb),
    ('phil-nisbet', 'lia-moncholi', 'reports_to', false, 'hierarchy_rule', '{"note": "Lia reports to both Co-CEOs."}'::jsonb),
    ('sean-powell', 'elizabeth-arnold', 'reports_to', true, 'gm_contact_list', '{"note": "No separate regional manager listed."}'::jsonb),
    ('sean-powell', 'johnny-meeth', 'reports_to', true, 'hierarchy_rule', '{}'::jsonb),
    ('sean-powell', 'kevin-russell', 'reports_to', true, 'hierarchy_rule', '{}'::jsonb),
    ('sean-powell', 'kim-levine', 'reports_to', true, 'gm_contact_list', '{"note": "No separate regional manager listed."}'::jsonb),
    ('sean-powell', 'stevyn-dockery', 'reports_to', true, 'hierarchy_rule', '{}'::jsonb),
    ('sean-powell', 'zack-nisbet', 'reports_to', true, 'hierarchy_rule', '{"note": "Zack is Director of Resorts and GM for Cherry Hill; represented once."}'::jsonb)
),
delete_edges AS (
  DELETE FROM public.enterprise_directory_edges WHERE source IN ('hierarchy_rule', 'gm_contact_list')
)
INSERT INTO public.enterprise_directory_edges (parent_person_id, child_person_id, relationship_type, is_primary, source, source_metadata)
SELECT parent.id, child.id, ei.relationship_type, ei.is_primary, ei.source, ei.source_metadata
FROM edges_input ei
JOIN public.enterprise_directory_people parent ON parent.person_key = ei.parent_key
JOIN public.enterprise_directory_people child ON child.person_key = ei.child_key
WHERE parent.id <> child.id
ON CONFLICT (parent_person_id, child_person_id, relationship_type) DO UPDATE SET
  is_primary = EXCLUDED.is_primary,
  source = EXCLUDED.source,
  source_metadata = EXCLUDED.source_metadata,
  updated_at = now();

SELECT
  (SELECT count(*) FROM public.enterprise_directory_person_locations) AS directory_person_locations,
  (SELECT count(*) FROM public.enterprise_directory_edges) AS directory_edges;
