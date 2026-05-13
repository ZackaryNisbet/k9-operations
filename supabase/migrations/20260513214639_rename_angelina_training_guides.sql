-- Rename the readiness templates to credit the source training guide owner while
-- preserving the stable slugs clients and RPCs use.
WITH renamed_templates AS (
  UPDATE public.training_templates template
  SET
    name = CASE template.slug
      WHEN 'pct_team_readiness_board' THEN 'Angelina''s PCT Training Guide v1'
      WHEN 'csr_team_readiness_board' THEN 'Angelina''s CSR Training Guide v1'
      ELSE template.name
    END,
    updated_at = now()
  WHERE template.slug IN ('pct_team_readiness_board', 'csr_team_readiness_board')
  RETURNING template.id, template.slug, template.name
),
renamed_records AS (
  UPDATE public.training_records record
  SET template_name_snapshot = renamed_templates.name
  FROM renamed_templates
  WHERE record.template_id = renamed_templates.id
  RETURNING record.id
)
UPDATE public.training_template_versions version
SET published_snapshot = jsonb_set(
  version.published_snapshot,
  '{template,name}',
  to_jsonb(renamed_templates.name),
  true
)
FROM renamed_templates
WHERE version.template_id = renamed_templates.id;
