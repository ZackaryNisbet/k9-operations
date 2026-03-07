-- Separate address fields for k9_clients
-- Adds street, city, state, zip columns for structured address data.

ALTER TABLE k9_clients ADD COLUMN IF NOT EXISTS street text;
ALTER TABLE k9_clients ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE k9_clients ADD COLUMN IF NOT EXISTS state text;
ALTER TABLE k9_clients ADD COLUMN IF NOT EXISTS zip text;

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_k9_clients_zip ON k9_clients(zip) WHERE zip IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_k9_clients_state ON k9_clients(state) WHERE state IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_k9_clients_city ON k9_clients(city) WHERE city IS NOT NULL;
