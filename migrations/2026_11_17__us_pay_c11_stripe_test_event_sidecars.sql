-- US-PAY-C11-STRIPE-TEST: additive isolation ONLY for temporary test staging.
-- TEST only; LIVE disabled by SQL CHECK. No payment initiation, charges,
-- payouts, wallet, old payments or original booking financial updates.
BEGIN;

CREATE TABLE public.us_stripe_merchant_bindings (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  market_id bigint NOT NULL REFERENCES public.markets(id) ON DELETE RESTRICT,
  owner_type text NOT NULL CHECK (owner_type IN ('salon','master')),
  owner_id integer NOT NULL CHECK (owner_id > 0),
  stripe_mode text NOT NULL DEFAULT 'TEST' CHECK (stripe_mode = 'TEST'),
  stripe_connected_account_id text NOT NULL
    CHECK (stripe_connected_account_id ~ '^acct_[a-zA-Z0-9]{8,}$'),
  verification_source text NOT NULL DEFAULT 'stripe_api_test'
    CHECK (verification_source = 'stripe_api_test'),
  verification_status text NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending','verified','revoked')),
  card_payments_status text NOT NULL DEFAULT 'unknown'
    CHECK (card_payments_status IN ('unknown','active','inactive','pending')),
  charges_enabled boolean NOT NULL DEFAULT false,
  payouts_enabled boolean NOT NULL DEFAULT false,
  details_submitted boolean NOT NULL DEFAULT false,
  country text NOT NULL DEFAULT 'US' CHECK (country = 'US'),
  last_checked_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT us_stripe_test_verification_state_check CHECK (
    (verification_status = 'verified'
      AND verified_at IS NOT NULL
      AND last_checked_at IS NOT NULL
      AND card_payments_status = 'active'
      AND charges_enabled
      AND payouts_enabled
      AND details_submitted)
    OR (verification_status <> 'verified' AND verified_at IS NULL)
  ),
  UNIQUE (owner_type, owner_id, stripe_mode),
  UNIQUE (stripe_mode, stripe_connected_account_id)
);

CREATE FUNCTION public.us_pay_c11_validate_test_binding()
RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE
  v_market_id bigint;
BEGIN
  IF NEW.owner_type = 'salon' THEN
    SELECT tms.market_id INTO v_market_id
      FROM public.salons s
      JOIN public.tenant_market_settings tms ON tms.salon_id = s.id
      JOIN public.markets m ON m.id = tms.market_id
     WHERE s.id = NEW.owner_id AND m.code = 'US'
       AND m.active = TRUE AND m.default_currency = 'USD'
     FOR SHARE OF s;
  ELSE
    SELECT tms.market_id INTO v_market_id
      FROM public.masters mas
      JOIN public.master_salon ms ON ms.master_id = mas.id
      JOIN public.tenant_market_settings tms ON tms.salon_id = ms.salon_id
      JOIN public.markets m ON m.id = tms.market_id
     WHERE mas.id = NEW.owner_id AND ms.status = 'active'
       AND m.code = 'US' AND m.active = TRUE
       AND m.default_currency = 'USD'
     ORDER BY tms.market_id
     LIMIT 1
     FOR SHARE OF mas;
  END IF;

  IF v_market_id IS NULL OR v_market_id <> NEW.market_id THEN
    RAISE EXCEPTION 'US_C11_TEST_MERCHANT_MARKET_OR_OWNER_MISMATCH'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF (NEW.market_id, NEW.owner_type, NEW.owner_id,
        NEW.stripe_mode, NEW.stripe_connected_account_id,
        NEW.created_at) IS DISTINCT FROM
       (OLD.market_id, OLD.owner_type, OLD.owner_id,
        OLD.stripe_mode, OLD.stripe_connected_account_id,
        OLD.created_at) THEN
      RAISE EXCEPTION 'US_C11_TEST_BINDING_IDENTITY_IMMUTABLE'
        USING ERRCODE = '23514';
    END IF;
    NEW.updated_at := now();
  END IF;

  RETURN NEW;
END
$fn$;

CREATE TRIGGER us_pay_c11_test_merchant_guard
  BEFORE INSERT OR UPDATE ON public.us_stripe_merchant_bindings
  FOR EACH ROW EXECUTE FUNCTION public.us_pay_c11_validate_test_binding();

