-- ============================================================================
-- Cash Basis Revenue Tables: gingr_invoices + gingr_deposits
-- Stores synced invoice and deposit data for cash basis revenue computation.
-- Also adds cash basis columns to dashboard_metrics_daily.
-- ============================================================================

-- ─── 1. Gingr Invoices ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gingr_invoices (
  id BIGINT NOT NULL,
  location_id TEXT NOT NULL,
  owner_id BIGINT,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  subtotal NUMERIC(10,2),
  tax_amount NUMERIC(10,2),
  total NUMERIC(10,2),
  is_returned BOOLEAN DEFAULT FALSE,
  item_count INTEGER,
  voided_item_count INTEGER,
  username TEXT,
  user_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT gingr_invoices_pkey PRIMARY KEY (location_id, id)
);

CREATE INDEX idx_gingr_invoices_date ON gingr_invoices (location_id, created_at);
CREATE INDEX idx_gingr_invoices_owner ON gingr_invoices (location_id, owner_id);

ALTER TABLE gingr_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read invoices" ON gingr_invoices FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role full access invoices" ON gingr_invoices FOR ALL TO service_role USING (true);

-- ─── 2. Gingr Deposits ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gingr_deposits (
  reservation_gingr_id BIGINT NOT NULL,
  location_id TEXT NOT NULL,
  owner_id BIGINT,
  owner_name TEXT,
  animal_name TEXT,
  deposit_amount NUMERIC(10,2),
  paid_amount NUMERIC(10,2),
  last_payment TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ,
  forfeited_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  last_email_sent TIMESTAMPTZ,
  reservation_start TIMESTAMPTZ,
  reservation_end TIMESTAMPTZ,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT gingr_deposits_pkey PRIMARY KEY (location_id, reservation_gingr_id)
);

CREATE INDEX idx_gingr_deposits_payment_date ON gingr_deposits (location_id, last_payment);
CREATE INDEX idx_gingr_deposits_consumed ON gingr_deposits (location_id, consumed_at);

ALTER TABLE gingr_deposits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read deposits" ON gingr_deposits FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role full access deposits" ON gingr_deposits FOR ALL TO service_role USING (true);

-- ─── 3. New columns on dashboard_metrics_daily ──────────────────────────────

ALTER TABLE dashboard_metrics_daily
  ADD COLUMN IF NOT EXISTS cash_collected_payments NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cash_collected_deposits NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cash_refunds NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cash_net_revenue NUMERIC(10,2) DEFAULT 0;
