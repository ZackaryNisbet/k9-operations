-- Restrict Enrichment Program SOP/resource edits to enterprise admins.
--
-- Most location settings remain writable by users scoped to their location.
-- The Enrichment Program SOP is a brand-standard operating document, so this
-- key gets a stricter write gate while preserving the existing read behavior.

DROP POLICY IF EXISTS "lite_settings_insert" ON public.lite_settings;
CREATE POLICY lite_settings_insert ON public.lite_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (
      setting_key = 'enrichment_program_config_v1'
      AND public.is_lite_owner_or_enterprise()
    )
    OR (
      setting_key <> 'enrichment_program_config_v1'
      AND (
        location_id IN (SELECT public.get_my_lite_location_ids())
        OR public.is_lite_owner_or_enterprise()
      )
    )
  );

DROP POLICY IF EXISTS "lite_settings_update" ON public.lite_settings;
CREATE POLICY lite_settings_update ON public.lite_settings
  FOR UPDATE
  TO authenticated
  USING (
    (
      setting_key = 'enrichment_program_config_v1'
      AND public.is_lite_owner_or_enterprise()
    )
    OR (
      setting_key <> 'enrichment_program_config_v1'
      AND (
        location_id IN (SELECT public.get_my_lite_location_ids())
        OR public.is_lite_owner_or_enterprise()
      )
    )
  )
  WITH CHECK (
    (
      setting_key = 'enrichment_program_config_v1'
      AND public.is_lite_owner_or_enterprise()
    )
    OR (
      setting_key <> 'enrichment_program_config_v1'
      AND (
        location_id IN (SELECT public.get_my_lite_location_ids())
        OR public.is_lite_owner_or_enterprise()
      )
    )
  );
