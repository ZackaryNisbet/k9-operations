-- =============================================================================
-- DE-007: Phase 6 — Application Feature Tables
-- =============================================================================
-- Creates K9 Ops-specific application tables (NOT synced from Gingr):
--   - lifecycle_events: lifecycle stage transitions and event logging
--   - field_mappings: K9 Ops ↔ Gingr field mapping configurations
--   - email_report_configs: daily/weekly email report settings
--   - tv_display_configs: TV display preferences per location
--   - sync_logs: detailed sync history for Gingr data pulls
--
-- Purpose: Powers CLM-008 (Lifecycle Event Logging), CLM-004 (Field Mapping),
-- OPS-014 (Email Reports), TV display customization, and sync observability.
--
-- Dependencies: DE-006 (Phase 5 must be in place)
-- =============================================================================

-- ─── lifecycle_events ─────────────────────────────────────────────────────────
-- Tracks all lifecycle stage transitions and events for clients. Powers CLM-008
-- (Lifecycle Event Logging) for auditing stage changes, notes, and follow-ups.

CREATE TABLE IF NOT EXISTS lifecycle_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id     UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  client_id       UUID,
  event_type      TEXT NOT NULL,                -- e.g. 'stage_change', 'note', 'follow_up'
  from_stage      TEXT,                         -- previous lifecycle stage (NULL for initial)
  to_stage        TEXT,                         -- new lifecycle stage (NULL for non-stage events)
  details         JSONB DEFAULT '{}',           -- additional event context and metadata
  created_by      UUID,                         -- user who triggered the event
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_lifecycle_events_location
  ON lifecycle_events(location_id);
CREATE INDEX IF NOT EXISTS idx_lifecycle_events_client
  ON lifecycle_events(location_id, client_id);
CREATE INDEX IF NOT EXISTS idx_lifecycle_events_type
  ON lifecycle_events(location_id, event_type);
CREATE INDEX IF NOT EXISTS idx_lifecycle_events_created_at
  ON lifecycle_events(location_id, created_at);

-- RLS policy: location-scoped access
ALTER TABLE lifecycle_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY lifecycle_events_location_policy
  ON lifecycle_events
  FOR ALL
  USING (location_id IN (
    SELECT location_id FROM user_locations WHERE user_id = auth.uid()
  ));


-- ─── field_mappings ───────────────────────────────────────────────────────────
-- Stores K9 Ops ↔ Gingr field mapping configurations. Persisted from CLM-004
-- (Field Mapping module) so mappings survive across sessions.

CREATE TABLE IF NOT EXISTS field_mappings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id     UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  k9_field        TEXT NOT NULL,                -- K9 Ops field identifier
  gingr_field     TEXT NOT NULL,                -- Gingr field identifier
  direction       TEXT NOT NULL CHECK (direction IN ('k9_to_gingr', 'gingr_to_k9', 'bidirectional')),
  is_required     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_field_mappings_location
  ON field_mappings(location_id);
CREATE INDEX IF NOT EXISTS idx_field_mappings_direction
  ON field_mappings(location_id, direction);

-- RLS policy: location-scoped access
ALTER TABLE field_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY field_mappings_location_policy
  ON field_mappings
  FOR ALL
  USING (location_id IN (
    SELECT location_id FROM user_locations WHERE user_id = auth.uid()
  ));


-- ─── email_report_configs ─────────────────────────────────────────────────────
-- Stores daily/weekly email report settings per location. Controls which
-- reports are sent, to whom, and when.

CREATE TABLE IF NOT EXISTS email_report_configs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id     UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  report_type     TEXT NOT NULL CHECK (report_type IN ('daily', 'weekly')),
  enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  recipients      JSONB DEFAULT '[]',           -- array of email addresses
  send_time       TIME,                         -- time of day to send
  sections        JSONB DEFAULT '[]',           -- which report sections to include
  day_of_week     INTEGER,                      -- 0=Sunday..6=Saturday (for weekly reports)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_email_report_configs_location
  ON email_report_configs(location_id);
CREATE INDEX IF NOT EXISTS idx_email_report_configs_type
  ON email_report_configs(location_id, report_type);

-- RLS policy: location-scoped access
ALTER TABLE email_report_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY email_report_configs_location_policy
  ON email_report_configs
  FOR ALL
  USING (location_id IN (
    SELECT location_id FROM user_locations WHERE user_id = auth.uid()
  ));


-- ─── tv_display_configs ───────────────────────────────────────────────────────
-- TV display preferences per location. Controls auto-cycling, interval,
-- default view, and theme for the Checkout TV feature.

CREATE TABLE IF NOT EXISTS tv_display_configs (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id             UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  auto_cycle              BOOLEAN NOT NULL DEFAULT TRUE,
  cycle_interval_seconds  INTEGER NOT NULL DEFAULT 30,
  default_view            TEXT,                  -- which view to show first
  theme                   TEXT NOT NULL DEFAULT 'dark',
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_tv_display_configs_location
  ON tv_display_configs(location_id);

-- RLS policy: location-scoped access
ALTER TABLE tv_display_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY tv_display_configs_location_policy
  ON tv_display_configs
  FOR ALL
  USING (location_id IN (
    SELECT location_id FROM user_locations WHERE user_id = auth.uid()
  ));


-- ─── sync_logs ────────────────────────────────────────────────────────────────
-- Detailed sync history for Gingr data pulls. Tracks each sync operation's
-- timing, record counts, and any errors for observability and debugging.

CREATE TABLE IF NOT EXISTS sync_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id     UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  sync_type       TEXT NOT NULL,                -- e.g. 'full', 'incremental', 'manual'
  table_name      TEXT,                         -- which table was synced
  records_synced  INTEGER NOT NULL DEFAULT 0,
  records_failed  INTEGER NOT NULL DEFAULT 0,
  duration_ms     INTEGER,                      -- how long the sync took
  error_details   TEXT,                         -- error message if sync failed
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ                   -- NULL if still running or failed
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_sync_logs_location
  ON sync_logs(location_id);
CREATE INDEX IF NOT EXISTS idx_sync_logs_type
  ON sync_logs(location_id, sync_type);
CREATE INDEX IF NOT EXISTS idx_sync_logs_table
  ON sync_logs(location_id, table_name);
CREATE INDEX IF NOT EXISTS idx_sync_logs_started_at
  ON sync_logs(location_id, started_at);

-- RLS policy: location-scoped access
ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY sync_logs_location_policy
  ON sync_logs
  FOR ALL
  USING (location_id IN (
    SELECT location_id FROM user_locations WHERE user_id = auth.uid()
  ));


-- ─── Sync state entry for sync_logs table ─────────────────────────────────────
-- Register sync_logs in gingr_sync_state so the sync engine can track its own
-- sync operations (meta-tracking).

INSERT INTO gingr_sync_state (location_id, entity_type, last_sync_at, status)
SELECT location_id, 'sync_logs', NULL, 'pending'
FROM (SELECT DISTINCT location_id FROM gingr_sync_state) locs
WHERE NOT EXISTS (
  SELECT 1 FROM gingr_sync_state gs
  WHERE gs.location_id = locs.location_id AND gs.entity_type = 'sync_logs'
)
ON CONFLICT DO NOTHING;
