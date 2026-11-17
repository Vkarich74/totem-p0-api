-- TOTEM USA | US-PAY-C11 | Stripe Connect LIVE ingress only.
-- This separate Cloudflare D1 stores NO payments, balances, bank details,
-- customer information, Stripe secret, or original webhook payloads.
-- Each receipt is a durable "pending backend reconciliation" marker.
-- Authoritative owner binding remains in PostgreSQL and is NOT updated here.

CREATE TABLE IF NOT EXISTS us_c11_connect_live_deliveries (
  event_id TEXT PRIMARY KEY CHECK (event_id GLOB 'evt_*'),
  stripe_account_id TEXT NOT NULL CHECK (stripe_account_id GLOB 'acct_*'),
  event_type TEXT NOT NULL CHECK (
    event_type IN ('account.updated', 'account.application.deauthorized')
  ),
  stripe_created INTEGER NOT NULL CHECK (stripe_created > 0),
  body_sha256 TEXT NOT NULL CHECK (length(body_sha256) = 64),
  signature_verified INTEGER NOT NULL CHECK (signature_verified = 1),
  reconciliation_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (reconciliation_status IN ('pending','reconciled','ignored')),
  received_at TEXT NOT NULL DEFAULT (datetime('now')),
  reconciled_at TEXT
);

CREATE INDEX IF NOT EXISTS us_c11_live_receipts_account_idx
  ON us_c11_connect_live_deliveries (stripe_account_id,received_at DESC);

CREATE INDEX IF NOT EXISTS us_c11_live_receipts_pending_idx
  ON us_c11_connect_live_deliveries (reconciliation_status,received_at)
  WHERE reconciliation_status='pending';
