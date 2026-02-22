-- Add fields JSONB column to k9_packages table to support enterprise package pushes
-- This allows full package metadata to be stored including discountType, serviceNames, etc.

ALTER TABLE k9_packages
ADD COLUMN IF NOT EXISTS fields JSONB;

-- Create index for JSON field queries used by enterprise push handler
CREATE INDEX IF NOT EXISTS idx_k9_packages_enterprise_source
ON k9_packages USING GIN (fields);
