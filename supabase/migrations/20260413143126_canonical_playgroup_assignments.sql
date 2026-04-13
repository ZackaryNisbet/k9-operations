-- ============================================================================
-- Canonical Playgroup Assignments
-- Normalizes Gingr Play icons into:
--   1. v_dog_playgroups                   - compatibility row-per-tag view
--   2. v_dog_playgroup_assignments_current - canonical one-row-per-dog view
-- ============================================================================

ALTER TABLE gingr_animal_icons_live ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read gingr_animal_icons_live" ON gingr_animal_icons_live;
DROP POLICY IF EXISTS gingr_animal_icons_live_select ON gingr_animal_icons_live;

CREATE POLICY gingr_animal_icons_live_select
  ON gingr_animal_icons_live
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM lite_profiles
      WHERE user_id = auth.uid()
        AND is_active = true
        AND (
          role = 'enterprise_admin'
          OR location_id = gingr_animal_icons_live.location_id
        )
    )
    OR EXISTS (
      SELECT 1
      FROM profiles
      WHERE id = auth.uid()
        AND role IN ('owner', 'role_owner')
    )
  );

DROP VIEW IF EXISTS v_dog_playgroup_assignments_current;
DROP VIEW IF EXISTS v_dog_playgroup_icon_tags;

CREATE VIEW v_dog_playgroup_icon_tags
WITH (security_invoker = true) AS
SELECT DISTINCT
  location_id,
  animal_gingr_id,
  CASE
    WHEN lower(icon_title) = 'private play' THEN 'private_play'
    WHEN lower(icon_title) = 'large dog playgroup' THEN 'large'
    WHEN lower(icon_title) = 'small dog playgroup' THEN 'small'
    WHEN lower(icon_title) = 'evaluation' THEN 'evaluation'
    ELSE NULL
  END AS playgroup,
  icon_title,
  icon_color,
  icon_template_id,
  icon_comment
FROM gingr_animal_icons_live
WHERE icon_group = 'Play'
  AND lower(icon_title) IN ('private play', 'large dog playgroup', 'small dog playgroup', 'evaluation');

CREATE VIEW v_dog_playgroup_assignments_current
WITH (security_invoker = true) AS
WITH tag_rollup AS (
  SELECT
    location_id,
    animal_gingr_id,
    bool_or(playgroup = 'private_play') AS has_private_play,
    bool_or(playgroup = 'evaluation') AS has_evaluation,
    bool_or(playgroup = 'large') AS has_large,
    bool_or(playgroup = 'small') AS has_small,
    coalesce(array_agg(DISTINCT playgroup ORDER BY playgroup), ARRAY[]::text[]) AS playgroup_tags,
    coalesce(
      array_agg(DISTINCT nullif(btrim(icon_title), '') ORDER BY nullif(btrim(icon_title), ''))
        FILTER (WHERE nullif(btrim(icon_title), '') IS NOT NULL),
      ARRAY[]::text[]
    ) AS source_icon_titles,
    coalesce(
      array_agg(DISTINCT nullif(btrim(icon_comment), '') ORDER BY nullif(btrim(icon_comment), ''))
        FILTER (WHERE nullif(btrim(icon_comment), '') IS NOT NULL),
      ARRAY[]::text[]
    ) AS source_icon_comments,
    max(nullif(btrim(icon_comment), '')) FILTER (WHERE playgroup = 'private_play') AS private_play_comment
  FROM v_dog_playgroup_icon_tags
  GROUP BY location_id, animal_gingr_id
)
SELECT
  location_id,
  animal_gingr_id,
  CASE
    WHEN has_large AND NOT has_small THEN 'large'
    WHEN has_small AND NOT has_large THEN 'small'
    ELSE NULL
  END AS size_group,
  has_private_play,
  has_evaluation,
  (
    has_private_play
    AND (
      (has_large AND NOT has_small)
      OR (has_small AND NOT has_large)
    )
  ) AS is_half_and_half,
  CASE
    WHEN has_private_play AND (
      (has_large AND NOT has_small)
      OR (has_small AND NOT has_large)
    ) THEN 'half_and_half'
    WHEN has_private_play THEN 'private_play'
    WHEN has_large AND NOT has_small THEN 'large'
    WHEN has_small AND NOT has_large THEN 'small'
    WHEN has_evaluation THEN 'evaluation'
    ELSE NULL
  END AS primary_display_playgroup,
  CASE
    WHEN has_private_play THEN 'private_play'
    WHEN has_large AND NOT has_small THEN 'large'
    WHEN has_small AND NOT has_large THEN 'small'
    ELSE NULL
  END AS scheduling_playgroup,
  playgroup_tags,
  source_icon_titles,
  source_icon_comments,
  CASE
    WHEN has_private_play AND (
      (has_large AND NOT has_small)
      OR (has_small AND NOT has_large)
    ) THEN private_play_comment
    ELSE NULL
  END AS half_and_half_note,
  CASE
    WHEN has_large AND has_small THEN 'conflicting_size_icons'
    WHEN NOT has_private_play AND NOT has_large AND NOT has_small AND has_evaluation THEN 'evaluation_only'
    WHEN NOT has_private_play AND NOT has_large AND NOT has_small THEN 'no_actionable_icon'
    ELSE NULL
  END AS unresolved_reason
FROM tag_rollup;

CREATE OR REPLACE VIEW v_dog_playgroups
WITH (security_invoker = true) AS
SELECT
  location_id,
  animal_gingr_id,
  playgroup,
  icon_title,
  icon_color,
  icon_template_id,
  icon_comment
FROM v_dog_playgroup_icon_tags;

GRANT SELECT ON v_dog_playgroup_icon_tags TO authenticated, service_role;
GRANT SELECT ON v_dog_playgroup_assignments_current TO authenticated, service_role;
GRANT SELECT ON v_dog_playgroups TO authenticated, service_role;
