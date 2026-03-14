-- =============================================================================
-- DE-005: Phase 4 — Client Enrichment
-- =============================================================================
-- Creates client enrichment tables synced from Gingr:
--   - gingr_emergency_contacts: emergency contact info for owners
--   - gingr_client_notes: staff notes and flags on client accounts
--   - gingr_communication_preferences: owner communication opt-ins/opt-outs
--   - gingr_referral_sources: how clients heard about the facility
--   - gingr_agreements: signed agreements, waivers, and consent forms
--   - gingr_subscriptions: client subscription/membership data
--
-- Purpose: Provides complete client profiles for the Push to Gingr feature
-- (CLM-005), enriched Client Detail Page displays, and full CRM capabilities.
--
-- Dependencies: DE-004 (Phase 3 animal enrichment must be in place)
-- =============================================================================

-- ─── gingr_emergency_contacts ─────────────────────────────────────────────────
-- Emergency contact information for owners synced from Gingr. Each owner can
-- have multiple emergency contacts with priority ordering.

CREATE TABLE IF NOT EXISTS gingr_emergency_contacts (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  location_id     TEXT NOT NULL,
  gingr_id        TEXT,
  owner_gingr_id  TEXT NOT NULL,                  -- FK to gingr_owners.gingr_id
  contact_name    TEXT NOT NULL,
  relationship    TEXT,                           -- spouse, parent, neighbor, friend, etc.
  phone           TEXT,
  phone_secondary TEXT,
  email           TEXT,
  is_primary      BOOLEAN NOT NULL DEFAULT FALSE, -- primary emergency contact
  priority_order  INT DEFAULT 0,                  -- ordering for multiple contacts
  is_authorized_pickup BOOLEAN NOT NULL DEFAULT FALSE, -- can pick up animals
  notes           TEXT,
  raw_data        JSONB DEFAULT '{}',             -- full Gingr API response
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (location_id, gingr_id)
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_gingr_emergency_contacts_location
  ON gingr_emergency_contacts(location_id);
CREATE INDEX IF NOT EXISTS idx_gingr_emergency_contacts_owner
  ON gingr_emergency_contacts(location_id, owner_gingr_id);

-- RLS policy: location-scoped access
ALTER TABLE gingr_emergency_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gingr_emergency_contacts_read" ON gingr_emergency_contacts;
CREATE POLICY "gingr_emergency_contacts_read" ON gingr_emergency_contacts FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "gingr_emergency_contacts_service" ON gingr_emergency_contacts;
CREATE POLICY "gingr_emergency_contacts_service" ON gingr_emergency_contacts FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ─── gingr_client_notes ───────────────────────────────────────────────────────
-- Staff notes and flags on client accounts synced from Gingr. Captures internal
-- notes, alerts, and flags that staff apply to owner profiles.

CREATE TABLE IF NOT EXISTS gingr_client_notes (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  location_id     TEXT NOT NULL,
  gingr_id        TEXT,
  owner_gingr_id  TEXT NOT NULL,                  -- FK to gingr_owners.gingr_id
  note_type       TEXT NOT NULL DEFAULT 'general', -- general, alert, flag, incident, behavioral
  title           TEXT,
  content         TEXT,                           -- the actual note text
  severity        TEXT,                           -- info, warning, critical
  is_alert        BOOLEAN NOT NULL DEFAULT FALSE, -- shows as pop-up alert on check-in
  is_pinned       BOOLEAN NOT NULL DEFAULT FALSE, -- pinned to top of client profile
  created_by      TEXT,                           -- staff member who created the note
  note_date       TIMESTAMPTZ,                   -- when the note was originally created
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  raw_data        JSONB DEFAULT '{}',             -- full Gingr API response
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (location_id, gingr_id)
);

CREATE INDEX IF NOT EXISTS idx_gingr_client_notes_location
  ON gingr_client_notes(location_id);
CREATE INDEX IF NOT EXISTS idx_gingr_client_notes_owner
  ON gingr_client_notes(location_id, owner_gingr_id);
CREATE INDEX IF NOT EXISTS idx_gingr_client_notes_type
  ON gingr_client_notes(location_id, note_type);
CREATE INDEX IF NOT EXISTS idx_gingr_client_notes_alert
  ON gingr_client_notes(location_id, is_alert);

ALTER TABLE gingr_client_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gingr_client_notes_read" ON gingr_client_notes;
CREATE POLICY "gingr_client_notes_read" ON gingr_client_notes FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "gingr_client_notes_service" ON gingr_client_notes;
CREATE POLICY "gingr_client_notes_service" ON gingr_client_notes FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ─── gingr_communication_preferences ──────────────────────────────────────────
-- Owner communication opt-in/opt-out preferences synced from Gingr. Tracks
-- which communication channels and types each client has consented to.

CREATE TABLE IF NOT EXISTS gingr_communication_preferences (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  location_id     TEXT NOT NULL,
  gingr_id        TEXT,
  owner_gingr_id  TEXT NOT NULL,                  -- FK to gingr_owners.gingr_id
  channel         TEXT NOT NULL,                  -- email, sms, phone, push, mail
  category        TEXT NOT NULL DEFAULT 'general', -- general, marketing, reminders, reports, promotions
  is_opted_in     BOOLEAN NOT NULL DEFAULT TRUE,
  opted_in_at     TIMESTAMPTZ,
  opted_out_at    TIMESTAMPTZ,
  raw_data        JSONB DEFAULT '{}',             -- full Gingr API response
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (location_id, owner_gingr_id, channel, category)
);

CREATE INDEX IF NOT EXISTS idx_gingr_comm_prefs_location
  ON gingr_communication_preferences(location_id);
CREATE INDEX IF NOT EXISTS idx_gingr_comm_prefs_owner
  ON gingr_communication_preferences(location_id, owner_gingr_id);

ALTER TABLE gingr_communication_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gingr_communication_preferences_read" ON gingr_communication_preferences;
CREATE POLICY "gingr_communication_preferences_read" ON gingr_communication_preferences FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "gingr_communication_preferences_service" ON gingr_communication_preferences;
CREATE POLICY "gingr_communication_preferences_service" ON gingr_communication_preferences FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ─── gingr_referral_sources ───────────────────────────────────────────────────
-- How clients heard about the facility, synced from Gingr. Tracks referral
-- sources per owner for marketing attribution and reporting.

CREATE TABLE IF NOT EXISTS gingr_referral_sources (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  location_id     TEXT NOT NULL,
  gingr_id        TEXT,
  owner_gingr_id  TEXT NOT NULL,                  -- FK to gingr_owners.gingr_id
  source_type     TEXT NOT NULL,                  -- google, yelp, friend, veterinarian, social_media, walk_in, other
  source_detail   TEXT,                           -- specific detail: vet name, friend name, ad campaign, etc.
  referral_date   DATE,
  raw_data        JSONB DEFAULT '{}',             -- full Gingr API response
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (location_id, gingr_id)
);

CREATE INDEX IF NOT EXISTS idx_gingr_referral_sources_location
  ON gingr_referral_sources(location_id);
CREATE INDEX IF NOT EXISTS idx_gingr_referral_sources_owner
  ON gingr_referral_sources(location_id, owner_gingr_id);
CREATE INDEX IF NOT EXISTS idx_gingr_referral_sources_type
  ON gingr_referral_sources(location_id, source_type);

ALTER TABLE gingr_referral_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gingr_referral_sources_read" ON gingr_referral_sources;
CREATE POLICY "gingr_referral_sources_read" ON gingr_referral_sources FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "gingr_referral_sources_service" ON gingr_referral_sources;
CREATE POLICY "gingr_referral_sources_service" ON gingr_referral_sources FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ─── gingr_agreements ─────────────────────────────────────────────────────────
-- Signed agreements, waivers, and consent forms synced from Gingr. Tracks
-- which documents each owner has signed and their expiration status.

CREATE TABLE IF NOT EXISTS gingr_agreements (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  location_id     TEXT NOT NULL,
  gingr_id        TEXT,
  owner_gingr_id  TEXT NOT NULL,                  -- FK to gingr_owners.gingr_id
  agreement_type  TEXT NOT NULL,                  -- liability_waiver, service_agreement, vaccination_policy, cancellation_policy
  agreement_name  TEXT,                           -- display name of the agreement
  status          TEXT NOT NULL DEFAULT 'pending', -- pending, signed, expired, declined
  signed_at       TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,                   -- NULL if no expiration
  version         TEXT,                           -- agreement version identifier
  signature_data  JSONB DEFAULT '{}',            -- signature metadata (IP, device, etc.)
  raw_data        JSONB DEFAULT '{}',             -- full Gingr API response
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (location_id, gingr_id)
);

CREATE INDEX IF NOT EXISTS idx_gingr_agreements_location
  ON gingr_agreements(location_id);
CREATE INDEX IF NOT EXISTS idx_gingr_agreements_owner
  ON gingr_agreements(location_id, owner_gingr_id);
CREATE INDEX IF NOT EXISTS idx_gingr_agreements_status
  ON gingr_agreements(location_id, status);
CREATE INDEX IF NOT EXISTS idx_gingr_agreements_expiration
  ON gingr_agreements(location_id, expires_at);

ALTER TABLE gingr_agreements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gingr_agreements_read" ON gingr_agreements;
CREATE POLICY "gingr_agreements_read" ON gingr_agreements FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "gingr_agreements_service" ON gingr_agreements;
CREATE POLICY "gingr_agreements_service" ON gingr_agreements FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ─── gingr_subscriptions ──────────────────────────────────────────────────────
-- Client subscription and membership data synced from Gingr. Tracks active
-- packages, memberships, and recurring service plans.

CREATE TABLE IF NOT EXISTS gingr_subscriptions (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  location_id       TEXT NOT NULL,
  gingr_id          TEXT NOT NULL,                  -- Gingr subscription ID
  owner_gingr_id    TEXT NOT NULL,                  -- FK to gingr_owners.gingr_id
  subscription_name TEXT NOT NULL,                  -- e.g. 'Daycare 10-Pack', 'Monthly Unlimited'
  subscription_type TEXT,                           -- package, membership, plan, punch_card
  status            TEXT NOT NULL DEFAULT 'active', -- active, paused, cancelled, expired
  start_date        DATE,
  end_date          DATE,                           -- NULL if ongoing/auto-renew
  renewal_date      DATE,                           -- next renewal date
  total_uses        INT,                            -- total allowed uses (NULL if unlimited)
  remaining_uses    INT,                            -- remaining uses (NULL if unlimited)
  price             NUMERIC(12,2),                  -- subscription price
  billing_frequency TEXT,                           -- monthly, annual, one_time, per_use
  auto_renew        BOOLEAN NOT NULL DEFAULT FALSE,
  raw_data          JSONB DEFAULT '{}',             -- full Gingr API response
  synced_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (location_id, gingr_id)
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_gingr_subscriptions_location
  ON gingr_subscriptions(location_id);
CREATE INDEX IF NOT EXISTS idx_gingr_subscriptions_owner
  ON gingr_subscriptions(location_id, owner_gingr_id);
CREATE INDEX IF NOT EXISTS idx_gingr_subscriptions_status
  ON gingr_subscriptions(location_id, status);
CREATE INDEX IF NOT EXISTS idx_gingr_subscriptions_type
  ON gingr_subscriptions(location_id, subscription_type);
CREATE INDEX IF NOT EXISTS idx_gingr_subscriptions_renewal
  ON gingr_subscriptions(location_id, renewal_date);

ALTER TABLE gingr_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gingr_subscriptions_read" ON gingr_subscriptions;
CREATE POLICY "gingr_subscriptions_read" ON gingr_subscriptions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "gingr_subscriptions_service" ON gingr_subscriptions;
CREATE POLICY "gingr_subscriptions_service" ON gingr_subscriptions FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ─── Sync state entries for new tables ──────────────────────────────────────
-- Register these tables in gingr_sync_state so the sync engine tracks them.

INSERT INTO gingr_sync_state (location_id, entity_type, last_sync_at, status)
SELECT location_id, 'emergency_contacts', NULL, 'pending'
FROM (SELECT DISTINCT location_id FROM gingr_sync_state) locs
WHERE NOT EXISTS (
  SELECT 1 FROM gingr_sync_state gs
  WHERE gs.location_id = locs.location_id AND gs.entity_type = 'emergency_contacts'
)
ON CONFLICT DO NOTHING;

INSERT INTO gingr_sync_state (location_id, entity_type, last_sync_at, status)
SELECT location_id, 'client_notes', NULL, 'pending'
FROM (SELECT DISTINCT location_id FROM gingr_sync_state) locs
WHERE NOT EXISTS (
  SELECT 1 FROM gingr_sync_state gs
  WHERE gs.location_id = locs.location_id AND gs.entity_type = 'client_notes'
)
ON CONFLICT DO NOTHING;

INSERT INTO gingr_sync_state (location_id, entity_type, last_sync_at, status)
SELECT location_id, 'communication_preferences', NULL, 'pending'
FROM (SELECT DISTINCT location_id FROM gingr_sync_state) locs
WHERE NOT EXISTS (
  SELECT 1 FROM gingr_sync_state gs
  WHERE gs.location_id = locs.location_id AND gs.entity_type = 'communication_preferences'
)
ON CONFLICT DO NOTHING;

INSERT INTO gingr_sync_state (location_id, entity_type, last_sync_at, status)
SELECT location_id, 'referral_sources', NULL, 'pending'
FROM (SELECT DISTINCT location_id FROM gingr_sync_state) locs
WHERE NOT EXISTS (
  SELECT 1 FROM gingr_sync_state gs
  WHERE gs.location_id = locs.location_id AND gs.entity_type = 'referral_sources'
)
ON CONFLICT DO NOTHING;

INSERT INTO gingr_sync_state (location_id, entity_type, last_sync_at, status)
SELECT location_id, 'agreements', NULL, 'pending'
FROM (SELECT DISTINCT location_id FROM gingr_sync_state) locs
WHERE NOT EXISTS (
  SELECT 1 FROM gingr_sync_state gs
  WHERE gs.location_id = locs.location_id AND gs.entity_type = 'agreements'
)
ON CONFLICT DO NOTHING;

INSERT INTO gingr_sync_state (location_id, entity_type, last_sync_at, status)
SELECT location_id, 'subscriptions', NULL, 'pending'
FROM (SELECT DISTINCT location_id FROM gingr_sync_state) locs
WHERE NOT EXISTS (
  SELECT 1 FROM gingr_sync_state gs
  WHERE gs.location_id = locs.location_id AND gs.entity_type = 'subscriptions'
)
ON CONFLICT DO NOTHING;
