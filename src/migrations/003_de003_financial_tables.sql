-- =============================================================================
-- DE-003: Phase 2 — Financial Data Tables
-- =============================================================================
-- Creates financial data tables synced from Gingr:
--   - gingr_invoices: all invoice records
--   - gingr_transactions: all transaction/payment records
--
-- Purpose: Required for accurate revenue reporting (OPS-001, OPS-003, OPS-005),
-- fixing Total Spent on client pages (CLM-011), and the consolidated Dashboard.
-- =============================================================================

-- ─── gingr_invoices ─────────────────────────────────────────────────────────
-- Invoice records synced from Gingr. Each invoice is tied to an owner and
-- optionally to a reservation.

CREATE TABLE IF NOT EXISTS gingr_invoices (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  location_id       TEXT NOT NULL,
  gingr_id          TEXT NOT NULL,            -- Gingr invoice ID
  owner_gingr_id    TEXT,                     -- FK to gingr_owners.gingr_id
  reservation_gingr_id TEXT,                  -- FK to gingr_reservations.gingr_id (nullable)
  invoice_number    TEXT,                     -- human-readable invoice number
  status            TEXT NOT NULL DEFAULT 'pending', -- pending, paid, partial, void, refunded
  subtotal          NUMERIC(12,2) DEFAULT 0,
  tax_amount        NUMERIC(12,2) DEFAULT 0,
  discount_amount   NUMERIC(12,2) DEFAULT 0,
  total_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount_paid       NUMERIC(12,2) DEFAULT 0,
  balance_due       NUMERIC(12,2) DEFAULT 0,
  invoice_date      DATE,
  due_date          DATE,
  paid_date         DATE,
  notes             TEXT,
  line_items        JSONB DEFAULT '[]',       -- array of {description, qty, unit_price, total, service_id}
  raw_data          JSONB DEFAULT '{}',       -- full Gingr API response
  synced_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (location_id, gingr_id)
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_gingr_invoices_location
  ON gingr_invoices(location_id);
CREATE INDEX IF NOT EXISTS idx_gingr_invoices_owner
  ON gingr_invoices(location_id, owner_gingr_id);
CREATE INDEX IF NOT EXISTS idx_gingr_invoices_status
  ON gingr_invoices(location_id, status);
CREATE INDEX IF NOT EXISTS idx_gingr_invoices_date
  ON gingr_invoices(location_id, invoice_date);
CREATE INDEX IF NOT EXISTS idx_gingr_invoices_reservation
  ON gingr_invoices(location_id, reservation_gingr_id);

ALTER TABLE gingr_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gingr_invoices_read" ON gingr_invoices;
CREATE POLICY "gingr_invoices_read" ON gingr_invoices FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "gingr_invoices_service" ON gingr_invoices;
CREATE POLICY "gingr_invoices_service" ON gingr_invoices FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ─── gingr_transactions ─────────────────────────────────────────────────────
-- Payment/transaction records synced from Gingr. Each transaction represents a
-- payment event (credit card charge, cash, refund, etc.).

CREATE TABLE IF NOT EXISTS gingr_transactions (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  location_id         TEXT NOT NULL,
  gingr_id            TEXT NOT NULL,            -- Gingr transaction ID
  invoice_gingr_id    TEXT,                     -- FK to gingr_invoices.gingr_id
  owner_gingr_id      TEXT,                     -- FK to gingr_owners.gingr_id
  transaction_type    TEXT NOT NULL DEFAULT 'payment', -- payment, refund, credit, adjustment, void
  payment_method      TEXT,                    -- credit_card, cash, check, account_credit, etc.
  amount              NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_amount          NUMERIC(12,2) DEFAULT 0,
  tip_amount          NUMERIC(12,2) DEFAULT 0,
  transaction_date    TIMESTAMPTZ,
  status              TEXT NOT NULL DEFAULT 'completed', -- completed, pending, failed, voided
  reference_number    TEXT,                    -- payment processor reference / receipt number
  description         TEXT,
  card_last_four      TEXT,                    -- last 4 digits of card (if applicable)
  card_brand          TEXT,                    -- visa, mastercard, amex, etc.
  raw_data            JSONB DEFAULT '{}',       -- full Gingr API response
  synced_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (location_id, gingr_id)
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_gingr_transactions_location
  ON gingr_transactions(location_id);
CREATE INDEX IF NOT EXISTS idx_gingr_transactions_owner
  ON gingr_transactions(location_id, owner_gingr_id);
CREATE INDEX IF NOT EXISTS idx_gingr_transactions_invoice
  ON gingr_transactions(location_id, invoice_gingr_id);
CREATE INDEX IF NOT EXISTS idx_gingr_transactions_type
  ON gingr_transactions(location_id, transaction_type);
CREATE INDEX IF NOT EXISTS idx_gingr_transactions_date
  ON gingr_transactions(location_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_gingr_transactions_status
  ON gingr_transactions(location_id, status);

ALTER TABLE gingr_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gingr_transactions_read" ON gingr_transactions;
CREATE POLICY "gingr_transactions_read" ON gingr_transactions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "gingr_transactions_service" ON gingr_transactions;
CREATE POLICY "gingr_transactions_service" ON gingr_transactions FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ─── Helpful views for revenue reporting ────────────────────────────────────

-- Daily revenue summary (for dashboard and EOD reports)
CREATE OR REPLACE VIEW v_daily_revenue AS
SELECT
  t.location_id,
  DATE(t.transaction_date) AS revenue_date,
  COUNT(*)                 AS transaction_count,
  SUM(CASE WHEN t.transaction_type = 'payment' THEN t.amount ELSE 0 END)  AS total_payments,
  SUM(CASE WHEN t.transaction_type = 'refund' THEN t.amount ELSE 0 END)   AS total_refunds,
  SUM(CASE WHEN t.transaction_type = 'payment' THEN t.amount ELSE 0 END)
    - SUM(CASE WHEN t.transaction_type = 'refund' THEN t.amount ELSE 0 END) AS net_revenue,
  SUM(t.tip_amount)        AS total_tips,
  SUM(t.tax_amount)        AS total_tax
FROM gingr_transactions t
WHERE t.status = 'completed'
GROUP BY t.location_id, DATE(t.transaction_date);


-- Client lifetime value (total spent per client)
CREATE OR REPLACE VIEW v_client_lifetime_value AS
SELECT
  t.location_id,
  t.owner_gingr_id,
  COUNT(*)                 AS total_transactions,
  SUM(CASE WHEN t.transaction_type = 'payment' THEN t.amount ELSE 0 END)  AS total_spent,
  SUM(CASE WHEN t.transaction_type = 'refund' THEN t.amount ELSE 0 END)   AS total_refunded,
  SUM(CASE WHEN t.transaction_type = 'payment' THEN t.amount ELSE 0 END)
    - SUM(CASE WHEN t.transaction_type = 'refund' THEN t.amount ELSE 0 END) AS net_spent,
  MIN(t.transaction_date)  AS first_transaction,
  MAX(t.transaction_date)  AS last_transaction
FROM gingr_transactions t
WHERE t.status = 'completed' AND t.owner_gingr_id IS NOT NULL
GROUP BY t.location_id, t.owner_gingr_id;


-- ─── Sync state entries for new tables ──────────────────────────────────────

INSERT INTO gingr_sync_state (location_id, entity_type, last_sync_at, status)
SELECT location_id, 'invoices', NULL, 'pending'
FROM (SELECT DISTINCT location_id FROM gingr_sync_state) locs
WHERE NOT EXISTS (
  SELECT 1 FROM gingr_sync_state gs
  WHERE gs.location_id = locs.location_id AND gs.entity_type = 'invoices'
)
ON CONFLICT DO NOTHING;

INSERT INTO gingr_sync_state (location_id, entity_type, last_sync_at, status)
SELECT location_id, 'transactions', NULL, 'pending'
FROM (SELECT DISTINCT location_id FROM gingr_sync_state) locs
WHERE NOT EXISTS (
  SELECT 1 FROM gingr_sync_state gs
  WHERE gs.location_id = locs.location_id AND gs.entity_type = 'transactions'
)
ON CONFLICT DO NOTHING;
