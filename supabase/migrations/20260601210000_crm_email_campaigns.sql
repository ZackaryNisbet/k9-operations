-- CRM Email Campaigns — send branded email blasts to website booking-form leads
-- (ignite_leads) from inside K9 Operations. The Stripo plugin composes the email;
-- Resend delivers it; this schema is the system of record for templates, campaigns,
-- per-recipient send state, provider events, the suppression list, and the audit feed.
--
--   email_templates       reusable Stripo designs ({html,css} + compiled HTML)
--   email_campaigns       one blast: subject, sender, audience filter, counters, status
--   email_recipients      per-lead send log (snapshot email/name + delivery state)
--   email_events          raw Resend webhook events (delivered/opened/clicked/bounced/…)
--   email_suppression     do-not-email list (unsubscribe / bounce / complaint / manual)
--   email_campaign_history change log powering the History subtab
--
-- Location-scoped + RLS, mirroring the marketing directory: read = labor_has_location_access,
-- write = labor_has_management_access. Recipient/event/suppression writes go through
-- SECURITY DEFINER RPCs (or the service-role edge functions) so the send pipeline and the
-- public unsubscribe endpoint can record state without widening client RLS.
BEGIN;

-- ─── Reusable email designs ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Untitled template',
  subject text NOT NULL DEFAULT '',
  preheader text,
  design jsonb NOT NULL DEFAULT '{}'::jsonb,        -- Stripo getTemplateData(): { html, css }
  compiled_html text,                               -- Stripo compileEmail(): inlined, send-ready
  thumbnail_url text,
  created_by_user_id uuid,
  created_by_name text,
  updated_by_user_id uuid,
  updated_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ─── Campaigns (one blast) ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.email_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Untitled campaign',   -- internal label
  subject text NOT NULL DEFAULT '',
  preheader text,
  from_name text NOT NULL DEFAULT 'K9 Resorts',
  from_email text NOT NULL DEFAULT 'marketing@k9operations.com',
  reply_to text,
  template_id uuid REFERENCES public.email_templates(id) ON DELETE SET NULL,
  design jsonb NOT NULL DEFAULT '{}'::jsonb,         -- editable Stripo design snapshot
  compiled_html text,                                -- send-ready HTML snapshot
  -- Audience: which booking-form leads (mirrors the CRM page's own filtering, resolved
  -- client-side from ignite_leads; stored here for the record + re-resolution).
  audience jsonb NOT NULL DEFAULT '{}'::jsonb,       -- { statuses:[], categories:[], include_employment }
  audience_summary text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'failed', 'canceled')),
  scheduled_at timestamptz,
  send_started_at timestamptz,
  send_completed_at timestamptz,
  -- Counters (maintained by the send edge function + crm_email_ingest_event).
  total_recipients integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  delivered_count integer NOT NULL DEFAULT 0,
  opened_count integer NOT NULL DEFAULT 0,
  clicked_count integer NOT NULL DEFAULT 0,
  bounced_count integer NOT NULL DEFAULT 0,
  complained_count integer NOT NULL DEFAULT 0,
  unsubscribed_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  created_by_user_id uuid,
  created_by_name text,
  updated_by_user_id uuid,
  updated_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ─── Per-recipient send log ─────────────────────────────────────────────────
-- lead_id is a soft reference (text) so the send record survives if the lead is later
-- deleted; the email/name/merge fields are snapshotted at build time.
CREATE TABLE IF NOT EXISTS public.email_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.email_campaigns(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  lead_id text,
  email text NOT NULL,
  first_name text,
  last_name text,
  merge_data jsonb NOT NULL DEFAULT '{}'::jsonb,     -- snapshot for {{first_name}} etc.
  unsubscribe_token uuid NOT NULL DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'delivered', 'opened', 'clicked',
                      'bounced', 'complained', 'unsubscribed', 'failed', 'skipped')),
  provider_message_id text,
  error text,
  sent_at timestamptz,
  delivered_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  last_event_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_recipients_campaign_email_uidx UNIQUE (campaign_id, email)
);

