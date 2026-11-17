-- TOTEM USA / TAX-05: Require tax-inclusive immutable gross for EVERY LIVE
-- payment intent (both INSERT and UPDATE, including signed webhook settlement).
-- Always AFTER TAX-01 and the nine C11 migrations.
-- Stops rather than silently altering any existing LIVE financial obligation.
BEGIN;
SET LOCAL lock_timeout='5000ms';
SET LOCAL statement_timeout='90000ms';
DO $guard$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class
      WHERE oid='public.us_booking_service_tax_snapshots'::regclass) THEN
    RAISE EXCEPTION 'TAX05_TAX01_REQUIRED';
  END IF;
  IF EXISTS (SELECT 1 FROM public.us_stripe_live_payment_intents) THEN
    RAISE EXCEPTION 'TAX05_EXISTING_LIVE_PAYMENT_INTENTS_REQUIRE_MIGRATION_REVIEW';
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION public.us_c11_live_intent_guard()
RETURNS trigger LANGUAGE plpgsql AS $body$
DECLARE
  v record;
BEGIN
  SELECT b.status, b.currency_code, m.code AS market_code,
         m.default_currency, m.active AS market_active,
         p.market_id AS snapshot_market_id, p.amount_minor AS snapshot_minor,
         p.currency_code AS snapshot_currency,
         tq.booking_id AS tax_booking_id,tq.market_id AS tax_market,
         tq.payment_purpose AS tax_purpose,
         tq.collector_owner_type AS tax_owner_type,
         tq.collector_owner_id AS tax_owner_id,
         tq.collector_revision AS tax_collector_revision,
         tq.currency_code AS tax_currency,
         tq.service_base_minor AS tax_service_base_minor,
         tq.charge_total_minor AS tax_total_minor,
         c.market_id AS collector_market,
         c.collector_owner_type, c.collector_owner_id, c.revision,
         c.selection_source, c.verification_status, c.selected_by_user_id,
         s.market_id AS seller_market, s.stripe_account_id AS seller_account,
         s.owner_type AS seller_owner_type, s.owner_id AS seller_owner_id,
         s.verification_status AS seller_status
    INTO v
    FROM public.bookings b
    JOIN public.tenant_market_settings t ON t.salon_id=b.salon_id
    JOIN public.markets m ON m.id=t.market_id
    JOIN public.us_booking_price_snapshots p ON p.booking_id=b.id
    JOIN public.us_booking_service_tax_snapshots tq ON tq.booking_id=b.id
    JOIN public.us_booking_payment_collectors c ON c.booking_id=b.id
    JOIN public.us_stripe_live_seller_bindings s
      ON s.id=NEW.seller_binding_id
   WHERE b.id=NEW.booking_id
   FOR SHARE OF b,c,s,tq,p;
  IF NOT FOUND OR v.market_code<>'US' OR v.default_currency<>'USD'
     OR v.market_active IS NOT TRUE OR v.currency_code<>'USD'
     OR v.snapshot_currency<>'USD'
     OR v.snapshot_market_id<>NEW.market_id
     OR v.collector_market<>NEW.market_id OR v.seller_market<>NEW.market_id
     OR v.tax_booking_id IS NULL
     OR v.tax_market IS DISTINCT FROM NEW.market_id
     OR v.tax_purpose IS DISTINCT FROM 'beauty_service'
     OR v.tax_currency IS DISTINCT FROM 'USD'
     OR v.tax_service_base_minor IS DISTINCT FROM v.snapshot_minor
     OR v.tax_total_minor IS DISTINCT FROM NEW.amount_minor
     OR NEW.currency_code<>'USD'
     OR v.tax_owner_type IS DISTINCT FROM NEW.collector_owner_type
     OR v.tax_owner_id IS DISTINCT FROM NEW.collector_owner_id
     OR v.tax_collector_revision IS DISTINCT FROM NEW.collector_revision
     OR v.collector_owner_type<>NEW.collector_owner_type
     OR v.collector_owner_id<>NEW.collector_owner_id
     OR v.revision<>NEW.collector_revision
     OR v.selection_source<>'owner_authorized'
     OR v.selected_by_user_id IS NULL
     OR v.seller_owner_type<>NEW.collector_owner_type
     OR v.seller_owner_id<>NEW.collector_owner_id
     OR v.seller_account<>NEW.stripe_account_id THEN
    RAISE EXCEPTION 'US_C11_LIVE_INTENT_IDENTITY_MISMATCH'
      USING ERRCODE='23514';
  END IF;
  IF TG_OP='INSERT' THEN
    IF v.status NOT IN ('reserved','confirmed')
       OR v.verification_status<>'verified'
       OR v.seller_status<>'verified' THEN
      RAISE EXCEPTION 'US_C11_LIVE_INTENT_NOT_ELIGIBLE'
        USING ERRCODE='23514';
    END IF;
  ELSE
    IF (NEW.booking_id,NEW.market_id,NEW.seller_binding_id,
        NEW.collector_owner_type,NEW.collector_owner_id,NEW.collector_revision,
        NEW.stripe_account_id,NEW.amount_minor,NEW.currency_code,
        NEW.reservation_token,NEW.created_at)
       IS DISTINCT FROM
       (OLD.booking_id,OLD.market_id,OLD.seller_binding_id,
        OLD.collector_owner_type,OLD.collector_owner_id,OLD.collector_revision,
        OLD.stripe_account_id,OLD.amount_minor,OLD.currency_code,
        OLD.reservation_token,OLD.created_at) THEN
      RAISE EXCEPTION 'US_C11_LIVE_INTENT_IDENTITY_IMMUTABLE'
        USING ERRCODE='23514';
    END IF;
    IF OLD.stripe_payment_intent_id IS NOT NULL AND
       NEW.stripe_payment_intent_id IS DISTINCT FROM OLD.stripe_payment_intent_id THEN
      RAISE EXCEPTION 'US_C11_LIVE_INTENT_STRIPE_ID_IMMUTABLE'
        USING ERRCODE='23514';
    END IF;
    IF OLD.status IN ('succeeded','refunded','disputed') AND
       NEW.status NOT IN ('succeeded','refunded','disputed') THEN
      RAISE EXCEPTION 'US_C11_LIVE_INTENT_SETTLEMENT_NO_ROLLBACK'
        USING ERRCODE='23514';
    END IF;
    NEW.updated_at:=now();
  END IF;
  RETURN NEW;
END
$body$;

-- Existing trigger points to the replaced function (OID preserved).
-- Base price sidecar is unchanged; LIVE Stripe amount must equal
-- immutable tax snapshot charge_total_minor, never service base.
COMMIT;
