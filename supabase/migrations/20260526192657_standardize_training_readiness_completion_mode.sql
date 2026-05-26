-- Standardize training template completion modes on the readiness board vocabulary:
-- Not Started, Demonstrated, Verified / Qualified, Needs Coaching, Blocked, Waived.
UPDATE public.training_template_items item
SET completion_mode = 'observe_participate_demonstrate'::public.training_completion_mode
FROM public.training_template_versions version
JOIN public.training_templates template ON template.id = version.template_id
WHERE item.template_version_id = version.id
  AND item.completion_mode IS DISTINCT FROM 'observe_participate_demonstrate'::public.training_completion_mode;

UPDATE public.training_template_sections section
SET completion_mode = 'observe_participate_demonstrate'::public.training_completion_mode
FROM public.training_template_versions version
JOIN public.training_templates template ON template.id = version.template_id
WHERE section.template_version_id = version.id
  AND section.completion_mode IS DISTINCT FROM 'observe_participate_demonstrate'::public.training_completion_mode;
