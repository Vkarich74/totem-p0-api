-- payment_events: idempotency for webhooks
CREATE TABLE IF NOT EXISTS payment_events (
  id              SERIAL PRIMARY KEY,
  payment_id      TEXT NOT NULL,
  event           TEXT NOT NULL, -- payment.succeeded | payment.failed
  occurred_at     TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (payment_id, event)
);
