-- US-PAY-C11: persistent HTTPS delivery evidence, Cloudflare D1 Free.
-- This is NOT the authoritative PostgreSQL payment ledger.
-- Never store Stripe webhook secret, original payload, customer name/email,
-- payment method, card details, or other sensitive metadata.
CREATE TABLE IF NOT EXISTS stripe_test_deliveries (
  event_id TEXT PRIMARY KEY CHECK (event_id GLOB 'evt_*'),
  event_type TEXT NOT NULL,
  stripe_source_account TEXT NOT NULL,
  stripe_created INTEGER NOT NULL CHECK (stripe_created > 0),
  sha256_hex TEXT NOT NULL CHECK (length(sha256_hex) = 64),
  signature_verified INTEGER NOT NULL DEFAULT 1 CHECK (signature_verified = 1),
  received_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS stripe_test_deliveries_received_idx
  ON stripe_test_deliveries (received_at DESC);
