-- Training Module — Materialize published_snapshot from seed data
-- Runs after training_seed_pct_csr.sql to build durable JSON snapshots
-- of each published template version's structure (sections + items).
-- This ensures training records can render even if template rows change.

DO $$
DECLARE
  v_version record;
  v_snapshot jsonb;
BEGIN
  FOR v_version IN
    SELECT tv.id AS version_id, tv.template_id, tv.source_seed_key, tv.metadata,
           t.name AS template_name, t.template_class, t.role_scopes, t.slug
    FROM training_template_versions tv
    JOIN training_templates t ON t.id = tv.template_id
    WHERE tv.is_current = true AND tv.status = 'published'
  LOOP
    -- Build sections array with nested children and items
    SELECT jsonb_build_object(
      'seed_version', 'v1',
      'template_key', v_version.source_seed_key,
      'template_name', v_version.template_name,
      'template_class', v_version.template_class::text,
      'role_scopes', to_jsonb(v_version.role_scopes),
      'sections', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'section_key', s.section_key,
            'title', s.title,
            'section_type', s.section_type::text,
            'sequence_order', s.sequence_order,
            'day_number', s.day_number,
            'time_block_start', s.time_block_start::text,
            'time_block_end', s.time_block_end::text,
            'time_block_note', s.time_block_note,
            'completion_mode', s.completion_mode::text,
            'instructions', s.instructions,
            'children', COALESCE((
              SELECT jsonb_agg(
                jsonb_build_object(
                  'section_key', cs.section_key,
                  'title', cs.title,
                  'section_type', cs.section_type::text,
                  'sequence_order', cs.sequence_order,
                  'items', COALESCE((
                    SELECT jsonb_agg(
                      jsonb_build_object(
                        'item_key', ci.item_key,
                        'label', ci.label,
                        'item_type', ci.item_type::text,
                        'sequence_order', ci.sequence_order,
                        'required', ci.required,
                        'completion_mode', ci.completion_mode::text
                      ) ORDER BY ci.sequence_order
                    )
                    FROM training_template_items ci WHERE ci.template_section_id = cs.id
                  ), '[]'::jsonb)
                ) ORDER BY cs.sequence_order
              )
              FROM training_template_sections cs
              WHERE cs.parent_section_id = s.id AND cs.template_version_id = v_version.version_id
            ), '[]'::jsonb),
            'items', COALESCE((
              SELECT jsonb_agg(
                jsonb_build_object(
                  'item_key', di.item_key,
                  'label', di.label,
                  'item_type', di.item_type::text,
                  'sequence_order', di.sequence_order,
                  'required', di.required,
                  'completion_mode', di.completion_mode::text
                ) ORDER BY di.sequence_order
              )
              FROM training_template_items di WHERE di.template_section_id = s.id
            ), '[]'::jsonb)
          ) ORDER BY s.sequence_order
        )
        FROM training_template_sections s
        WHERE s.template_version_id = v_version.version_id AND s.parent_section_id IS NULL
      ), '[]'::jsonb)
    ) INTO v_snapshot;

    UPDATE training_template_versions
    SET published_snapshot = v_snapshot
    WHERE id = v_version.version_id;
  END LOOP;
END $$;
