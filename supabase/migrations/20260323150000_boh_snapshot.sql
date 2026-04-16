-- ============================================================================
-- BOH Snapshot — Server-side Back-of-House state for fast transition detection
-- Used by gingr-sync boh-diff mode to detect check-in/check-out transitions
-- without requiring direct browser-to-Gingr API calls.
-- ============================================================================

CREATE TABLE IF NOT EXISTS boh_snapshot (
  location_id    TEXT PRIMARY KEY,
  snapshot       JSONB NOT NULL DEFAULT '{}',
  snapshot_hash  TEXT NOT NULL DEFAULT '',
  dog_count      INT NOT NULL DEFAULT 0,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS policies — match existing gingr_* table patterns
ALTER TABLE boh_snapshot ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read boh_snapshot"
  ON boh_snapshot FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role full access boh_snapshot"
  ON boh_snapshot FOR ALL TO service_role USING (true) WITH CHECK (true);
