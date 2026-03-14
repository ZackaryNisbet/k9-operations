-- IGN-001: Ignite Email Parser — Supabase Migration
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New Query)

-- ─── ignite_leads ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ignite_leads (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id         uuid NOT NULL REFERENCES locations(id),
  lead_type           text NOT NULL CHECK (lead_type IN ('web_form', 'phone_call', 'ad_click')),
  first_name          text,
  last_name           text,
  email               text,
  phone               text,
  source_detail       text,
  call_recording_url  text,
  form_data           jsonb DEFAULT '{}'::jsonb,
  ignite_profile_id   text,
  raw_email_html      text,
  raw_email_subject   text,
  matched_client_id   uuid,
  match_status        text NOT NULL DEFAULT 'new' CHECK (match_status IN ('new', 'matched', 'review', 'no_match')),
  match_confidence    real,
  processed_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE ignite_leads IS 'Leads parsed from Ignite (iDigital Strategies) notification emails';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ignite_leads_location_id   ON ignite_leads(location_id);
CREATE INDEX IF NOT EXISTS idx_ignite_leads_email         ON ignite_leads(email);
CREATE INDEX IF NOT EXISTS idx_ignite_leads_phone         ON ignite_leads(phone);
CREATE INDEX IF NOT EXISTS idx_ignite_leads_match_status  ON ignite_leads(match_status);
CREATE INDEX IF NOT EXISTS idx_ignite_leads_created_at    ON ignite_leads(created_at);

-- ─── ignite_config ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ignite_config (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id         uuid NOT NULL UNIQUE REFERENCES locations(id),
  ignite_profile_id   text,
  forwarding_email    text,
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE ignite_config IS 'Per-location Ignite integration settings';

-- ─── RLS Policies ─────────────────────────────────────────────────────────────

ALTER TABLE ignite_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE ignite_config ENABLE ROW LEVEL SECURITY;

-- Users can read leads for their own location
CREATE POLICY ignite_leads_select ON ignite_leads
  FOR SELECT USING (
    location_id IN (
      SELECT location_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Users can insert leads for their own location
CREATE POLICY ignite_leads_insert ON ignite_leads
  FOR INSERT WITH CHECK (
    location_id IN (
      SELECT location_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Users can update leads for their own location
CREATE POLICY ignite_leads_update ON ignite_leads
  FOR UPDATE USING (
    location_id IN (
      SELECT location_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Config: read own location
CREATE POLICY ignite_config_select ON ignite_config
  FOR SELECT USING (
    location_id IN (
      SELECT location_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Config: update own location
CREATE POLICY ignite_config_update ON ignite_config
  FOR UPDATE USING (
    location_id IN (
      SELECT location_id FROM profiles WHERE id = auth.uid()
    )
  );

-- ─── Updated-at trigger ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ignite_leads_updated_at
  BEFORE UPDATE ON ignite_leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER ignite_config_updated_at
  BEFORE UPDATE ON ignite_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