-- ─── Raw provider events ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.email_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES public.email_campaigns(id) ON DELETE CASCADE,
  recipient_id uuid REFERENCES public.email_recipients(id) ON DELETE SET NULL,
  location_id uuid REFERENCES public.locations(id) ON DELETE CASCADE,
  email text,
  event_type text NOT NULL,                          -- delivered / opened / clicked / bounced / complained / unsubscribed / sent / failed
  provider_message_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─── Suppression (do-not-email) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.email_suppression (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  email text NOT NULL,
  reason text NOT NULL DEFAULT 'unsubscribe'
    CHECK (reason IN ('unsubscribe', 'bounce', 'complaint', 'manual')),
  source text,
  campaign_id uuid REFERENCES public.email_campaigns(id) ON DELETE SET NULL,
  created_by_user_id uuid,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─── Change log (History subtab) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.email_campaign_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  campaign_id uuid,
  entity_name text NOT NULL DEFAULT '',
  event_type text NOT NULL
    CHECK (event_type IN ('created', 'updated', 'scheduled', 'sent', 'canceled', 'deleted')),
  summary text NOT NULL DEFAULT '',
  changed_by_user_id uuid,
  changed_by_name text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  event_at timestamptz NOT NULL DEFAULT now()
);

-- ─── Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS email_templates_location_idx ON public.email_templates (location_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS email_campaigns_location_idx ON public.email_campaigns (location_id, created_at DESC);
CREATE INDEX IF NOT EXISTS email_campaigns_status_idx ON public.email_campaigns (status, scheduled_at);
CREATE INDEX IF NOT EXISTS email_recipients_campaign_idx ON public.email_recipients (campaign_id, status);
CREATE INDEX IF NOT EXISTS email_recipients_provider_idx ON public.email_recipients (provider_message_id) WHERE provider_message_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS email_recipients_unsub_uidx ON public.email_recipients (unsubscribe_token);
CREATE INDEX IF NOT EXISTS email_events_campaign_idx ON public.email_events (campaign_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS email_events_provider_idx ON public.email_events (provider_message_id) WHERE provider_message_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS email_suppression_loc_email_uidx ON public.email_suppression (location_id, lower(email));
CREATE INDEX IF NOT EXISTS email_campaign_history_location_idx ON public.email_campaign_history (location_id, event_at DESC);

-- ─── updated_at maintenance ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.email_campaigns_updated_at_trigger()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_email_templates_updated ON public.email_templates;
CREATE TRIGGER trg_email_templates_updated BEFORE UPDATE ON public.email_templates
  FOR EACH ROW EXECUTE FUNCTION public.email_campaigns_updated_at_trigger();

DROP TRIGGER IF EXISTS trg_email_campaigns_updated ON public.email_campaigns;
CREATE TRIGGER trg_email_campaigns_updated BEFORE UPDATE ON public.email_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.email_campaigns_updated_at_trigger();

-- ─── Campaign history logging (SECURITY DEFINER; the actor still passed write RLS) ──
CREATE OR REPLACE FUNCTION public.email_campaigns_log_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_event text;
  v_row record;
  v_name text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_event := 'created'; v_row := NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    -- A status move to sent/scheduled/canceled is logged as that lifecycle event; other
    -- edits log as a generic update. (Counter-only updates from the send pipeline are
    -- frequent and uninteresting, so skip when only counters/timestamps changed.)
    v_row := NEW;
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('sent', 'scheduled', 'canceled') THEN
      v_event := NEW.status;
    ELSIF NEW.subject IS DISTINCT FROM OLD.subject
       OR NEW.name IS DISTINCT FROM OLD.name
       OR NEW.audience_summary IS DISTINCT FROM OLD.audience_summary
       OR NEW.design IS DISTINCT FROM OLD.design THEN
      v_event := 'updated';
    ELSE
      RETURN NEW;  -- counter/timestamp churn — don't spam the history feed
    END IF;
  ELSE
    v_event := 'deleted'; v_row := OLD;
  END IF;

  v_name := COALESCE(NULLIF(btrim(v_row.name), ''), 'Untitled campaign');

  INSERT INTO public.email_campaign_history (
    location_id, campaign_id, entity_name, event_type, summary, changed_by_user_id, changed_by_name
  ) VALUES (
    v_row.location_id, v_row.id, v_name, v_event,
    CASE v_event
      WHEN 'created'   THEN 'Created campaign "' || v_name || '"'
      WHEN 'updated'   THEN 'Edited campaign "' || v_name || '"'
      WHEN 'scheduled' THEN 'Scheduled "' || v_name || '"' || COALESCE(' for ' || to_char(v_row.scheduled_at, 'Mon DD, YYYY HH12:MI AM'), '')
      WHEN 'sent'      THEN 'Sent "' || v_name || '" to ' || v_row.total_recipients || ' recipient' || CASE WHEN v_row.total_recipients = 1 THEN '' ELSE 's' END
      WHEN 'canceled'  THEN 'Canceled "' || v_name || '"'
      ELSE 'Deleted campaign "' || v_name || '"'
    END,
    COALESCE(v_row.updated_by_user_id, v_row.created_by_user_id),
    COALESCE(v_row.updated_by_name, v_row.created_by_name)
  );
  RETURN v_row;
END;
$$;

DROP TRIGGER IF EXISTS trg_email_campaigns_history ON public.email_campaigns;
CREATE TRIGGER trg_email_campaigns_history
  AFTER INSERT OR UPDATE OR DELETE ON public.email_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.email_campaigns_log_history();

-- ─── RPC: prepare a campaign's recipients (management-gated, suppression-filtered) ──
-- The client resolves the audience (so it matches the CRM page exactly) and passes a
-- jsonb array of { lead_id, email, first_name, last_name, merge_data }. We replace any
-- existing pending recipients, drop suppressed/duplicate emails, snapshot the rest, and
-- set total_recipients. Returns { inserted, suppressed, total }.
CREATE OR REPLACE FUNCTION public.crm_email_prepare_send(p_campaign_id uuid, p_recipients jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_loc uuid;
  v_inserted int := 0;
  v_total int := 0;
  v_allowed int := 0;
  v_pending int := 0;
BEGIN
  SELECT location_id INTO v_loc FROM public.email_campaigns WHERE id = p_campaign_id;
  IF v_loc IS NULL THEN RAISE EXCEPTION 'Campaign not found'; END IF;
  IF NOT public.labor_has_management_access(v_loc) THEN
    RAISE EXCEPTION 'Not authorized to manage campaigns for this location';
  END IF;

  -- Only rebuild while still composing — never mutate a campaign that's already sending/sent.
  IF EXISTS (SELECT 1 FROM public.email_campaigns WHERE id = p_campaign_id AND status IN ('sending', 'sent')) THEN
    RAISE EXCEPTION 'Campaign has already been sent';
  END IF;

  DELETE FROM public.email_recipients WHERE campaign_id = p_campaign_id AND status = 'pending';

  WITH incoming AS (
    SELECT
      NULLIF(btrim(r->>'email'), '') AS email,
      NULLIF(btrim(r->>'lead_id'), '') AS lead_id,
      NULLIF(btrim(r->>'first_name'), '') AS first_name,
      NULLIF(btrim(r->>'last_name'), '') AS last_name,
      COALESCE(r->'merge_data', '{}'::jsonb) AS merge_data
    FROM jsonb_array_elements(COALESCE(p_recipients, '[]'::jsonb)) AS r
  ),
  valid AS (
    SELECT DISTINCT ON (lower(email)) email, lead_id, first_name, last_name, merge_data
    FROM incoming
    WHERE email IS NOT NULL AND email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    ORDER BY lower(email)
  ),
  allowed AS (
    SELECT v.* FROM valid v
    WHERE NOT EXISTS (
      SELECT 1 FROM public.email_suppression s
      WHERE s.location_id = v_loc AND lower(s.email) = lower(v.email)
    )
  ),
  ins AS (
    INSERT INTO public.email_recipients (campaign_id, location_id, lead_id, email, first_name, last_name, merge_data)
    SELECT p_campaign_id, v_loc, lead_id, email, first_name, last_name, merge_data FROM allowed
    ON CONFLICT (campaign_id, email) DO NOTHING
    RETURNING 1
  )
  SELECT
    (SELECT count(*) FROM valid)::int,
    (SELECT count(*) FROM allowed)::int,
    (SELECT count(*) FROM ins)::int
  INTO v_total, v_allowed, v_inserted;

  -- Authoritative recipient count = everyone now queued for this campaign.
  SELECT count(*) INTO v_pending FROM public.email_recipients WHERE campaign_id = p_campaign_id AND status = 'pending';
  UPDATE public.email_campaigns SET total_recipients = v_pending WHERE id = p_campaign_id;

  RETURN jsonb_build_object('inserted', v_inserted, 'suppressed', greatest(v_total - v_allowed, 0), 'total', v_pending);
END;
$$;

-- ─── RPC: set campaign status (schedule / cancel) — management-gated ─────────
CREATE OR REPLACE FUNCTION public.crm_email_set_campaign_status(
  p_campaign_id uuid, p_status text, p_scheduled_at timestamptz DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_loc uuid;
BEGIN
  SELECT location_id INTO v_loc FROM public.email_campaigns WHERE id = p_campaign_id;
  IF v_loc IS NULL THEN RAISE EXCEPTION 'Campaign not found'; END IF;
  IF NOT public.labor_has_management_access(v_loc) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF p_status NOT IN ('draft', 'scheduled', 'canceled') THEN
    RAISE EXCEPTION 'Status % cannot be set here', p_status;
  END IF;
  UPDATE public.email_campaigns
  SET status = p_status,
      scheduled_at = CASE WHEN p_status = 'scheduled' THEN p_scheduled_at ELSE NULL END
  WHERE id = p_campaign_id AND status IN ('draft', 'scheduled');
END;
$$;

-- ─── RPC: ingest a provider (Resend) event — called by the webhook edge fn ──
-- Correlates by provider_message_id (falling back to the most recent recipient for the
-- email), records the raw event, advances recipient + campaign state, and suppresses on
-- hard bounce / complaint. Idempotent-ish: re-counting the same terminal state is avoided
-- by only transitioning forward.
CREATE OR REPLACE FUNCTION public.crm_email_ingest_event(
  p_provider_message_id text,
  p_event_type text,
  p_email text,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_occurred_at timestamptz DEFAULT now()
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_rec record;
  v_type text := lower(coalesce(p_event_type, ''));
BEGIN
  SELECT * INTO v_rec FROM public.email_recipients
  WHERE (p_provider_message_id IS NOT NULL AND provider_message_id = p_provider_message_id)
     OR (p_provider_message_id IS NULL AND p_email IS NOT NULL AND lower(email) = lower(p_email))
  ORDER BY created_at DESC LIMIT 1;

  IF v_rec.id IS NULL THEN
    -- Unmatched (e.g. a transactional email or stale id): record the event loosely, no-op.
    INSERT INTO public.email_events (event_type, provider_message_id, email, payload, occurred_at)
    VALUES (v_type, p_provider_message_id, p_email, COALESCE(p_payload, '{}'::jsonb), p_occurred_at);
    RETURN jsonb_build_object('matched', false);
  END IF;

  INSERT INTO public.email_events (campaign_id, recipient_id, location_id, email, event_type, provider_message_id, payload, occurred_at)
  VALUES (v_rec.campaign_id, v_rec.id, v_rec.location_id, v_rec.email, v_type, p_provider_message_id, COALESCE(p_payload, '{}'::jsonb), p_occurred_at);

  -- Advance recipient state + bump the matching campaign counter once per first occurrence.
  IF v_type IN ('delivered', 'email.delivered') THEN
    IF v_rec.delivered_at IS NULL THEN
      UPDATE public.email_recipients SET delivered_at = p_occurred_at, last_event_at = p_occurred_at,
        status = CASE WHEN status IN ('pending','sent') THEN 'delivered' ELSE status END WHERE id = v_rec.id;
      UPDATE public.email_campaigns SET delivered_count = delivered_count + 1 WHERE id = v_rec.campaign_id;
    END IF;
  ELSIF v_type IN ('opened', 'email.opened') THEN
    IF v_rec.opened_at IS NULL THEN
      UPDATE public.email_recipients SET opened_at = p_occurred_at, last_event_at = p_occurred_at,
        status = CASE WHEN status IN ('pending','sent','delivered') THEN 'opened' ELSE status END WHERE id = v_rec.id;
      UPDATE public.email_campaigns SET opened_count = opened_count + 1 WHERE id = v_rec.campaign_id;
    END IF;
  ELSIF v_type IN ('clicked', 'email.clicked') THEN
    IF v_rec.clicked_at IS NULL THEN
      UPDATE public.email_recipients SET clicked_at = p_occurred_at, last_event_at = p_occurred_at,
        status = CASE WHEN status <> 'unsubscribed' THEN 'clicked' ELSE status END WHERE id = v_rec.id;
      UPDATE public.email_campaigns SET clicked_count = clicked_count + 1 WHERE id = v_rec.campaign_id;
    END IF;
  ELSIF v_type IN ('bounced', 'email.bounced', 'email.failed') THEN
    UPDATE public.email_recipients SET status = 'bounced', last_event_at = p_occurred_at, error = COALESCE(p_payload->>'reason', error) WHERE id = v_rec.id;
    UPDATE public.email_campaigns SET bounced_count = bounced_count + 1 WHERE id = v_rec.campaign_id;
    INSERT INTO public.email_suppression (location_id, email, reason, source, campaign_id)
    VALUES (v_rec.location_id, v_rec.email, 'bounce', 'resend-webhook', v_rec.campaign_id)
    ON CONFLICT (location_id, lower(email)) DO NOTHING;
  ELSIF v_type IN ('complained', 'email.complained') THEN
    UPDATE public.email_recipients SET status = 'complained', last_event_at = p_occurred_at WHERE id = v_rec.id;
    UPDATE public.email_campaigns SET complained_count = complained_count + 1 WHERE id = v_rec.campaign_id;
    INSERT INTO public.email_suppression (location_id, email, reason, source, campaign_id)
    VALUES (v_rec.location_id, v_rec.email, 'complaint', 'resend-webhook', v_rec.campaign_id)
    ON CONFLICT (location_id, lower(email)) DO NOTHING;
  END IF;

  RETURN jsonb_build_object('matched', true, 'recipient_id', v_rec.id);
END;
$$;

-- ─── RPC: one-click unsubscribe (public; token-gated, no auth) ───────────────
CREATE OR REPLACE FUNCTION public.crm_email_unsubscribe(p_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_rec record;
BEGIN
  SELECT * INTO v_rec FROM public.email_recipients WHERE unsubscribe_token = p_token LIMIT 1;
  IF v_rec.id IS NULL THEN RETURN jsonb_build_object('ok', false); END IF;

  INSERT INTO public.email_suppression (location_id, email, reason, source, campaign_id)
  VALUES (v_rec.location_id, v_rec.email, 'unsubscribe', 'one-click', v_rec.campaign_id)
  ON CONFLICT (location_id, lower(email)) DO NOTHING;

  IF v_rec.status <> 'unsubscribed' THEN
    UPDATE public.email_recipients SET status = 'unsubscribed', last_event_at = now() WHERE id = v_rec.id;
    UPDATE public.email_campaigns SET unsubscribed_count = unsubscribed_count + 1 WHERE id = v_rec.campaign_id;
    INSERT INTO public.email_events (campaign_id, recipient_id, location_id, email, event_type, occurred_at)
    VALUES (v_rec.campaign_id, v_rec.id, v_rec.location_id, v_rec.email, 'unsubscribed', now());
  END IF;

  RETURN jsonb_build_object('ok', true, 'email', v_rec.email);
END;
$$;

-- ─── RPC: manual suppression add (management-gated) ─────────────────────────
CREATE OR REPLACE FUNCTION public.crm_email_suppress(
  p_location_id uuid, p_email text, p_reason text DEFAULT 'manual', p_source text DEFAULT 'manual'
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.labor_has_management_access(p_location_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  INSERT INTO public.email_suppression (location_id, email, reason, source)
  VALUES (p_location_id, lower(btrim(p_email)), COALESCE(p_reason, 'manual'), COALESCE(p_source, 'manual'))
  ON CONFLICT (location_id, lower(email)) DO NOTHING;
END;
$$;

-- ─── RPC: read Stripo plugin credentials from Vault (service-role only) ─────
-- The stripo-token edge function calls this to mint a short-lived editor token. The
-- secret never leaves the server. Locked to service_role; clients can never read it.
CREATE OR REPLACE FUNCTION public.get_stripo_credentials()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public, vault, pg_temp AS $$
  SELECT jsonb_build_object(
    'plugin_id',  (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'stripo_plugin_id'  LIMIT 1),
    'secret_key', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'stripo_secret_key' LIMIT 1)
  );
$$;
REVOKE EXECUTE ON FUNCTION public.get_stripo_credentials() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_stripo_credentials() TO service_role;

-- ─── RPC: does the calling user manage this campaign's location? ─────────────
-- SECURITY DEFINER so the helper is callable, but auth.uid() still reflects the
-- caller's JWT — used by the send-campaign edge function to gate explicit sends.
CREATE OR REPLACE FUNCTION public.crm_email_can_manage(p_campaign_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.email_campaigns c
    WHERE c.id = p_campaign_id AND public.labor_has_management_access(c.location_id)
  );
$$;
GRANT EXECUTE ON FUNCTION public.crm_email_can_manage(uuid) TO authenticated;

-- ─── Row level security ─────────────────────────────────────────────────────
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_suppression ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_campaign_history ENABLE ROW LEVEL SECURITY;

-- templates + campaigns: read = location access, write = management
DROP POLICY IF EXISTS email_templates_read ON public.email_templates;
CREATE POLICY email_templates_read ON public.email_templates FOR SELECT TO authenticated USING (public.labor_has_location_access(location_id));
DROP POLICY IF EXISTS email_templates_write ON public.email_templates;
CREATE POLICY email_templates_write ON public.email_templates FOR ALL TO authenticated
  USING (public.labor_has_management_access(location_id)) WITH CHECK (public.labor_has_management_access(location_id));

DROP POLICY IF EXISTS email_campaigns_read ON public.email_campaigns;
CREATE POLICY email_campaigns_read ON public.email_campaigns FOR SELECT TO authenticated USING (public.labor_has_location_access(location_id));
DROP POLICY IF EXISTS email_campaigns_write ON public.email_campaigns;
CREATE POLICY email_campaigns_write ON public.email_campaigns FOR ALL TO authenticated
  USING (public.labor_has_management_access(location_id)) WITH CHECK (public.labor_has_management_access(location_id));

-- recipients + events: clients read only (writes via SECURITY DEFINER RPC / service role)
DROP POLICY IF EXISTS email_recipients_read ON public.email_recipients;
CREATE POLICY email_recipients_read ON public.email_recipients FOR SELECT TO authenticated USING (public.labor_has_location_access(location_id));
DROP POLICY IF EXISTS email_events_read ON public.email_events;
CREATE POLICY email_events_read ON public.email_events FOR SELECT TO authenticated USING (location_id IS NOT NULL AND public.labor_has_location_access(location_id));

-- suppression: read = location access, manual insert/delete = management
DROP POLICY IF EXISTS email_suppression_read ON public.email_suppression;
CREATE POLICY email_suppression_read ON public.email_suppression FOR SELECT TO authenticated USING (public.labor_has_location_access(location_id));
DROP POLICY IF EXISTS email_suppression_insert ON public.email_suppression;
CREATE POLICY email_suppression_insert ON public.email_suppression FOR INSERT TO authenticated WITH CHECK (public.labor_has_management_access(location_id));
DROP POLICY IF EXISTS email_suppression_delete ON public.email_suppression;
CREATE POLICY email_suppression_delete ON public.email_suppression FOR DELETE TO authenticated USING (public.labor_has_management_access(location_id));

DROP POLICY IF EXISTS email_campaign_history_read ON public.email_campaign_history;
CREATE POLICY email_campaign_history_read ON public.email_campaign_history FOR SELECT TO authenticated USING (public.labor_has_location_access(location_id));

-- ─── Grants ─────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_campaigns TO authenticated;
GRANT SELECT ON public.email_recipients TO authenticated;
GRANT SELECT ON public.email_events TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.email_suppression TO authenticated;
GRANT SELECT ON public.email_campaign_history TO authenticated;

-- Client-callable RPCs (definer functions enforce their own management/location checks).
GRANT EXECUTE ON FUNCTION public.crm_email_prepare_send(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_email_set_campaign_status(uuid, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_email_suppress(uuid, text, text, text) TO authenticated;
-- Public unsubscribe (clicked from an email, no session): anon + authenticated.
GRANT EXECUTE ON FUNCTION public.crm_email_unsubscribe(uuid) TO anon, authenticated;

-- Internal-only: ingest is for the service-role webhook; trigger fns never need client EXECUTE.
REVOKE EXECUTE ON FUNCTION public.crm_email_ingest_event(text, text, text, jsonb, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.email_campaigns_log_history() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.email_campaigns_updated_at_trigger() FROM PUBLIC, anon, authenticated;

COMMIT;

-- ─── Scheduled-send drain ───────────────────────────────────────────────────
-- Every 5 minutes, nudge the send-campaign edge function in "drain" mode; it picks up
-- any campaign whose scheduled_at has arrived and sends it. cron.schedule upserts by
-- name, so this is safe to re-run. (Harmless 404s until the function is deployed.)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
  'crm-email-drain-scheduled',
  '*/5 * * * *',
  $$
    SELECT net.http_post(
      url := 'https://YOUR_SUPABASE_PROJECT_REF.supabase.co/functions/v1/send-campaign',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object('mode', 'drain')
    );
  $$
);

