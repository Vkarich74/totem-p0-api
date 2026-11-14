-- TOTEM US02: sandbox-only SQL tests (designed to ROLLBACK all test rows).
-- Requires US02 migration already applied to a LOCAL restored database.
-- Never run against Production.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $us02_test$
DECLARE
  target_salon integer;
  kg_salon integer;
  code_row record;
  test_count integer := 0;
  us_market_id bigint;
  winter_ny numeric;
  summer_ny numeric;
  winter_phoenix numeric;
  summer_phoenix numeric;
BEGIN
  SELECT id INTO us_market_id FROM public.markets WHERE code = 'US';
  IF us_market_id IS NULL THEN
    RAISE EXCEPTION 'US02_TEST_US_MARKET_ABSENT';
  END IF;
  IF (SELECT active FROM public.markets WHERE id = us_market_id) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'US02_TEST_MARKET_MUST_STAY_INACTIVE';
  END IF;
  IF (SELECT status FROM public.countries WHERE code='US') IS DISTINCT FROM 'planned' THEN
    RAISE EXCEPTION 'US02_TEST_COUNTRY_MUST_STAY_PLANNED';
  END IF;
  IF (SELECT count(*) FROM public.us_states WHERE kind='state') <> 50
     OR (SELECT count(*) FROM public.us_states WHERE kind='federal_district') <> 1
     OR (SELECT count(*) FROM public.us_timezones) <> 29 THEN
    RAISE EXCEPTION 'US02_TEST_CATALOG_COUNT';
  END IF;

  -- Nonpersistent US fixture with no real customer details.
  SELECT coalesce(max(id), 0) + 100000 INTO target_salon FROM public.salons;
  INSERT INTO public.salons (id, slug, name, status)
  VALUES (target_salon, 'us02-local-sandbox-test', 'US02 Isolation Only', 'active');
  INSERT INTO public.tenant_market_settings (salon_id, market_id)
  VALUES (target_salon, us_market_id);

  -- Every one of 50 states + DC accepts a US-only draft location.
  -- 'America/New_York' here is ONLY a representative valid US IANA zone
  -- for testing the state FK; it is NOT asserted correct for each state.
  FOR code_row IN SELECT code FROM public.us_states ORDER BY code LOOP
    INSERT INTO public.us_salon_locations (
      salon_id, location_code, state_code, city_name,
      street_line1, postal_code, timezone_name, is_primary, enabled
    ) VALUES (
      target_salon, 'catalog-' || lower(code_row.code), code_row.code,
      'Test City', '123 Test Street', '00501', 'America/New_York',
      false, false
    );
    test_count := test_count + 1;
  END LOOP;
  IF test_count <> 51 OR
     (SELECT count(*) FROM public.us_salon_locations WHERE salon_id=target_salon) <> 51 THEN
    RAISE EXCEPTION 'US02_TEST_NOT_ALL_JURISDICTIONS_ACCEPTED';
  END IF;

  -- Explicit per-location IANA timezones, including Arizona (no DST),
  -- Alaska and Hawaii, and ZIP+4.
  INSERT INTO public.us_salon_locations (
    salon_id, location_code, state_code, city_name, street_line1,
    street_line2, postal_code, timezone_name, is_primary
  ) VALUES
    (target_salon, 'new-york-main', 'NY', 'New York', '123 Test St',
     'Suite 2', '10001-0001', 'America/New_York', true),
    (target_salon, 'phoenix-branch', 'AZ', 'Phoenix', '456 Example St',
     NULL, '85001', 'America/Phoenix', false),
    (target_salon, 'anchorage-branch', 'AK', 'Anchorage', '789 Example St',
     NULL, '99501', 'America/Anchorage', false),
    (target_salon, 'honolulu-branch', 'HI', 'Honolulu', '101 Example St',
     NULL, '96801', 'Pacific/Honolulu', false),
    (target_salon, 'chicago-branch', 'IL', 'Chicago', '202 Example St',
     NULL, '60601', 'America/Chicago', false);

  IF (SELECT count(*) FROM public.us_salon_locations WHERE salon_id=target_salon) <> 56
     OR (SELECT count(*) FROM public.us_salon_locations
         WHERE salon_id=target_salon AND is_primary) <> 1
     OR (SELECT count(DISTINCT timezone_name) FROM public.us_salon_locations
         WHERE salon_id=target_salon) <> 5 THEN
    RAISE EXCEPTION 'US02_TEST_MULTI_LOCATION_OR_PRIMARY_INVALID';
  END IF;

  -- A second primary site MUST fail unique constraint.
  BEGIN
    INSERT INTO public.us_salon_locations (
      salon_id, location_code, state_code, city_name, street_line1,
      postal_code, timezone_name, is_primary
    ) VALUES (target_salon,'second-primary','TX','Dallas','Test St',
              '75201','America/Chicago',true);
    RAISE EXCEPTION 'US02_TEST_SECOND_PRIMARY_NOT_REJECTED';
  EXCEPTION WHEN unique_violation THEN
    IF position('us_salon_locations_one_primary_per_salon_idx' in SQLERRM) = 0 THEN
      RAISE;
    END IF;
  END;

  -- Territory not quietly accepted as a state.
  BEGIN
    INSERT INTO public.us_salon_locations (
      salon_id, location_code, state_code, city_name, street_line1,
      postal_code, timezone_name
    ) VALUES (target_salon,'territory-invalid','PR','Test City','Test St',
              '00901','America/New_York');
    RAISE EXCEPTION 'US02_TEST_TERRITORY_NOT_REJECTED';
  EXCEPTION WHEN foreign_key_violation THEN
    IF position('us_salon_locations_state_code_fkey' in SQLERRM) = 0 THEN
      RAISE;
    END IF;
  END;

  -- U.S. location cannot inherit 'Etc/UTC' or an unrelated IANA zone.
  BEGIN
    INSERT INTO public.us_salon_locations (
      salon_id, location_code, state_code, city_name, street_line1,
      postal_code, timezone_name
    ) VALUES (target_salon,'utc-invalid','CA','Test City','Test St',
              '90210','Etc/UTC');
    RAISE EXCEPTION 'US02_TEST_UTC_FALLBACK_NOT_REJECTED';
  EXCEPTION WHEN foreign_key_violation THEN
    IF position('us_salon_locations_timezone_name_fkey' in SQLERRM) = 0 THEN
      RAISE;
    END IF;
  END;

  BEGIN
    INSERT INTO public.us_salon_locations (
      salon_id, location_code, state_code, city_name, street_line1,
      postal_code, timezone_name
    ) VALUES (target_salon,'foreign-invalid','CA','Test City','Test St',
              '90210','America/Argentina/Buenos_Aires');
    RAISE EXCEPTION 'US02_TEST_FOREIGN_ZONE_NOT_REJECTED';
  EXCEPTION WHEN foreign_key_violation THEN
    IF position('us_salon_locations_timezone_name_fkey' in SQLERRM) = 0 THEN
      RAISE;
    END IF;
  END;

  BEGIN
    INSERT INTO public.us_salon_locations (
      salon_id, location_code, state_code, city_name, street_line1,
      postal_code, timezone_name
    ) VALUES (target_salon,'zip-invalid','CA','Test City','Test St',
              '9021','America/Los_Angeles');
    RAISE EXCEPTION 'US02_TEST_BAD_ZIP_NOT_REJECTED';
  EXCEPTION WHEN check_violation THEN
    IF position('us_salon_locations_zip_check' in SQLERRM) = 0 THEN
      RAISE;
    END IF;
  END;

  BEGIN
    INSERT INTO public.us_salon_locations (
      salon_id, location_code, state_code, city_name, street_line1,
      postal_code, timezone_name, enabled
    ) VALUES (target_salon,'early-enable','CA','Test City','Test St',
              '90210','America/Los_Angeles',true);
    RAISE EXCEPTION 'US02_TEST_EARLY_ENABLE_NOT_REJECTED';
  EXCEPTION WHEN check_violation THEN
    IF position('US02_LOCATION_ACTIVATION_LOCKED' in SQLERRM) = 0 THEN
      RAISE;
    END IF;
  END;

  -- Existing KG tenant must not get a US location.
  SELECT t.salon_id INTO kg_salon
    FROM public.tenant_market_settings t
    JOIN public.markets m ON m.id = t.market_id
    WHERE m.code = 'KG'
    LIMIT 1;
  IF kg_salon IS NULL THEN
    RAISE EXCEPTION 'US02_TEST_KG_SALON_MISSING';
  END IF;
  BEGIN
    INSERT INTO public.us_salon_locations (
      salon_id, location_code, state_code, city_name, street_line1,
      postal_code, timezone_name
    ) VALUES (kg_salon, 'blocked-kg', 'CA','Test City','Test St',
              '90210','America/Los_Angeles');
    RAISE EXCEPTION 'US02_TEST_KG_SALON_NOT_BLOCKED';
  EXCEPTION WHEN check_violation THEN
    IF position('US02_LOCATION_REQUIRES_US_TENANT' in SQLERRM) = 0 THEN
      RAISE;
    END IF;
  END;

  -- IANA offset behavior remains date-specific: New York DST; Phoenix not.
  SELECT extract(epoch FROM
    (timestamp '2026-01-15 12:00:00' AT TIME ZONE 'America/New_York') -
    (timestamp '2026-01-15 12:00:00' AT TIME ZONE 'UTC')) / 3600
  INTO winter_ny;
  SELECT extract(epoch FROM
    (timestamp '2026-07-15 12:00:00' AT TIME ZONE 'America/New_York') -
    (timestamp '2026-07-15 12:00:00' AT TIME ZONE 'UTC')) / 3600
  INTO summer_ny;
  SELECT extract(epoch FROM
    (timestamp '2026-01-15 12:00:00' AT TIME ZONE 'America/Phoenix') -
    (timestamp '2026-01-15 12:00:00' AT TIME ZONE 'UTC')) / 3600
  INTO winter_phoenix;
  SELECT extract(epoch FROM
    (timestamp '2026-07-15 12:00:00' AT TIME ZONE 'America/Phoenix') -
    (timestamp '2026-07-15 12:00:00' AT TIME ZONE 'UTC')) / 3600
  INTO summer_phoenix;
  IF winter_ny <> 5 OR summer_ny <> 4 OR
     winter_phoenix <> 7 OR summer_phoenix <> 7 THEN
    RAISE EXCEPTION 'US02_TEST_TZDB_DST_OFFSET_MISMATCH';
  END IF;
END;
$us02_test$;

-- Do not persist mock salons/tenant bindings/locations.
ROLLBACK;
