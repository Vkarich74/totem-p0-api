-- TOTEM US-PAY-C11 — Stripe Connect LIVE merchant lifecycle webhook journal.
-- Additive and isolated. Does not create payments, sellers or transfer funds.
-- Apply strictly AFTER 2026_11_17__us_pay_c11_live_seller_onboarding.sql.
BEGIN;

CREATE TABLE public.us_stripe_live_connect_event_receipts (
  stripe_event_id text PRIMARY KEY
    CHECK (stripe_event_id ~ '^evt_[a-zA-Z0-9_]{8,}$'),
  binding_id bigint REFERENCES public.us_stripe_live_seller_bindings(id)
    ON DELETE RESTRICT,
  stripe_account_id text NOT NULL
    CHECK (stripe_account_id ~ '^acct_[a-zA-Z0-9]{8,}$'),
  event_type text NOT NULL
    CHECK (event_type IN ('account.updated','account.application.deauthorized')),
  event_created bigint NOT NULL CHECK (event_created > 0),
  stripe_mode text NOT NULL DEFAULT 'LIVE' CHECK (stripe_mode='LIVE'),
  signature_verified boolean NOT NULL CHECK (signature_verified IS TRUE),
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  processing_result text NOT NULL CHECK (processing_result IN
    ('verified','pending','restricted','revoked','ignored_unlinked',
     'ignored_already_revoked','ignored_owner_changed')),
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX us_stripe_live_connect_receipts_binding_idx
 ON public.us_stripe_live_connect_event_receipts(binding_id,received_at DESC);

CREATE FUNCTION public.us_stripe_live_connect_immutable_receipt()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  RAISE EXCEPTION 'US_C11_LIVE_CONNECT_EVENT_RECEIPT_IMMUTABLE'
    USING ERRCODE='23514';
END
$fn$;

CREATE TRIGGER us_stripe_live_connect_no_receipt_update
 BEFORE UPDATE OR DELETE ON public.us_stripe_live_connect_event_receipts
 FOR EACH ROW EXECUTE FUNCTION public.us_stripe_live_connect_immutable_receipt();

COMMIT;
