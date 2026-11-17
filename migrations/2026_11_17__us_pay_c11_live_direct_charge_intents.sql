-- US-PAY-C11 LIVE direct-charge intent anchor (no effect until explicitly enabled).
-- Additive ONLY. Requires verified US seller, fixed USD price and payee.
-- Apply after USD price/collector sidecars and LIVE seller onboarding migration.
-- Neither production data nor existing KG/KZ money tables are touched.
BEGIN;

CREATE TABLE public.us_stripe_live_payment_intents (
  booking_id integer PRIMARY KEY REFERENCES public.bookings(id) ON DELETE RESTRICT,
  market_id bigint NOT NULL REFERENCES public.markets(id) ON DELETE RESTRICT,
  seller_binding_id bigint NOT NULL
    REFERENCES public.us_stripe_live_seller_bindings(id) ON DELETE RESTRICT,
  collector_owner_type text NOT NULL CHECK (collector_owner_type IN ('salon','master')),
  collector_owner_id integer NOT NULL CHECK (collector_owner_id > 0),
  collector_revision bigint NOT NULL CHECK (collector_revision > 0),
  stripe_account_id text NOT NULL CHECK (stripe_account_id ~ '^acct_[a-zA-Z0-9]{8,}$'),
  amount_minor bigint NOT NULL CHECK (amount_minor BETWEEN 50 AND 99999999),
  currency_code text NOT NULL DEFAULT 'USD' CHECK (currency_code='USD'),
  reservation_token uuid NOT NULL UNIQUE,
  stripe_payment_intent_id text UNIQUE
    CHECK (stripe_payment_intent_id IS NULL OR
           stripe_payment_intent_id ~ '^pi_[A-Za-z0-9_]{8,}$'),
  status text NOT NULL DEFAULT 'creating'
    CHECK (status IN ('creating','requires_payment_method','requires_confirmation','requires_action',
      'processing','succeeded','canceled','failed','requires_review',
      'refunded','disputed')),
  stripe_event_created bigint,
  last_event_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT us_live_intent_creation_check CHECK (
    (status='creating' AND stripe_payment_intent_id IS NULL)
    OR (status<>'creating' AND stripe_payment_intent_id IS NOT NULL)
  )
);

CREATE INDEX us_live_payment_intents_seller_idx
  ON public.us_stripe_live_payment_intents (seller_binding_id,created_at DESC);

CREATE FUNCTION public.us_c11_live_intent_guard()
RETURNS trigger LANGUAGE plpgsql AS $body$
DECLARE
  v record;
BEGIN
  SELECT b.status, b.currency_code, m.code AS market_code,
         m.default_currency, m.active AS market_active,
         p.market_id AS snapshot_market_id, p.amount_minor AS snapshot_minor,
         p.currency_code AS snapshot_currency, c.market_id AS collector_market,
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
    JOIN public.us_booking_payment_collectors c ON c.booking_id=b.id
    JOIN public.us_stripe_live_seller_bindings s
      ON s.id=NEW.seller_binding_id
   WHERE b.id=NEW.booking_id
   FOR SHARE OF b,c,s;
  IF NOT FOUND OR v.market_code<>'US' OR v.default_currency<>'USD'
     OR v.market_active IS NOT TRUE OR v.currency_code<>'USD'
     OR v.snapshot_currency<>'USD'
     OR v.snapshot_market_id<>NEW.market_id
     OR v.collector_market<>NEW.market_id OR v.seller_market<>NEW.market_id
     OR v.snapshot_minor<>NEW.amount_minor OR NEW.currency_code<>'USD'
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

CREATE TRIGGER us_c11_live_payment_intent_guard
 BEFORE INSERT OR UPDATE ON public.us_stripe_live_payment_intents
 FOR EACH ROW EXECUTE FUNCTION public.us_c11_live_intent_guard();

-- Prevent a salon owner from redirecting an existing payment to another
-- seller by changing the selected collector after a payment is reserved.
CREATE FUNCTION public.us_c11_lock_collector_after_intent()
RETURNS trigger LANGUAGE plpgsql AS $body$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.us_stripe_live_payment_intents i
     WHERE i.booking_id=OLD.booking_id
  ) AND (TG_OP='DELETE' OR
    (NEW.collector_owner_type,NEW.collector_owner_id,NEW.revision,
     NEW.market_id,NEW.selected_by_user_id,NEW.selection_source)
      IS DISTINCT FROM
    (OLD.collector_owner_type,OLD.collector_owner_id,OLD.revision,
     OLD.market_id,OLD.selected_by_user_id,OLD.selection_source)) THEN
    RAISE EXCEPTION 'US_C11_LIVE_COLLECTOR_LOCKED_BY_PAYMENT'
      USING ERRCODE='23514';
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END
$body$;

CREATE TRIGGER us_c11_live_collector_payment_lock
 BEFORE UPDATE OR DELETE ON public.us_booking_payment_collectors
 FOR EACH ROW EXECUTE FUNCTION public.us_c11_lock_collector_after_intent();

-- No anonymous, untrusted event can upgrade a payment to paid. Receipts
-- are added by the separately signed LIVE payment webhook handler.
CREATE TABLE public.us_stripe_live_payment_receipts (
  stripe_event_id text PRIMARY KEY CHECK (stripe_event_id ~ '^evt_[A-Za-z0-9_]{8,}$'),
  booking_id integer REFERENCES public.us_stripe_live_payment_intents(booking_id)
    ON DELETE RESTRICT,
  stripe_account_id text NOT NULL,
  stripe_payment_intent_id text NOT NULL,
  stripe_mode text NOT NULL DEFAULT 'LIVE' CHECK (stripe_mode='LIVE'),
  event_type text NOT NULL,
  event_created bigint NOT NULL CHECK (event_created > 0),
  signature_verified boolean NOT NULL CHECK (signature_verified IS TRUE),
  body_sha256 text NOT NULL CHECK (body_sha256 ~ '^[0-9a-f]{64}$'),
  result text NOT NULL CHECK (result IN ('accepted','stale','ignored_unlinked','rejected_mismatch')),
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION public.us_c11_live_payment_receipt_immutable()
RETURNS trigger LANGUAGE plpgsql AS $body$
BEGIN
  RAISE EXCEPTION 'US_C11_LIVE_PAYMENT_RECEIPT_IMMUTABLE'
    USING ERRCODE='23514';
END
$body$;

CREATE TRIGGER us_c11_live_payment_receipt_no_changes
 BEFORE UPDATE OR DELETE ON public.us_stripe_live_payment_receipts
 FOR EACH ROW EXECUTE FUNCTION public.us_c11_live_payment_receipt_immutable();

COMMIT;
