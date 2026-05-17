-- Historical Scheduling Demand Matrix backfill orchestration.
-- Backfills are server-side setup/bootstrap jobs. The browser only starts and
-- reads status; matrix computation remains in Edge Functions / Supabase.

CREATE TABLE IF NOT EXISTS scheduling_matrix_backfill_runs (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id           text NOT NULL,
  range_start           date NOT NULL,
  range_end             date NOT NULL,
  mode                  text NOT NULL DEFAULT 'historical_location_bootstrap',
  status                text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'complete', 'failed', 'canceled')),
  requested_by          uuid,
  batch_size            integer NOT NULL DEFAULT 14 CHECK (batch_size BETWEEN 1 AND 31),
  total_days            integer NOT NULL CHECK (total_days >= 0),
  completed_days        integer NOT NULL DEFAULT 0 CHECK (completed_days >= 0),
  failed_days           integer NOT NULL DEFAULT 0 CHECK (failed_days >= 0),
  next_date             date,
  last_processed_date   date,
  current_chunk_start   date,
  current_chunk_end     date,
  error_message         text,
  chunk_failures        jsonb NOT NULL DEFAULT '[]'::jsonb,
  coverage_snapshot     jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at            timestamptz,
  completed_at          timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scheduling_matrix_backfill_valid_range CHECK (range_end >= range_start)
);

CREATE INDEX IF NOT EXISTS idx_scheduling_matrix_backfill_location_range
  ON scheduling_matrix_backfill_runs(location_id, range_start, range_end);

CREATE INDEX IF NOT EXISTS idx_scheduling_matrix_backfill_status
  ON scheduling_matrix_backfill_runs(status, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_scheduling_matrix_backfill_active_range
  ON scheduling_matrix_backfill_runs(location_id, range_start, range_end, mode)
  WHERE status IN ('queued', 'running');

CREATE OR REPLACE FUNCTION update_scheduling_matrix_backfill_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_scheduling_matrix_backfill_updated_at ON scheduling_matrix_backfill_runs;
CREATE TRIGGER trg_scheduling_matrix_backfill_updated_at
BEFORE UPDATE ON scheduling_matrix_backfill_runs
FOR EACH ROW
EXECUTE FUNCTION update_scheduling_matrix_backfill_updated_at();

ALTER TABLE scheduling_matrix_backfill_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS scheduling_matrix_backfill_runs_select ON scheduling_matrix_backfill_runs;
CREATE POLICY scheduling_matrix_backfill_runs_select ON scheduling_matrix_backfill_runs
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM lite_profiles
      WHERE user_id = auth.uid()
        AND is_active = true
        AND (
          role::text IN ('owner', 'enterprise_admin', 'developer', 'multi_location_admin')
          OR location_id = scheduling_matrix_backfill_runs.location_id
        )
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('owner', 'role_owner')
    )
  );
