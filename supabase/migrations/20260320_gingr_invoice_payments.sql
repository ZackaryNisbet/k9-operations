-- ============================================================================
-- Gingr Invoice Payments table
-- Stores individual payment entries from Gingr invoice transactions.
-- Synced by gingr-sync edge function; read by live cash basis poll.
-- ============================================================================

CREATE TABLE IF NOT EXISTS gingr_invoice_payments (
  id BIGINT NOT NULL,
  location_id TEXT NOT NULL,
  invoice_id BIGINT NOT NULL,
  payment_method_type TEXT,
  total_balance NUMERIC(10,2),
  transaction_time TIMESTAMPTZ,
  transaction_date DATE,
  is_zero_payment BOOLEAN DEFAULT FALSE,
  is_admin_comp BOOLEAN DEFAULT FALSE,
  is_deposit_payment BOOLEAN DEFAULT FALSE,
  raw_data JSONB,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT gingr_invoice_payments_pkey PRIMARY KEY (location_id, id)
);

CREATE INDEX IF NOT EXISTS idx_gingr_invoice_payments_date
  ON gingr_invoice_payments (location_id, transaction_date);

CREATE INDEX IF NOT EXISTS idx_gingr_invoice_payments_invoice
  ON gingr_invoice_payments (location_id, invoice_id);

ALTER TABLE gingr_invoice_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read invoice payments"
  ON gingr_invoice_payments FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role full access invoice payments"
  ON gingr_invoice_payments FOR ALL TO service_role USING (true);

-- ── Add missing columns to gingr_deposits (used by computeCashBasisMetrics) ──

ALTER TABLE gingr_deposits
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS payment_method_id INTEGER,
  ADD COLUMN IF NOT EXISTS deposit_gingr_id BIGINT;
