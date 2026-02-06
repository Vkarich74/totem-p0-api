-- db_schema_v1.sql — TOKENS v1

-- salons (exists)
-- bookings (exists)

CREATE TABLE IF NOT EXISTS public_tokens (
  id SERIAL PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  salon_id TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  rate_limit_per_min INT NOT NULL DEFAULT 60,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  revoked_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_public_tokens_token
  ON public_tokens(token);

CREATE INDEX IF NOT EXISTS idx_public_tokens_salon
  ON public_tokens(salon_id);
