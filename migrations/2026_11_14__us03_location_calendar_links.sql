-- TOTEM US-03: additive, US-only calendar location mapping. LOCAL QA ONLY.
-- US-02 must already be present. No alteration of legacy KG/KZ tables.
-- Existing markets, salons, bookings, slots and schedules are untouched.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $us03_pre$
BEGIN
  IF to_regclass('public.us_salon_locations') IS NULL
     OR to_regclass('public.us_states') IS NULL
     OR to_regclass('public.us_timezones') IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.markets
       WHERE code='US' AND active=false AND country_code='US'
         AND country_pack_code='US' AND country_pack_version='1')
     OR (SELECT value FROM public.platform_config WHERE key='default_market_code') IS DISTINCT FROM 'KG'
     OR to_regclass('public.us_location_master_working_hours') IS NOT NULL
     OR to_regclass('public.us_booking_location_links') IS NOT NULL
     OR to_regprocedure('public.validate_us_location_master_hours()') IS NOT NULL
     OR to_regprocedure('public.validate_us_booking_location_link()') IS NOT NULL
  THEN
    RAISE EXCEPTION 'US03_STOP_MISSING_PREREQUISITE_OR_CONFLICT';
  END IF;
END;
$us03_pre$;

-- Each US location uses a separate weekly schedule. The existing global
-- master_working_hours table for KG/KZ is NEVER used for US bookings.
CREATE TABLE public.us_location_master_working_hours (
  location_id bigint NOT NULL REFERENCES public.us_salon_locations(id) ON DELETE RESTRICT,
  master_id integer NOT NULL REFERENCES public.masters(id) ON DELETE RESTRICT,
  weekday integer NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time time without time zone NOT NULL,
  end_time time without time zone NOT NULL,
  break_start time without time zone,
  break_end time without time zone,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT us_location_master_hours_pk PRIMARY KEY(location_id,master_id,weekday),
  CONSTRAINT us_location_master_hours_order_check CHECK(start_time < end_time),
  CONSTRAINT us_location_master_hours_break_check CHECK (
    (break_start IS NULL AND break_end IS NULL) OR
    (break_start IS NOT NULL AND break_end IS NOT NULL
      AND break_start < break_end AND break_start >= start_time
      AND break_end <= end_time)
  )
);

CREATE FUNCTION public.validate_us_location_master_hours()
RETURNS trigger
LANGUAGE plpgsql
AS $us03_hours_trigger$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.us_salon_locations l
    JOIN public.master_salon ms
      ON ms.salon_id=l.salon_id AND ms.master_id=NEW.master_id
      AND ms.status='active'
    JOIN public.tenant_market_settings t ON t.salon_id=l.salon_id
    JOIN public.markets m ON m.id=t.market_id
    WHERE l.id=NEW.location_id AND m.code='US'
  ) THEN
    RAISE EXCEPTION 'US03_LOCATION_MASTER_RELATION_REQUIRED'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$us03_hours_trigger$;

CREATE TRIGGER trg_us_location_master_hours
  BEFORE INSERT OR UPDATE ON public.us_location_master_working_hours
  FOR EACH ROW EXECUTE FUNCTION public.validate_us_location_master_hours();

-- Bookings remain in the existing public.bookings table, and are attached
-- to exactly one physical US salon location through this additive link.
-- The US publicCreateBooking route inserts this link in the SAME transaction.
CREATE TABLE public.us_booking_location_links (
  booking_id integer PRIMARY KEY REFERENCES public.bookings(id) ON DELETE RESTRICT,
  location_id bigint NOT NULL REFERENCES public.us_salon_locations(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX us_booking_location_links_location_idx
  ON public.us_booking_location_links(location_id);

CREATE FUNCTION public.validate_us_booking_location_link()
RETURNS trigger
LANGUAGE plpgsql
AS $us03_link_trigger$
DECLARE
  booking_salon integer;
  location_salon integer;
  location_active boolean;
BEGIN
  SELECT salon_id INTO booking_salon FROM public.bookings
  WHERE id=NEW.booking_id;
  SELECT salon_id, enabled INTO location_salon, location_active
  FROM public.us_salon_locations WHERE id=NEW.location_id;

  IF booking_salon IS NULL OR location_salon IS NULL
     OR booking_salon IS DISTINCT FROM location_salon
     OR location_active IS DISTINCT FROM true
  THEN
    RAISE EXCEPTION 'US03_BOOKING_LOCATION_INVALID_OR_DISABLED'
      USING ERRCODE='23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_market_settings t
    JOIN public.markets m ON m.id=t.market_id
    WHERE t.salon_id=location_salon AND m.code='US'
  ) THEN
    RAISE EXCEPTION 'US03_BOOKING_LINK_REQUIRES_US_MARKET'
      USING ERRCODE='23514';
  END IF;

  IF TG_OP='UPDATE' AND (
       NEW.booking_id IS DISTINCT FROM OLD.booking_id
       OR NEW.location_id IS DISTINCT FROM OLD.location_id
     ) THEN
    RAISE EXCEPTION 'US03_BOOKING_LOCATION_IMMUTABLE'
      USING ERRCODE='23514';
  END IF;

  RETURN NEW;
END;
$us03_link_trigger$;

CREATE TRIGGER trg_us_booking_location_link
  BEFORE INSERT OR UPDATE ON public.us_booking_location_links
  FOR EACH ROW EXECUTE FUNCTION public.validate_us_booking_location_link();

DO $us03_final$
BEGIN
  IF EXISTS(SELECT 1 FROM public.us_booking_location_links)
     OR EXISTS(SELECT 1 FROM public.us_location_master_working_hours)
     OR (SELECT active FROM public.markets WHERE code='US') IS DISTINCT FROM false
     OR (SELECT value FROM public.platform_config WHERE key='default_market_code') IS DISTINCT FROM 'KG' THEN
    RAISE EXCEPTION 'US03_STOP_FINAL_SAFETY_MISMATCH';
  END IF;
END;
$us03_final$;
COMMIT;
