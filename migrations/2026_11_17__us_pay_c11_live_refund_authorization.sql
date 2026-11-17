-- US-PAY-C11: explicit seller-owned refund consent + reservation.
-- The migration itself never issues a refund and cannot mutate KG/KZ.
-- Apply ONLY after us_pay_c11_live_financial_observations.sql.
BEGIN;

CREATE TABLE public.us_c11_live_refund_requests (
  request_id uuid PRIMARY KEY,
  booking_id integer NOT NULL
    REFERENCES public.us_stripe_live_payment_intents(booking_id) ON DELETE RESTRICT,
  seller_binding_id bigint NOT NULL
    REFERENCES public.us_stripe_live_seller_bindings(id) ON DELETE RESTRICT,
  stripe_account_id text NOT NULL CHECK (stripe_account_id ~ '^acct_[A-Za-z0-9]{8,}$'),
  stripe_payment_intent_id text NOT NULL CHECK (
    stripe_payment_intent_id ~ '^pi_[A-Za-z0-9_]{8,}$'),
  amount_minor bigint NOT NULL CHECK (amount_minor BETWEEN 1 AND 99999999),
  currency_code text NOT NULL DEFAULT 'USD' CHECK (currency_code='USD'),
  reason text NOT NULL CHECK (
    reason IN ('requested_by_customer','duplicate','fraudulent')),
  authorized_owner_type text NOT NULL CHECK (authorized_owner_type IN ('salon','master')),
  authorized_owner_id integer NOT NULL CHECK (authorized_owner_id > 0),
  authorized_user_id integer NOT NULL REFERENCES public.auth_users(id) ON DELETE RESTRICT,
  authorized_session_id text NOT NULL REFERENCES public.auth_sessions(id) ON DELETE RESTRICT,
  explicit_consent boolean NOT NULL CHECK (explicit_consent IS TRUE),
  stripe_refund_id text UNIQUE CHECK (
    stripe_refund_id IS NULL OR stripe_refund_id ~ '^re_[A-Za-z0-9_]{8,}$'),
  state text NOT NULL DEFAULT 'reserved' CHECK (
    state IN ('reserved','submitted','requires_review','succeeded','failed','canceled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT us_c11_refund_request_state_guard CHECK (
    (state='reserved' AND stripe_refund_id IS NULL)
    OR state<>'reserved'
  )
);

-- One in-flight request per paid booking. An unresolved HTTP response
-- MUST NOT open a second refund path; manual reconciliation is required.
CREATE UNIQUE INDEX us_c11_refund_one_inflight_per_booking
 ON public.us_c11_live_refund_requests (booking_id)
 WHERE state IN ('reserved','submitted','requires_review');

CREATE INDEX us_c11_refund_requests_booking
 ON public.us_c11_live_refund_requests(booking_id,created_at);

CREATE FUNCTION public.us_c11_live_refund_request_guard()
RETURNS trigger LANGUAGE plpgsql AS $guard$
BEGIN
  IF (NEW.request_id,NEW.booking_id,NEW.seller_binding_id,
      NEW.stripe_account_id,NEW.stripe_payment_intent_id,NEW.amount_minor,
      NEW.currency_code,NEW.reason,NEW.authorized_owner_type,
      NEW.authorized_owner_id,NEW.authorized_user_id,
      NEW.authorized_session_id,NEW.explicit_consent,NEW.created_at)
     IS DISTINCT FROM
     (OLD.request_id,OLD.booking_id,OLD.seller_binding_id,
      OLD.stripe_account_id,OLD.stripe_payment_intent_id,OLD.amount_minor,
      OLD.currency_code,OLD.reason,OLD.authorized_owner_type,
      OLD.authorized_owner_id,OLD.authorized_user_id,
      OLD.authorized_session_id,OLD.explicit_consent,OLD.created_at) THEN
    RAISE EXCEPTION 'US_C11_REFUND_OWNER_AMOUNT_OR_CONSENT_IMMUTABLE'
      USING ERRCODE='23514';
  END IF;
  IF OLD.stripe_refund_id IS NOT NULL AND
     NEW.stripe_refund_id IS DISTINCT FROM OLD.stripe_refund_id THEN
    RAISE EXCEPTION 'US_C11_REFUND_STRIPE_ID_IMMUTABLE'
      USING ERRCODE='23514';
  END IF;
  IF OLD.state IN ('succeeded','failed','canceled') AND
     NEW.state IS DISTINCT FROM OLD.state THEN
    RAISE EXCEPTION 'US_C11_REFUND_TERMINAL_STATE_IMMUTABLE'
      USING ERRCODE='23514';
  END IF;
  NEW.updated_at:=now();
  RETURN NEW;
END
$guard$;
CREATE TRIGGER us_c11_refund_request_guard
 BEFORE UPDATE ON public.us_c11_live_refund_requests
 FOR EACH ROW EXECUTE FUNCTION public.us_c11_live_refund_request_guard();

-- Audit records are permanent; application cannot rewrite who consented.
CREATE TABLE public.us_c11_live_refund_consents (
  request_id uuid PRIMARY KEY
    REFERENCES public.us_c11_live_refund_requests(request_id) ON DELETE RESTRICT,
  actor_user_id integer NOT NULL REFERENCES public.auth_users(id) ON DELETE RESTRICT,
  actor_session_id text NOT NULL REFERENCES public.auth_sessions(id) ON DELETE RESTRICT,
  consent_amount_minor bigint NOT NULL,
  consent_reason text NOT NULL,
  approved_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION public.us_c11_live_refund_consent_immutable()
RETURNS trigger LANGUAGE plpgsql AS $guard$
BEGIN
  RAISE EXCEPTION 'US_C11_REFUND_CONSENT_IMMUTABLE' USING ERRCODE='23514';
END
$guard$;
CREATE TRIGGER us_c11_refund_consent_no_update
 BEFORE UPDATE OR DELETE ON public.us_c11_live_refund_consents
 FOR EACH ROW EXECUTE FUNCTION public.us_c11_live_refund_consent_immutable();

COMMIT;
