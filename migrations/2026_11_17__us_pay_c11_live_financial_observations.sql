-- US-PAY-C11 / Connect LIVE refund, dispute and payout observation.
-- Additive, OFF until main LIVE signed webhook and real seller approval.
-- Does not create refunds, transfers, payouts, new owners, or edit KG/KZ.
-- All USD values are Stripe minor units; refunds belong to an exact PI.
BEGIN;

CREATE TABLE public.us_c11_live_financial_receipts (
  stripe_event_id text PRIMARY KEY CHECK (stripe_event_id ~ '^evt_[A-Za-z0-9_]{8,}$'),
  stripe_account_id text NOT NULL CHECK (stripe_account_id ~ '^acct_[A-Za-z0-9]{8,}$'),
  object_id text NOT NULL,
  event_type text NOT NULL,
  event_created bigint NOT NULL CHECK (event_created > 0),
  body_sha256 text NOT NULL CHECK (body_sha256 ~ '^[a-f0-9]{64}$'),
  signature_verified boolean NOT NULL CHECK (signature_verified = true),
  result text NOT NULL CHECK (result IN ('observed','unlinked','stale')),
  booking_id integer REFERENCES public.us_stripe_live_payment_intents(booking_id),
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX us_c11_financial_receipts_account_idx
 ON public.us_c11_live_financial_receipts (stripe_account_id,received_at DESC);

CREATE TABLE public.us_c11_live_refunds (
  stripe_refund_id text PRIMARY KEY CHECK (stripe_refund_id ~ '^re_[A-Za-z0-9_]{8,}$'),
  booking_id integer NOT NULL REFERENCES public.us_stripe_live_payment_intents(booking_id) ON DELETE RESTRICT,
  stripe_account_id text NOT NULL CHECK (stripe_account_id ~ '^acct_[A-Za-z0-9]{8,}$'),
  stripe_payment_intent_id text NOT NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor BETWEEN 1 AND 99999999),
  currency_code text NOT NULL DEFAULT 'USD' CHECK (currency_code='USD'),
  status text NOT NULL CHECK (status IN ('pending','requires_action','succeeded','failed','canceled')),
  stripe_balance_transaction_id text,
  last_event_created bigint NOT NULL CHECK (last_event_created > 0),
  last_event_id text NOT NULL REFERENCES public.us_c11_live_financial_receipts(stripe_event_id),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  refreshed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX us_c11_refunds_booking_idx
 ON public.us_c11_live_refunds (booking_id,status);

CREATE TABLE public.us_c11_live_disputes (
  stripe_dispute_id text PRIMARY KEY CHECK (stripe_dispute_id ~ '^du_[A-Za-z0-9_]{8,}$'),
  booking_id integer NOT NULL REFERENCES public.us_stripe_live_payment_intents(booking_id) ON DELETE RESTRICT,
  stripe_account_id text NOT NULL CHECK (stripe_account_id ~ '^acct_[A-Za-z0-9]{8,}$'),
  stripe_payment_intent_id text NOT NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor BETWEEN 1 AND 99999999),
  currency_code text NOT NULL DEFAULT 'USD' CHECK (currency_code='USD'),
  status text NOT NULL CHECK (status IN (
    'needs_response','under_review','won','lost',
    'warning_needs_response','warning_under_review','warning_closed',
    'prevented'
  )),
  last_event_created bigint NOT NULL CHECK (last_event_created > 0),
  last_event_id text NOT NULL REFERENCES public.us_c11_live_financial_receipts(stripe_event_id),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  refreshed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX us_c11_disputes_booking_idx
 ON public.us_c11_live_disputes (booking_id,status);

-- Payouts are connected-account AGGREGATES, never tied to one booking.
-- 'paid' is Stripe payout state, NOT proof of bank settlement of a booking.
CREATE TABLE public.us_c11_live_payouts (
  stripe_payout_id text PRIMARY KEY CHECK (stripe_payout_id ~ '^po_[A-Za-z0-9_]{8,}$'),
  seller_binding_id bigint NOT NULL REFERENCES public.us_stripe_live_seller_bindings(id) ON DELETE RESTRICT,
  stripe_account_id text NOT NULL CHECK (stripe_account_id ~ '^acct_[A-Za-z0-9]{8,}$'),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency_code text NOT NULL DEFAULT 'USD' CHECK (currency_code='USD'),
  stripe_status text NOT NULL CHECK (stripe_status IN ('pending','in_transit','paid','failed','canceled')),
  automatic boolean NOT NULL,
  arrival_date timestamptz,
  balance_transaction_id text,
  balance_items_count integer NOT NULL DEFAULT 0 CHECK (balance_items_count >= 0),
  balance_items_net_minor bigint,
  reconciliation_status text NOT NULL DEFAULT 'unreconciled'
    CHECK (reconciliation_status IN ('unreconciled','automatic_verified','variance','manual_unattributed')),
  last_event_created bigint NOT NULL CHECK (last_event_created > 0),
  last_event_id text NOT NULL REFERENCES public.us_c11_live_financial_receipts(stripe_event_id),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  refreshed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX us_c11_payouts_seller_idx
 ON public.us_c11_live_payouts (seller_binding_id,recorded_at DESC);

CREATE TABLE public.us_c11_live_payout_balance_items (
  stripe_payout_id text NOT NULL REFERENCES public.us_c11_live_payouts(stripe_payout_id) ON DELETE RESTRICT,
  stripe_balance_transaction_id text NOT NULL CHECK (stripe_balance_transaction_id ~ '^txn_[A-Za-z0-9_]{8,}$'),
  net_minor bigint NOT NULL,
  gross_minor bigint NOT NULL,
  stripe_fee_minor bigint NOT NULL CHECK (stripe_fee_minor >= 0),
  currency_code text NOT NULL DEFAULT 'USD' CHECK (currency_code='USD'),
  reporting_category text NOT NULL,
  stripe_source_id text,
  PRIMARY KEY (stripe_payout_id,stripe_balance_transaction_id)
);

-- Observed transaction identity is immutable; only verified current status
-- may evolve. One event cannot be replayed to reassign a booking/seller.
CREATE FUNCTION public.us_c11_financial_receipt_immutable()
RETURNS trigger LANGUAGE plpgsql AS $guard$
BEGIN
  RAISE EXCEPTION 'US_C11_FINANCIAL_RECEIPT_IMMUTABLE'
    USING ERRCODE = '23514';
END
$guard$;
CREATE TRIGGER us_c11_financial_receipts_immutable
 BEFORE UPDATE OR DELETE ON public.us_c11_live_financial_receipts
 FOR EACH ROW EXECUTE FUNCTION public.us_c11_financial_receipt_immutable();

CREATE FUNCTION public.us_c11_financial_owner_guard()
RETURNS trigger LANGUAGE plpgsql AS $guard$
BEGIN
  IF (NEW.booking_id,NEW.stripe_account_id,NEW.stripe_payment_intent_id,
      NEW.amount_minor,NEW.currency_code,NEW.recorded_at) IS DISTINCT FROM
     (OLD.booking_id,OLD.stripe_account_id,OLD.stripe_payment_intent_id,
      OLD.amount_minor,OLD.currency_code,OLD.recorded_at) THEN
    RAISE EXCEPTION 'US_C11_FINANCIAL_ITEM_IDENTITY_IMMUTABLE'
      USING ERRCODE = '23514';
  END IF;
  NEW.refreshed_at := now();
  RETURN NEW;
END
$guard$;
CREATE TRIGGER us_c11_refund_owner_guard
 BEFORE UPDATE ON public.us_c11_live_refunds
 FOR EACH ROW EXECUTE FUNCTION public.us_c11_financial_owner_guard();
CREATE TRIGGER us_c11_dispute_owner_guard
 BEFORE UPDATE ON public.us_c11_live_disputes
 FOR EACH ROW EXECUTE FUNCTION public.us_c11_financial_owner_guard();

CREATE FUNCTION public.us_c11_live_payout_identity_guard()
RETURNS trigger LANGUAGE plpgsql AS $guard$
BEGIN
  IF (NEW.stripe_payout_id,NEW.seller_binding_id,NEW.stripe_account_id,
      NEW.amount_minor,NEW.currency_code,NEW.automatic,NEW.recorded_at)
     IS DISTINCT FROM
     (OLD.stripe_payout_id,OLD.seller_binding_id,OLD.stripe_account_id,
      OLD.amount_minor,OLD.currency_code,OLD.automatic,OLD.recorded_at) THEN
    RAISE EXCEPTION 'US_C11_PAYOUT_OWNER_OR_AMOUNT_IMMUTABLE'
      USING ERRCODE='23514';
  END IF;
  NEW.refreshed_at:=now();
  RETURN NEW;
END
$guard$;
CREATE TRIGGER us_c11_live_payout_identity_guard
 BEFORE UPDATE ON public.us_c11_live_payouts
 FOR EACH ROW EXECUTE FUNCTION public.us_c11_live_payout_identity_guard();

CREATE FUNCTION public.us_c11_live_payout_item_immutable()
RETURNS trigger LANGUAGE plpgsql AS $guard$
BEGIN
  RAISE EXCEPTION 'US_C11_PAYOUT_BALANCE_AUDIT_IMMUTABLE'
    USING ERRCODE='23514';
END
$guard$;
CREATE TRIGGER us_c11_live_payout_balance_items_immutable
 BEFORE UPDATE OR DELETE ON public.us_c11_live_payout_balance_items
 FOR EACH ROW EXECUTE FUNCTION public.us_c11_live_payout_item_immutable();

COMMIT;
