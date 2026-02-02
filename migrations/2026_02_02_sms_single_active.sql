-- Enforce exactly one active service per (salon, master, service)
-- PostgreSQL: CREATE INDEX CONCURRENTLY must NOT be inside a transaction

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS
  ux_sms_single_active
ON public.salon_master_services (salon_id, master_id, service_pk)
WHERE active = true;
