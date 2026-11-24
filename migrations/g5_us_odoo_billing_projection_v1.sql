-- G5-T5: Odoo remains the payment authority. This augments EXISTING
-- public.billing_subscriptions as a READ/WRITE entitlement projection.
-- Production deployment requires backup, full concurrency QA and approval.
-- Existing legacy wallet rows are NOT backfilled or reassigned.
BEGIN;
ALTER TABLE public.billing_subscriptions
  ADD COLUMN IF NOT EXISTS provider_namespace TEXT,
  ADD COLUMN IF NOT EXISTS provider_company_id INTEGER,
  ADD COLUMN IF NOT EXISTS provider_website_id INTEGER,
  ADD COLUMN IF NOT EXISTS provider_partner_id BIGINT,
  ADD COLUMN IF NOT EXISTS provider_source_request_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_subscription_order_id BIGINT,
  ADD COLUMN IF NOT EXISTS provider_invoice_id BIGINT,
  ADD COLUMN IF NOT EXISTS provider_policy_version TEXT,
  ADD COLUMN IF NOT EXISTS provider_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS provider_revoked_at TIMESTAMPTZ;

DO $guard$
BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM pg_constraint
  WHERE conname='ck_billing_us_odoo_projection_exact'
    AND conrelid='public.billing_subscriptions'::regclass
 ) THEN
  ALTER TABLE public.billing_subscriptions
    ADD CONSTRAINT ck_billing_us_odoo_projection_exact
    CHECK (
      (
        provider_namespace IS NULL AND provider_company_id IS NULL
        AND provider_website_id IS NULL AND provider_partner_id IS NULL
        AND provider_source_request_id IS NULL
        AND provider_subscription_order_id IS NULL
        AND provider_invoice_id IS NULL
        AND provider_policy_version IS NULL
        AND provider_verified_at IS NULL AND provider_revoked_at IS NULL
      ) OR (
        provider_namespace IS NOT NULL AND provider_namespace = 'odoo_online'
        AND provider_company_id = 4 AND provider_company_id IS NOT NULL
        AND provider_website_id = 5 AND provider_website_id IS NOT NULL
        AND provider_partner_id IS NOT NULL AND provider_partner_id > 0
        AND provider_source_request_id IS NOT NULL
        AND length(provider_source_request_id) BETWEEN 1 AND 128
        AND provider_subscription_order_id IS NOT NULL
        AND provider_subscription_order_id > 0
        AND provider_invoice_id IS NOT NULL AND provider_invoice_id > 0
        AND provider_policy_version IS NOT NULL
        AND length(provider_policy_version) BETWEEN 1 AND 40
        AND provider_verified_at IS NOT NULL
        AND wallet_only = FALSE AND currency = 'USD'
        AND grace_until IS NULL
        AND current_period_start IS NOT NULL
        AND current_period_end IS NOT NULL
        AND current_period_end > current_period_start
      )
    ) NOT VALID;
 END IF;
END
$guard$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_billing_odoo_source_role
  ON public.billing_subscriptions (
    provider_namespace,provider_company_id,provider_website_id,
    provider_source_request_id,owner_type
  )
  WHERE provider_namespace='odoo_online';

CREATE INDEX IF NOT EXISTS idx_billing_odoo_projection_due
  ON public.billing_subscriptions (
    current_period_end,provider_verified_at
  ) WHERE provider_namespace='odoo_online';

COMMIT;
