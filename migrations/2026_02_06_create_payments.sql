-- payments: provider-agnostic
CREATE TABLE IF NOT EXISTS payments (
  id              SERIAL PRIMARY KEY,
  payment_id      TEXT NOT NULL,
  booking_id      INTEGER NOT NULL,
  amount_total    INTEGER NOT NULL,
  amount_base     INTEGER NOT NULL,
  amount_tips     INTEGER NOT NULL DEFAULT 0,
  currency        TEXT NOT NULL,
  status          TEXT NOT NULL, -- succeeded | failed
  provider        TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_booking_id ON payments (booking_id);
CREATE INDEX IF NOT EXISTS idx_payments_payment_id ON payments (payment_id);