CREATE TABLE public.us_stripe_payment_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  booking_id integer NOT NULL UNIQUE REFERENCES public.bookings(id) ON DELETE RESTRICT,
  market_id bigint NOT NULL REFERENCES public.markets(id) ON DELETE RESTRICT,
  merchant_binding_id bigint NOT NULL REFERENCES public.us_stripe_merchant_bindings(id) ON DELETE RESTRICT,
  stripe_mode text NOT NULL DEFAULT 'TEST' CHECK (stripe_mode = 'TEST'),
  stripe_connected_account_id text NOT NULL,
  stripe_payment_intent_id text NOT NULL UNIQUE
    CHECK (stripe_payment_intent_id ~ '^pi_[a-zA-Z0-9_]{8,}$'),
  amount_minor bigint NOT NULL CHECK (amount_minor BETWEEN 1 AND 99999999),
  currency_code text NOT NULL DEFAULT 'USD' CHECK (currency_code = 'USD'),
  payment_status text NOT NULL DEFAULT 'requires_review'
    CHECK (payment_status IN ('requires_review','awaiting_payment','paid')),
  status_event_created bigint,
  last_event_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION public.us_pay_c11_test_attempt_guard()
RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE
  record_row record;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.booking_id,NEW.market_id,NEW.merchant_binding_id,
        NEW.stripe_mode,NEW.stripe_connected_account_id,
        NEW.stripe_payment_intent_id,NEW.amount_minor,
        NEW.currency_code,NEW.created_at) IS DISTINCT FROM
       (OLD.booking_id,OLD.market_id,OLD.merchant_binding_id,
        OLD.stripe_mode,OLD.stripe_connected_account_id,
        OLD.stripe_payment_intent_id,OLD.amount_minor,
        OLD.currency_code,OLD.created_at) THEN
      RAISE EXCEPTION 'US_C11_TEST_ATTEMPT_IDENTITY_IMMUTABLE'
        USING ERRCODE = '23514';
    END IF;
    IF OLD.payment_status = 'paid' AND NEW.payment_status <> 'paid' THEN
      RAISE EXCEPTION 'US_C11_TEST_PAID_ATTEMPT_CANNOT_DOWNGRADE'
        USING ERRCODE = '23514';
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  SELECT bc.market_id, ups.amount_minor AS snapshot_minor,
         col.collector_owner_type AS collector_type,
         col.collector_owner_id AS collector_id,
         col.verification_status AS collector_status,
         bind.owner_type AS bound_type, bind.owner_id AS bound_id,
         bind.market_id AS binding_market,
         bind.verification_status AS binding_status,
         bind.stripe_mode AS binding_mode,
         bind.stripe_connected_account_id AS binding_account
    INTO record_row
    FROM public.us_pay_c11_booking_context(NEW.booking_id) bc
    JOIN public.us_booking_price_snapshots ups ON ups.booking_id=NEW.booking_id
    JOIN public.us_booking_payment_collectors col ON col.booking_id=NEW.booking_id
    JOIN public.us_stripe_merchant_bindings bind ON bind.id=NEW.merchant_binding_id
   FOR SHARE OF ups,col,bind;

  IF NOT FOUND OR record_row.market_id <> NEW.market_id
     OR record_row.binding_market <> NEW.market_id
     OR record_row.snapshot_minor <> NEW.amount_minor
     OR record_row.collector_status <> 'verified'
     OR record_row.collector_type <> record_row.bound_type
     OR record_row.collector_id <> record_row.bound_id
     OR record_row.binding_status <> 'verified'
     OR record_row.binding_mode <> 'TEST'
     OR record_row.binding_account <> NEW.stripe_connected_account_id THEN
    RAISE EXCEPTION 'US_C11_TEST_PAYMENT_ATTEMPT_NOT_AUTHORIZED'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$fn$;

CREATE TRIGGER us_pay_c11_test_attempt_insert_guard
  BEFORE INSERT OR UPDATE ON public.us_stripe_payment_attempts
  FOR EACH ROW EXECUTE FUNCTION public.us_pay_c11_test_attempt_guard();

CREATE TABLE public.us_stripe_event_ledger (
  stripe_event_id text PRIMARY KEY CHECK (stripe_event_id ~ '^evt_[a-zA-Z0-9_]{8,}$'),
  stripe_mode text NOT NULL CHECK (stripe_mode = 'TEST'),
  stripe_connected_account_id text NOT NULL,
  stripe_payment_intent_id text,
  event_type text NOT NULL,
  event_created bigint NOT NULL CHECK (event_created > 0),
  payload_sha256 text NOT NULL CHECK (length(payload_sha256) = 64),
  signature_verified boolean NOT NULL CHECK (signature_verified = true),
  processing_result text NOT NULL CHECK (
    processing_result IN ('accepted','ignored_unlinked','ignored_event',
                          'rejected_binding','rejected_data','duplicate')
  ),
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION public.us_pay_c11_test_immutable_ledger()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  RAISE EXCEPTION 'US_C11_TEST_STRIPE_LEDGER_IMMUTABLE'
    USING ERRCODE = '23514';
END
$fn$;

CREATE TRIGGER us_pay_c11_test_ledger_immutable
  BEFORE UPDATE OR DELETE ON public.us_stripe_event_ledger
  FOR EACH ROW EXECUTE FUNCTION public.us_pay_c11_test_immutable_ledger();

COMMIT;
