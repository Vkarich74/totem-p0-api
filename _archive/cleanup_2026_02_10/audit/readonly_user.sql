-- READ-ONLY AUDIT USER (idempotent)
-- user: totem_audit_ro
-- password: TotemAuditRO_2026!02!08
-- database: railway

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'totem_audit_ro') THEN
    CREATE ROLE totem_audit_ro LOGIN PASSWORD 'TotemAuditRO_2026!02!08';
  ELSE
    ALTER ROLE totem_audit_ro LOGIN PASSWORD 'TotemAuditRO_2026!02!08';
  END IF;
END $$;

-- Allow connect to database
GRANT CONNECT ON DATABASE railway TO totem_audit_ro;

-- Schemas usage
GRANT USAGE ON SCHEMA public TO totem_audit_ro;
GRANT USAGE ON SCHEMA totem_test TO totem_audit_ro;

-- Read-only on all existing tables/views/matviews
GRANT SELECT ON ALL TABLES IN SCHEMA public TO totem_audit_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA totem_test TO totem_audit_ro;

-- Sequences (safety)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO totem_audit_ro;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA totem_test TO totem_audit_ro;

-- Default privileges for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO totem_audit_ro;

ALTER DEFAULT PRIVILEGES IN SCHEMA totem_test
  GRANT SELECT ON TABLES TO totem_audit_ro;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO totem_audit_ro;

ALTER DEFAULT PRIVILEGES IN SCHEMA totem_test
  GRANT USAGE, SELECT ON SEQUENCES TO totem_audit_ro;
