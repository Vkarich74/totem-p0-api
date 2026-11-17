-- US-PAY-C11-DB / additive US-only, PostgreSQL 17+.
-- No Stripe execution, no legacy payments/payouts/refunds writes.
-- Apply to isolated staging first. Run on production only after release approval.
BEGIN;

CREATE TABLE public.us_service_price_amounts (
  salon_master_service_id integer PRIMARY KEY
    REFERENCES public.salon_master_services(id) ON DELETE RESTRICT,
  market_id bigint NOT NULL REFERENCES public.markets(id) ON DELETE RESTRICT,
  amount_minor bigint NOT NULL CHECK (amount_minor BETWEEN 1 AND 99999999),
  currency_code text NOT NULL DEFAULT 'USD' CHECK (currency_code = 'USD'),
  price_version bigint NOT NULL DEFAULT 1 CHECK (price_version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.us_booking_price_snapshots (
  booking_id integer PRIMARY KEY
    REFERENCES public.bookings(id) ON DELETE RESTRICT,
  market_id bigint NOT NULL REFERENCES public.markets(id) ON DELETE RESTRICT,
  salon_master_service_id integer NOT NULL
    REFERENCES public.salon_master_services(id) ON DELETE RESTRICT,
  amount_minor bigint NOT NULL CHECK (amount_minor BETWEEN 1 AND 99999999),
  currency_code text NOT NULL DEFAULT 'USD' CHECK (currency_code = 'USD'),
  service_price_version bigint NOT NULL CHECK (service_price_version > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX us_booking_price_snapshots_service_idx
  ON public.us_booking_price_snapshots(salon_master_service_id);

CREATE TABLE public.us_booking_payment_collectors (
  booking_id integer PRIMARY KEY
    REFERENCES public.bookings(id) ON DELETE RESTRICT,
  market_id bigint NOT NULL REFERENCES public.markets(id) ON DELETE RESTRICT,
  collector_owner_type text NOT NULL
    CHECK (collector_owner_type IN ('salon', 'master')),
  collector_owner_id integer NOT NULL CHECK (collector_owner_id > 0),
  selection_source text NOT NULL
    CHECK (selection_source = 'owner_authorized'),
  selected_by_user_id integer NOT NULL CHECK (selected_by_user_id > 0),
  verification_status text NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending', 'verified', 'revoked')),
  verified_at timestamptz,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT us_collector_verified_timestamp_check CHECK (
    (verification_status = 'verified' AND verified_at IS NOT NULL) OR
    (verification_status <> 'verified' AND verified_at IS NULL)
  )
);
CREATE INDEX us_booking_payment_collectors_owner_idx
  ON public.us_booking_payment_collectors
  (market_id, collector_owner_type, collector_owner_id);

-- Shared validator reads ONLY the authoritative booking -> tenant market link.
CREATE FUNCTION public.us_pay_c11_booking_context(p_booking_id integer)
RETURNS TABLE (
  salon_id integer, master_id integer, service_id integer,
  market_id bigint, currency_code text
)
LANGUAGE sql STABLE AS $func$
  SELECT b.salon_id, b.master_id, b.service_id, tm.market_id,
         b.currency_code
    FROM public.bookings b
    JOIN public.tenant_market_settings tm ON tm.salon_id = b.salon_id
    JOIN public.markets m ON m.id = tm.market_id
   WHERE b.id = p_booking_id
     AND m.code = 'US' AND m.active = TRUE
     AND m.default_currency = 'USD'
     AND b.currency_code = 'USD'
$func$;

CREATE FUNCTION public.us_pay_c11_validate_service_price()
RETURNS trigger LANGUAGE plpgsql AS $func$
DECLARE
  v_market_id bigint;
BEGIN
  SELECT tm.market_id INTO v_market_id
    FROM public.salon_master_services sms
    JOIN public.tenant_market_settings tm ON tm.salon_id = sms.salon_id
    JOIN public.markets m ON m.id = tm.market_id
   WHERE sms.id = NEW.salon_master_service_id
     AND sms.active = TRUE AND sms.currency_code = 'USD'
     AND m.code = 'US' AND m.active = TRUE
     AND m.default_currency = 'USD'
   FOR SHARE OF sms;
  IF v_market_id IS NULL OR v_market_id <> NEW.market_id THEN
    RAISE EXCEPTION 'US_C11_SERVICE_MARKET_MISMATCH'
      USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.salon_master_service_id <> OLD.salon_master_service_id OR
       NEW.market_id <> OLD.market_id OR
       NEW.currency_code <> OLD.currency_code OR
       NEW.created_at <> OLD.created_at THEN
      RAISE EXCEPTION 'US_C11_SERVICE_PRICE_IDENTITY_IMMUTABLE'
        USING ERRCODE = '23514';
    END IF;
    IF NEW.amount_minor <> OLD.amount_minor THEN
      NEW.price_version := OLD.price_version + 1;
    ELSE
      NEW.price_version := OLD.price_version;
    END IF;
    NEW.updated_at := now();
  ELSE
    NEW.price_version := 1;
  END IF;
  RETURN NEW;
END
$func$;
CREATE TRIGGER us_pay_c11_service_price_guard
  BEFORE INSERT OR UPDATE ON public.us_service_price_amounts
  FOR EACH ROW EXECUTE FUNCTION public.us_pay_c11_validate_service_price();

CREATE FUNCTION public.us_pay_c11_validate_booking_snapshot()
RETURNS trigger LANGUAGE plpgsql AS $func$
DECLARE
  v_record record;
BEGIN
  SELECT bc.salon_id, bc.master_id, bc.service_id, bc.market_id,
         sms.salon_id AS link_salon_id, sms.master_id AS link_master_id,
         sms.service_pk AS link_service_pk, sms.active AS link_active,
         sms.currency_code AS link_currency,
         spa.amount_minor AS authoritative_minor,
         spa.price_version AS authoritative_version,
         spa.market_id AS authoritative_market
    INTO v_record
    FROM public.us_pay_c11_booking_context(NEW.booking_id) bc
    JOIN public.salon_master_services sms ON sms.id = NEW.salon_master_service_id
    JOIN public.us_service_price_amounts spa
      ON spa.salon_master_service_id = sms.id
   FOR SHARE OF sms, spa;
  IF NOT FOUND OR v_record.market_id <> NEW.market_id OR
     v_record.authoritative_market <> NEW.market_id OR
     v_record.link_salon_id <> v_record.salon_id OR
     v_record.link_master_id <> v_record.master_id OR
     v_record.link_service_pk <> v_record.service_id OR
     v_record.link_active IS DISTINCT FROM TRUE OR
     v_record.link_currency <> 'USD' OR
     v_record.authoritative_minor <> NEW.amount_minor OR
     v_record.authoritative_version <> NEW.service_price_version THEN
    RAISE EXCEPTION 'US_C11_PRICE_SNAPSHOT_MISMATCH'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$func$;
CREATE TRIGGER us_pay_c11_booking_price_insert_guard
  BEFORE INSERT ON public.us_booking_price_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.us_pay_c11_validate_booking_snapshot();

CREATE FUNCTION public.us_pay_c11_immutable_snapshot()
RETURNS trigger LANGUAGE plpgsql AS $func$
BEGIN
  RAISE EXCEPTION 'US_C11_BOOKING_PRICE_IMMUTABLE'
    USING ERRCODE = '23514';
END
$func$;
CREATE TRIGGER us_pay_c11_booking_price_immutable
  BEFORE UPDATE OR DELETE ON public.us_booking_price_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.us_pay_c11_immutable_snapshot();

CREATE FUNCTION public.us_pay_c11_validate_collector()
RETURNS trigger LANGUAGE plpgsql AS $func$
DECLARE
  v_record record;
BEGIN
  SELECT * INTO v_record
    FROM public.us_pay_c11_booking_context(NEW.booking_id);
  IF NOT FOUND OR NEW.market_id <> v_record.market_id OR
     NOT (
       (NEW.collector_owner_type = 'salon'
         AND NEW.collector_owner_id = v_record.salon_id) OR
       (NEW.collector_owner_type = 'master'
         AND NEW.collector_owner_id = v_record.master_id)
     ) THEN
    RAISE EXCEPTION 'US_C11_COLLECTOR_OWNER_MISMATCH'
      USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.booking_id <> OLD.booking_id OR
       NEW.market_id <> OLD.market_id OR
       NEW.created_at <> OLD.created_at THEN
      RAISE EXCEPTION 'US_C11_COLLECTOR_IDENTITY_IMMUTABLE'
        USING ERRCODE = '23514';
    END IF;
    -- A verified choice must be revoked before the receiver can change.
    IF OLD.verification_status = 'verified' AND
       (NEW.collector_owner_type, NEW.collector_owner_id,
        NEW.selected_by_user_id) IS DISTINCT FROM
       (OLD.collector_owner_type, OLD.collector_owner_id,
        OLD.selected_by_user_id) THEN
      RAISE EXCEPTION 'US_C11_VERIFIED_COLLECTOR_CHANGE_BLOCKED'
        USING ERRCODE = '23514';
    END IF;
    NEW.revision := OLD.revision + 1;
    NEW.updated_at := now();
  ELSE
    NEW.revision := 1;
  END IF;
  RETURN NEW;
END
$func$;
CREATE TRIGGER us_pay_c11_collector_guard
  BEFORE INSERT OR UPDATE ON public.us_booking_payment_collectors
  FOR EACH ROW EXECUTE FUNCTION public.us_pay_c11_validate_collector();

COMMIT;
