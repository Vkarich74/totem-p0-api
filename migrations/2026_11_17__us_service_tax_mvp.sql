-- TOTEM USA / TAX-01: additive service-only tax MVP.
-- Scope: US+USD beauty-service bookings. No Stripe, Odoo, KG/KZ writes.
-- Configuration is per receiving salon/master; absence of a row means 0.00%.
-- This migration creates storage/guards only; payment code remains unchanged.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '90s';

CREATE TABLE public.us_owner_service_tax_settings (
  owner_type text NOT NULL CHECK (owner_type IN ('salon', 'master')),
  owner_id integer NOT NULL CHECK (owner_id > 0),
  market_id bigint NOT NULL REFERENCES public.markets(id) ON DELETE RESTRICT,
  rate_bps integer NOT NULL DEFAULT 0 CHECK (rate_bps BETWEEN 0 AND 10000),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision >= 1),
  updated_by_user_id integer NOT NULL REFERENCES public.auth_users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_type, owner_id)
);
CREATE INDEX us_owner_service_tax_settings_market_idx
  ON public.us_owner_service_tax_settings (market_id, owner_type, owner_id);

CREATE FUNCTION public.us_service_tax_settings_guard()
RETURNS trigger LANGUAGE plpgsql AS $func$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.markets m
    WHERE m.id = NEW.market_id AND m.code = 'US'
      AND m.default_currency = 'USD' AND m.active IS TRUE
  ) THEN
    RAISE EXCEPTION 'US_TAX_MARKET_NOT_US'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.owner_type = 'salon' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.salons s
      JOIN public.tenant_market_settings tms ON tms.salon_id = s.id
      WHERE s.id = NEW.owner_id AND tms.market_id = NEW.market_id
        AND s.enabled IS TRUE AND s.status = 'active'
    ) THEN
      RAISE EXCEPTION 'US_TAX_SALON_NOT_US_OR_INACTIVE'
        USING ERRCODE = '23514';
    END IF;
  ELSIF NOT EXISTS (
    SELECT 1 FROM public.masters m
    JOIN public.master_salon ms ON ms.master_id = m.id
    JOIN public.tenant_market_settings tms ON tms.salon_id = ms.salon_id
    WHERE m.id = NEW.owner_id AND m.active IS TRUE
      AND ms.status = 'active' AND tms.market_id = NEW.market_id
  ) THEN
    RAISE EXCEPTION 'US_TAX_MASTER_NOT_US_OR_INACTIVE'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF (NEW.owner_type, NEW.owner_id, NEW.market_id, NEW.created_at)
       IS DISTINCT FROM
       (OLD.owner_type, OLD.owner_id, OLD.market_id, OLD.created_at) THEN
      RAISE EXCEPTION 'US_TAX_SETTING_IDENTITY_IMMUTABLE'
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
CREATE TRIGGER us_service_tax_settings_guard
  BEFORE INSERT OR UPDATE ON public.us_owner_service_tax_settings
  FOR EACH ROW EXECUTE FUNCTION public.us_service_tax_settings_guard();

CREATE TABLE public.us_booking_service_tax_snapshots (
  booking_id integer PRIMARY KEY
    REFERENCES public.us_booking_price_snapshots(booking_id) ON DELETE RESTRICT,
  market_id bigint NOT NULL REFERENCES public.markets(id) ON DELETE RESTRICT,
  payment_purpose text NOT NULL DEFAULT 'beauty_service'
    CHECK (payment_purpose = 'beauty_service'),
  collector_owner_type text NOT NULL
    CHECK (collector_owner_type IN ('salon', 'master')),
  collector_owner_id integer NOT NULL CHECK (collector_owner_id > 0),
  collector_revision bigint NOT NULL CHECK (collector_revision > 0),
  tax_setting_revision bigint NOT NULL DEFAULT 0
    CHECK (tax_setting_revision >= 0),
  service_base_minor bigint NOT NULL
    CHECK (service_base_minor BETWEEN 1 AND 99999999),
  rate_bps integer NOT NULL CHECK (rate_bps BETWEEN 0 AND 10000),
  service_tax_minor bigint NOT NULL CHECK (service_tax_minor >= 0),
  charge_total_minor bigint NOT NULL
    CHECK (charge_total_minor BETWEEN 1 AND 99999999),
  currency_code text NOT NULL DEFAULT 'USD'
    CHECK (currency_code = 'USD'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT us_service_tax_math_check CHECK (
    service_tax_minor =
      floor((service_base_minor::numeric * rate_bps + 5000) / 10000)::bigint
    AND charge_total_minor = service_base_minor + service_tax_minor
  )
);
CREATE INDEX us_booking_service_tax_snapshots_report_idx
  ON public.us_booking_service_tax_snapshots
  (market_id, collector_owner_type, collector_owner_id, created_at);

CREATE FUNCTION public.us_service_tax_snapshot_guard()
RETURNS trigger LANGUAGE plpgsql AS $func$
DECLARE
  v_record record;
  v_rate integer := 0;
  v_revision bigint := 0;
BEGIN
  SELECT bc.market_id AS booking_market,
         p.market_id AS price_market,
         p.amount_minor AS base_amount,
         c.market_id AS collector_market,
         c.collector_owner_type AS owner_type,
         c.collector_owner_id AS owner_id,
         c.revision AS collector_revision,
         c.verification_status AS collector_status
    INTO v_record
    FROM public.us_pay_c11_booking_context(NEW.booking_id) bc
    JOIN public.us_booking_price_snapshots p
      ON p.booking_id = NEW.booking_id
    JOIN public.us_booking_payment_collectors c
      ON c.booking_id = NEW.booking_id
    FOR SHARE OF p, c;

  IF NOT FOUND OR v_record.booking_market <> NEW.market_id OR
     v_record.price_market <> NEW.market_id OR
     v_record.collector_market <> NEW.market_id OR
     v_record.base_amount <> NEW.service_base_minor OR
     v_record.owner_type <> NEW.collector_owner_type OR
     v_record.owner_id <> NEW.collector_owner_id OR
     v_record.collector_revision <> NEW.collector_revision OR
     v_record.collector_status <> 'verified' THEN
    RAISE EXCEPTION 'US_TAX_BOOKING_COLLECTOR_OR_PRICE_MISMATCH'
      USING ERRCODE = '23514';
  END IF;

  SELECT rate_bps, revision INTO v_rate, v_revision
    FROM public.us_owner_service_tax_settings
   WHERE owner_type = NEW.collector_owner_type
     AND owner_id = NEW.collector_owner_id
     AND market_id = NEW.market_id
   FOR SHARE;

  IF NOT FOUND THEN
    v_rate := 0;
    v_revision := 0;
  END IF;
  IF NEW.rate_bps <> v_rate OR
     NEW.tax_setting_revision <> v_revision THEN
    RAISE EXCEPTION 'US_TAX_SNAPSHOT_RATE_VERSION_MISMATCH'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$func$;
CREATE TRIGGER us_service_tax_snapshot_insert_guard
  BEFORE INSERT ON public.us_booking_service_tax_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.us_service_tax_snapshot_guard();

CREATE FUNCTION public.us_service_tax_snapshot_immutable()
RETURNS trigger LANGUAGE plpgsql AS $func$
BEGIN
  RAISE EXCEPTION 'US_TAX_BOOKING_SNAPSHOT_IMMUTABLE'
    USING ERRCODE = '23514';
END
$func$;
CREATE TRIGGER us_service_tax_snapshot_immutable
  BEFORE UPDATE OR DELETE ON public.us_booking_service_tax_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.us_service_tax_snapshot_immutable();

COMMIT;
