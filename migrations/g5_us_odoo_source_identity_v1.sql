-- G5: scoped proof of Odoo USA origin on the EXISTING Owner Opening table.
-- No changes to the four historical un-attributed Odoo rows.
-- Apply only after explicit release approval and backup/rollback review.
BEGIN;

ALTER TABLE public.owner_opening_requests
  ADD COLUMN IF NOT EXISTS source_namespace TEXT,
  ADD COLUMN IF NOT EXISTS source_company_id INTEGER,
  ADD COLUMN IF NOT EXISTS source_website_id INTEGER,
  ADD COLUMN IF NOT EXISTS source_partner_id BIGINT,
  ADD COLUMN IF NOT EXISTS source_request_id TEXT;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_open_owner_trusted_odoo_source_tuple'
      AND conrelid = 'public.owner_opening_requests'::regclass
  ) THEN
    ALTER TABLE public.owner_opening_requests
      ADD CONSTRAINT ck_open_owner_trusted_odoo_source_tuple
      CHECK (
        (
          source_namespace IS NULL AND source_company_id IS NULL
          AND source_website_id IS NULL AND source_partner_id IS NULL
          AND source_request_id IS NULL
        )
        OR
        (
          source_namespace = 'odoo_online'
          AND source_company_id IS NOT NULL AND source_company_id > 0
          AND source_website_id IS NOT NULL AND source_website_id > 0
          AND source_partner_id IS NOT NULL AND source_partner_id > 0
          AND source_request_id IS NOT NULL
          AND length(source_request_id) BETWEEN 1 AND 128
        )
      ) NOT VALID;
  END IF;
END
$guard$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_open_owner_odoo_source_role
  ON public.owner_opening_requests
    (source_namespace, source_company_id, source_website_id,
     source_request_id, owner_type)
  WHERE source_namespace = 'odoo_online'
    AND source_request_id IS NOT NULL;

COMMIT;
