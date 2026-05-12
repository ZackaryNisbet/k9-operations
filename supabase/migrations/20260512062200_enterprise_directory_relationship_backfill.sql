-- Backfills deterministic Enterprise Directory relationships after the initial directory seed.
-- Rollback path:
--   DELETE FROM public.enterprise_directory_edges WHERE source IN ('hierarchy_rule', 'gm_contact_list');
--   DELETE FROM public.enterprise_directory_person_locations WHERE source IN ('hierarchy_rule', 'gm_contact_list');

WITH person_locations_input(person_key, location_key, responsibility_type, title, source, source_metadata) AS (
  VALUES
    ('aubrey-nolan-28', 'cherry-hill', 'general_manager', 'General Manager', 'gm_contact_list', '{"column": 3, "row": 25}'::jsonb),
    ('devon-calloway-24', 'deerfield', 'general_manager', 'General Manager', 'gm_contact_list', '{"column": 15, "row": 10}'::jsonb),
    ('ellis-bennett-8', 'deerfield', 'regional_manager', 'Regional Manager', 'gm_contact_list', '{"column": 15, "row": 13}'::jsonb),
    ('marlowe-howell-17', 'fairfield', 'general_manager', 'General Manager', 'gm_contact_list', '{"column": 3, "row": 40}'::jsonb),
    ('cameron-marsh-11', 'fairfield', 'regional_manager', 'Regional Manager', 'gm_contact_list', '{"column": 3, "row": 43}'::jsonb),
    ('sawyer-maddox-5', 'greece', 'general_manager', 'General Manager', 'gm_contact_list', '{"column": 5, "row": 25}'::jsonb),
    ('rowan-beckett-25', 'greece', 'regional_manager', 'Regional Manager', 'gm_contact_list', '{"column": 5, "row": 28}'::jsonb),
    ('cameron-marsh-11', 'hamilton', 'regional_manager', 'Regional Manager', 'gm_contact_list', '{"column": 3, "row": 13}'::jsonb),
    ('cameron-beckett-2', 'hindry-1001', 'general_manager', 'General Manager', 'gm_contact_list', '{"column": 19, "row": 10}'::jsonb),
    ('ellis-bennett-8', 'hindry-1001', 'regional_manager', 'Regional Manager', 'gm_contact_list', '{"column": 19, "row": 13}'::jsonb),
    ('jordan-foster-10', 'madison', 'general_manager', 'General Manager', 'gm_contact_list', '{"column": 3, "row": 55}'::jsonb),
    ('cameron-marsh-11', 'madison', 'regional_manager', 'Regional Manager', 'gm_contact_list', '{"column": 3, "row": 58}'::jsonb),
    ('emerson-maddox-27', 'malvern', 'general_manager', 'General Manager', 'gm_contact_list', '{"column": 9, "row": 10}'::jsonb),
    ('cameron-marsh-11', 'malvern', 'regional_manager', 'Regional Manager', 'gm_contact_list', '{"column": 9, "row": 13}'::jsonb),
    ('aubrey-rhodes-16', 'north-olmsted', 'general_manager', 'General Manager', 'gm_contact_list', '{"column": 11, "row": 10}'::jsonb),
    ('ellis-bennett-8', 'north-olmsted', 'regional_manager', 'Regional Manager', 'gm_contact_list', '{"column": 11, "row": 13}'::jsonb),
    ('hayden-sterling-4', 'oviedo-4004', 'general_manager', 'General Manager', 'gm_contact_list', '{"column": 13, "row": 40}'::jsonb),
    ('ellis-bennett-8', 'oviedo-4004', 'regional_manager', 'Regional Manager', 'gm_contact_list', '{"column": 13, "row": 43}'::jsonb),
    ('aubrey-forsythe-12', 'penfield', 'general_manager', 'General Manager', 'gm_contact_list', '{"column": 5, "row": 10}'::jsonb),
    ('rowan-beckett-25', 'penfield', 'regional_manager', 'Regional Manager', 'gm_contact_list', '{"column": 5, "row": 13}'::jsonb),
    ('casey-beckett-13', 'pompano-beach-4002', 'general_manager', 'General Manager', 'gm_contact_list', '{"column": 13, "row": 25}'::jsonb),
    ('ellis-bennett-8', 'pompano-beach-4002', 'regional_manager', 'Regional Manager', 'gm_contact_list', '{"column": 13, "row": 28}'::jsonb),
    ('avery-reed-9', 'roxbury', 'general_manager', 'General Manager', 'gm_contact_list', '{"column": 3, "row": 70}'::jsonb),
    ('cameron-marsh-11', 'roxbury', 'regional_manager', 'Regional Manager', 'gm_contact_list', '{"column": 3, "row": 73}'::jsonb),
    ('casey-brooks-3', 'scottsdale-5001', 'general_manager', 'General Manager', 'gm_contact_list', '{"column": 17, "row": 10}'::jsonb),
    ('ellis-bennett-8', 'scottsdale-5001', 'regional_manager', 'Regional Manager', 'gm_contact_list', '{"column": 17, "row": 13}'::jsonb),
    ('blake-bennett-23', 'stamford', 'general_manager', 'General Manager', 'gm_contact_list', '{"column": 7, "row": 10}'::jsonb),
    ('cameron-marsh-11', 'stamford', 'regional_manager', 'Regional Manager', 'gm_contact_list', '{"column": 7, "row": 13}'::jsonb),
    ('devon-ellison-6', 'wellington-4001', 'general_manager', 'General Manager', 'gm_contact_list', '{"column": 13, "row": 10}'::jsonb),
    ('ellis-bennett-8', 'wellington-4001', 'regional_manager', 'Regional Manager', 'gm_contact_list', '{"column": 13, "row": 13}'::jsonb)
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
    ('logan-hale-1', 'cameron-rhodes-15', 'reports_to', true, 'hierarchy_rule', '{"note": ""}'::jsonb),
    ('ellis-bennett-8', 'cameron-beckett-2', 'reports_to', true, 'gm_contact_list', '{}'::jsonb),
    ('ellis-bennett-8', 'casey-brooks-3', 'reports_to', true, 'gm_contact_list', '{}'::jsonb),
    ('ellis-bennett-8', 'hayden-sterling-4', 'reports_to', true, 'gm_contact_list', '{}'::jsonb),
    ('ellis-bennett-8', 'devon-ellison-6', 'reports_to', true, 'gm_contact_list', '{}'::jsonb),
    ('ellis-bennett-8', 'casey-beckett-13', 'reports_to', true, 'gm_contact_list', '{}'::jsonb),
    ('ellis-bennett-8', 'aubrey-rhodes-16', 'reports_to', true, 'gm_contact_list', '{}'::jsonb),
    ('ellis-bennett-8', 'devon-calloway-24', 'reports_to', true, 'gm_contact_list', '{}'::jsonb),
    ('cameron-marsh-11', 'avery-reed-9', 'reports_to', true, 'gm_contact_list', '{}'::jsonb),
    ('cameron-marsh-11', 'jordan-foster-10', 'reports_to', true, 'gm_contact_list', '{}'::jsonb),
    ('cameron-marsh-11', 'marlowe-howell-17', 'reports_to', true, 'gm_contact_list', '{}'::jsonb),
    ('cameron-marsh-11', 'blake-bennett-23', 'reports_to', true, 'gm_contact_list', '{}'::jsonb),
    ('cameron-marsh-11', 'emerson-maddox-27', 'reports_to', true, 'gm_contact_list', '{}'::jsonb),
    ('cameron-rhodes-15', 'rowan-beckett-25', 'reports_to', true, 'hierarchy_rule', '{}'::jsonb),
    ('finley-prescott-21', 'cameron-rhodes-15', 'reports_to', false, 'hierarchy_rule', '{"note": ""}'::jsonb),
    ('rowan-beckett-25', 'sawyer-maddox-5', 'reports_to', true, 'gm_contact_list', '{"note": ""}'::jsonb),
    ('rowan-beckett-25', 'ellis-bennett-8', 'reports_to', true, 'hierarchy_rule', '{}'::jsonb),
    ('rowan-beckett-25', 'cameron-marsh-11', 'reports_to', true, 'hierarchy_rule', '{}'::jsonb),
    ('rowan-beckett-25', 'aubrey-forsythe-12', 'reports_to', true, 'gm_contact_list', '{"note": ""}'::jsonb),
    ('rowan-beckett-25', 'avery-bennett-26', 'reports_to', true, 'hierarchy_rule', '{}'::jsonb),
    ('rowan-beckett-25', 'aubrey-nolan-28', 'reports_to', true, 'hierarchy_rule', '{"note": ""}'::jsonb)
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
