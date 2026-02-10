
BEGIN;
CREATE TABLE IF NOT EXISTS onboarding_identities (
  id SERIAL PRIMARY KEY,
  lead_id TEXT UNIQUE NOT NULL,
  odoo_user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  requested_role TEXT NOT NULL,
  granted_role TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMIT;
