-- US-07: enable ONLY existing, owner-verified US locations.
-- No US salons, masters, appointments, sample/draft rows or providers created.
-- Existing KG/KZ tenants, markets, and platform default are untouched.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '45s';

DO $us07_pre$
BEGIN
  IF (SELECT value FROM public.platform_config WHERE key='default_market_code') IS DISTINCT FROM 'KG'
     OR (SELECT active FROM public.markets WHERE code='KG') IS DISTINCT FROM true
     OR (SELECT active FROM public.markets WHERE code='KZ') IS DISTINCT FROM true
     OR NOT EXISTS (SELECT 1 FROM public.markets
          WHERE code='US' AND active=true AND country_code='US'
            AND default_currency='USD' AND country_pack_code='US'
            AND country_pack_version='1')
     OR (SELECT status FROM public.countries WHERE code='US') IS DISTINCT FROM 'active'
     OR to_regclass('public.us_salon_locations') IS NULL
     OR to_regclass('public.us_location_geo_verifications') IS NULL
     OR to_regprocedure('public.us_geo_location_fingerprint(text,text,text,text,text,text)') IS NOT NULL
     OR COALESCE(pg_get_functiondef(to_regprocedure('public.validate_us_salon_location_row()')),'')
          NOT LIKE '%US02_LOCATION_ACTIVATION_LOCKED%'
     OR EXISTS (SELECT 1 FROM public.us_salon_locations WHERE enabled)
  THEN
    RAISE EXCEPTION 'US07_STOP_PRECONDITION_CHANGED';
  END IF;
END;
$us07_pre$;

-- Byte-for-byte equivalent to usGeoAddressFingerprint() in Node:
-- upper-case ASCII words, collapse punctuation to spaces, ASCII US delimiter.
-- PostgreSQL 17 provides built-in sha256(bytea), so pgcrypto is not needed.
CREATE FUNCTION public.us_geo_location_fingerprint(
  p_state text,p_city text,p_street1 text,p_street2 text,
  p_postal text,p_tz text
) RETURNS text LANGUAGE sql IMMUTABLE
AS $fingerprint$
  SELECT encode(sha256(convert_to(
    upper(coalesce(p_state,'')) || chr(31) ||
    btrim(regexp_replace(upper(coalesce(p_city,'')), '[^A-Z0-9]+', ' ', 'g')) || chr(31) ||
    btrim(regexp_replace(upper(coalesce(p_street1,'')), '[^A-Z0-9]+', ' ', 'g')) || chr(31) ||
    btrim(regexp_replace(upper(coalesce(p_street2,'')), '[^A-Z0-9]+', ' ', 'g')) || chr(31) ||
    coalesce(p_postal,'') || chr(31) || coalesce(p_tz,''),
    'UTF8')),'hex')
$fingerprint$;

-- The existing enabled BEFORE INSERT/UPDATE trigger is kept. Replace only
-- its function. An INSERT enabled=true is impossible without prior evidence.
CREATE OR REPLACE FUNCTION public.validate_us_salon_location_row()
RETURNS trigger LANGUAGE plpgsql AS $us07_location_guard$
BEGIN
  IF TG_OP='UPDATE' AND NEW.salon_id IS DISTINCT FROM OLD.salon_id THEN
    RAISE EXCEPTION 'US02_LOCATION_SALON_IMMUTABLE'
      USING ERRCODE='23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_market_settings t
    JOIN public.markets m ON m.id=t.market_id
    WHERE t.salon_id=NEW.salon_id AND m.code='US'
      AND m.country_code='US' AND m.active=true
  ) THEN
    RAISE EXCEPTION 'US07_LOCATION_REQUIRES_ACTIVE_US_TENANT'
      USING ERRCODE='23514';
  END IF;

  -- Physical address and timezone stay immutable while location is active.
  IF TG_OP='UPDATE' AND OLD.enabled=true AND (
       NEW.state_code IS DISTINCT FROM OLD.state_code
       OR NEW.city_name IS DISTINCT FROM OLD.city_name
       OR NEW.street_line1 IS DISTINCT FROM OLD.street_line1
       OR NEW.street_line2 IS DISTINCT FROM OLD.street_line2
       OR NEW.postal_code IS DISTINCT FROM OLD.postal_code
       OR NEW.timezone_name IS DISTINCT FROM OLD.timezone_name
     ) THEN
    RAISE EXCEPTION 'US07_ACTIVE_LOCATION_ADDRESS_IMMUTABLE'
      USING ERRCODE='23514';
  END IF;

  IF NEW.enabled THEN
    IF TG_OP='INSERT' THEN
      RAISE EXCEPTION 'US07_LOCATION_REQUIRES_PRIOR_VERIFICATION'
        USING ERRCODE='23514';
    END IF;
    IF OLD.enabled IS NOT TRUE AND NOT EXISTS (
      SELECT 1 FROM public.us_location_geo_verifications g
      WHERE g.location_id=NEW.id
        AND g.status='VERIFIED_GEOMETRY'
        AND cardinality(g.reasons)=0
        AND g.checked_at<=now() AND g.expires_at>now()
        AND g.source_version='2026d'
        AND g.dataset_sha256='2da5f1e980e70f53c781e1416e8e47bee03b98160353951c886a9901f525550a'
        AND g.census_benchmark='Public_AR_Current'
        AND g.census_state_code=NEW.state_code
        AND g.census_zip5=left(NEW.postal_code,5)
        AND g.resolved_timezone=NEW.timezone_name
        AND g.boundary_distance_m>=250
        AND g.address_fingerprint_sha256=public.us_geo_location_fingerprint(
          NEW.state_code,NEW.city_name,NEW.street_line1,NEW.street_line2,
          NEW.postal_code,NEW.timezone_name)
    ) THEN
      RAISE EXCEPTION 'US07_LOCATION_VERIFIED_EVIDENCE_REQUIRED'
        USING ERRCODE='23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$us07_location_guard$;

DO $us07_post$
BEGIN
  IF to_regprocedure('public.us_geo_location_fingerprint(text,text,text,text,text,text)') IS NULL
     OR NOT EXISTS(
       SELECT 1 FROM pg_trigger
       WHERE tgrelid='public.us_salon_locations'::regclass
         AND tgname='trg_validate_us_salon_location_row'
         AND tgenabled='O' AND NOT tgisinternal)
     OR EXISTS(SELECT 1 FROM public.us_salon_locations WHERE enabled)
     OR (SELECT value FROM public.platform_config WHERE key='default_market_code') IS DISTINCT FROM 'KG'
     OR (SELECT active FROM public.markets WHERE code='KG') IS DISTINCT FROM true
     OR (SELECT active FROM public.markets WHERE code='KZ') IS DISTINCT FROM true
  THEN
    RAISE EXCEPTION 'US07_STOP_POSTCONDITION_FAILED';
  END IF;
END;
$us07_post$;
COMMIT;
