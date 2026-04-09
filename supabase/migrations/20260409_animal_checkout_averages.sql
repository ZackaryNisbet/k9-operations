-- Cache table for average checkout times per animal
-- Used by bathing report to show historical pickup patterns
CREATE TABLE IF NOT EXISTS animal_checkout_averages (
  animal_id TEXT PRIMARY KEY,
  animal_name TEXT,
  avg_checkout_time TIME,
  sample_count INTEGER,
  reservation_type TEXT,
  computed_at TIMESTAMPTZ DEFAULT NOW()
);
