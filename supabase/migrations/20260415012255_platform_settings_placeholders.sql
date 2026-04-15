BEGIN;

-- ============================================================================
-- Platform settings slice for finish-plan backend support
-- - typed helpers over lite_settings for inventory cadence / incident routing
-- - lightweight placeholding tables for grassroots, resources, and Ginger notes
-- - intentionally no provider secret wiring
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_platform_settings_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_lite_setting_jsonb(
  p_location_id text,
  p_setting_key text,
  p_default jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE((
    SELECT ls.setting_value
    FROM public.lite_settings ls
    WHERE ls.location_id = p_location_id
      AND ls.setting_key = p_setting_key
    ORDER BY ls.updated_at DESC, ls.created_at DESC
    LIMIT 1
  ), p_default);
$$;

CREATE OR REPLACE FUNCTION public.get_resort_operational_settings(p_location_id text)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'inventory_cadence_config',
      public.get_lite_setting_jsonb(
        p_location_id,
        'inventory_cadence_config',
        jsonb_build_object(
          'enabled', false,
          'cadence', 'weekly',
          'day_of_week', NULL,
          'time_of_day', NULL
        )
      ),
    'incident_notification_config',
      public.get_lite_setting_jsonb(
        p_location_id,
        'incident_notification_config',
        jsonb_build_object(
          'recipient_user_ids', '[]'::jsonb,
          'recipient_roles', '[]'::jsonb,
          'include_inactive', false
        )
      ),
    'sms_otp_provider_config',
      public.get_lite_setting_jsonb(
        p_location_id,
        'sms_otp_provider_config',
        jsonb_build_object(
          'preferred', 'twilio_verify',
          'fallback', 'twilio_sms'
        )
      ),
    'transactional_email_provider_config',
      public.get_lite_setting_jsonb(
        p_location_id,
        'transactional_email_provider_config',
        jsonb_build_object(
          'preferred', 'resend',
          'fallback', NULL
        )
      )
  );
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- Grassroots tracking: minimal event ledger used by the Home briefing widget.
-- Existing UI already reads grassroots_events in HomePage.jsx.
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.grassroots_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id text NOT NULL,
  event_date date NOT NULL,
  title text NOT NULL,
  event_type text NOT NULL DEFAULT 'event',
  description text,
  venue_name text,
  external_url text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid,
  created_by_name text,
  updated_by_user_id uuid,
  updated_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS grassroots_events_location_date_idx
  ON public.grassroots_events (location_id, event_date DESC, created_at DESC);

ALTER TABLE public.grassroots_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS grassroots_events_read ON public.grassroots_events;
CREATE POLICY grassroots_events_read ON public.grassroots_events
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS grassroots_events_write ON public.grassroots_events;
CREATE POLICY grassroots_events_write ON public.grassroots_events
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS grassroots_events_service ON public.grassroots_events;
CREATE POLICY grassroots_events_service ON public.grassroots_events
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.grassroots_events TO authenticated;

DROP TRIGGER IF EXISTS trg_grassroots_events_updated_at ON public.grassroots_events;
CREATE TRIGGER trg_grassroots_events_updated_at
  BEFORE UPDATE ON public.grassroots_events
  FOR EACH ROW EXECUTE FUNCTION public.update_platform_settings_updated_at();

-- ────────────────────────────────────────────────────────────────────────────
-- Resource library: links and files that can be surfaced by future web UI.
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.resource_library_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id text NOT NULL,
  title text NOT NULL,
  resource_kind text NOT NULL DEFAULT 'link' CHECK (resource_kind IN ('link', 'file', 'document')),
  url text,
  file_path text,
  mime_type text,
  description text,
  category text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid,
  created_by_name text,
  updated_by_user_id uuid,
  updated_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT resource_library_items_location_url_or_file CHECK (url IS NOT NULL OR file_path IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS resource_library_items_location_idx
  ON public.resource_library_items (location_id, is_active, sort_order, created_at DESC);

ALTER TABLE public.resource_library_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS resource_library_items_read ON public.resource_library_items;
CREATE POLICY resource_library_items_read ON public.resource_library_items
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS resource_library_items_write ON public.resource_library_items;
CREATE POLICY resource_library_items_write ON public.resource_library_items
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS resource_library_items_service ON public.resource_library_items;
CREATE POLICY resource_library_items_service ON public.resource_library_items
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.resource_library_items TO authenticated;

DROP TRIGGER IF EXISTS trg_resource_library_items_updated_at ON public.resource_library_items;
CREATE TRIGGER trg_resource_library_items_updated_at
  BEFORE UPDATE ON public.resource_library_items
  FOR EACH ROW EXECUTE FUNCTION public.update_platform_settings_updated_at();

-- ────────────────────────────────────────────────────────────────────────────
-- Ginger note placeholders: near-real-time sync target for Today's Ginger Notes.
-- Keep the contract thin so consumers can render without crashing if empty.
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.gingr_todays_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id text NOT NULL,
  note_source text NOT NULL CHECK (note_source IN ('owner_note', 'dog_note', 'reservation_note', 'general_note')),
  subject_kind text NOT NULL CHECK (subject_kind IN ('owner', 'dog', 'reservation', 'unknown')),
  subject_gingr_id text,
  subject_name text,
  note_date timestamptz NOT NULL DEFAULT now(),
  note_text text NOT NULL,
  note_title text,
  source_url text,
  raw_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gingr_todays_notes_location_idx
  ON public.gingr_todays_notes (location_id, note_date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS gingr_todays_notes_subject_idx
  ON public.gingr_todays_notes (location_id, subject_kind, subject_gingr_id);

ALTER TABLE public.gingr_todays_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gingr_todays_notes_read ON public.gingr_todays_notes;
CREATE POLICY gingr_todays_notes_read ON public.gingr_todays_notes
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS gingr_todays_notes_write ON public.gingr_todays_notes;
CREATE POLICY gingr_todays_notes_write ON public.gingr_todays_notes
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS gingr_todays_notes_service ON public.gingr_todays_notes;
CREATE POLICY gingr_todays_notes_service ON public.gingr_todays_notes
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gingr_todays_notes TO authenticated;

DROP TRIGGER IF EXISTS trg_gingr_todays_notes_updated_at ON public.gingr_todays_notes;
CREATE TRIGGER trg_gingr_todays_notes_updated_at
  BEFORE UPDATE ON public.gingr_todays_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_platform_settings_updated_at();

CREATE OR REPLACE VIEW public.todays_ginger_notes
WITH (security_invoker = true)
AS
SELECT *
FROM public.gingr_todays_notes
WHERE note_date::date = CURRENT_DATE;

GRANT SELECT ON public.todays_ginger_notes TO authenticated;

COMMIT;
