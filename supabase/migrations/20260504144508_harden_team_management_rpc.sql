-- Keep privileged Team Management RPC implementation out of the exposed public
-- schema. Public functions remain as thin authenticated wrappers for clients.

CREATE SCHEMA IF NOT EXISTS app_private;

REVOKE ALL ON SCHEMA app_private FROM PUBLIC;
GRANT USAGE ON SCHEMA app_private TO authenticated;

ALTER FUNCTION public.record_lite_app_activity(TEXT) SET SCHEMA app_private;
ALTER FUNCTION public.complete_lite_password_setup() SET SCHEMA app_private;
ALTER FUNCTION public.reset_lite_team_member_password(UUID, BOOLEAN) SET SCHEMA app_private;

REVOKE ALL ON FUNCTION app_private.record_lite_app_activity(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.complete_lite_password_setup() FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.reset_lite_team_member_password(UUID, BOOLEAN) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION app_private.record_lite_app_activity(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.complete_lite_password_setup() TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.reset_lite_team_member_password(UUID, BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_lite_app_activity(p_surface TEXT DEFAULT 'web')
RETURNS JSONB
LANGUAGE SQL
SECURITY INVOKER
SET search_path = app_private, public
AS $$
  SELECT app_private.record_lite_app_activity(p_surface);
$$;

CREATE OR REPLACE FUNCTION public.complete_lite_password_setup()
RETURNS JSONB
LANGUAGE SQL
SECURITY INVOKER
SET search_path = app_private, public
AS $$
  SELECT app_private.complete_lite_password_setup();
$$;

CREATE OR REPLACE FUNCTION public.reset_lite_team_member_password(
  p_profile_id UUID,
  p_send_email BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE SQL
SECURITY INVOKER
SET search_path = app_private, public
AS $$
  SELECT app_private.reset_lite_team_member_password(p_profile_id, p_send_email);
$$;

REVOKE ALL ON FUNCTION public.record_lite_app_activity(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_lite_password_setup() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reset_lite_team_member_password(UUID, BOOLEAN) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.record_lite_app_activity(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_lite_password_setup() TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_lite_team_member_password(UUID, BOOLEAN) TO authenticated;
