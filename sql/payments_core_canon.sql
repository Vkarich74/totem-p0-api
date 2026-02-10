CREATE TABLE IF NOT EXISTS payment_intents (
  id UUID PRIMARY KEY,
  status TEXT NOT NULL,
  amount BIGINT NOT NULL,
  currency TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payment_events (
  id UUID PRIMARY KEY,
  intent_id UUID NOT NULL,
  event TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payment_refunds (
  id UUID PRIMARY KEY,
  intent_id UUID NOT NULL,
  amount BIGINT NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);