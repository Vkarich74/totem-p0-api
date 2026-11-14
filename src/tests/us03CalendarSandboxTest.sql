-- US-03 LOCAL PG ONLY; requires US-02 + US-03 migrations applied locally.
-- All fixture rows are rolled back. This script has no production DB path.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

DO $us03_qa$
DECLARE
  us_market_id bigint;
  test_salon integer;
  test_master integer;
  ny_id bigint;
  az_id bigint;
  legacy_salon integer;
  inserted integer;
BEGIN
  SELECT id INTO us_market_id FROM public.markets
    WHERE code='US' AND active=false;
  IF us_market_id IS NULL THEN
    RAISE EXCEPTION 'US03_TEST_INACTIVE_US_MARKET_REQUIRED';
  END IF;
  IF (SELECT value FROM public.platform_config WHERE key='default_market_code') <> 'KG' THEN
    RAISE EXCEPTION 'US03_TEST_DEFAULT_MARKET_MODIFIED';
  END IF;
  IF (SELECT count(*) FROM public.us_booking_location_links) <> 0
     OR (SELECT count(*) FROM public.us_location_master_working_hours) <> 0 THEN
    RAISE EXCEPTION 'US03_TEST_TABLE_NOT_EMPTY';
  END IF;
  SELECT id INTO test_master FROM public.masters ORDER BY id LIMIT 1;
  IF test_master IS NULL THEN
    RAISE EXCEPTION 'US03_TEST_FIXTURE_MASTER_MISSING';
  END IF;
  SELECT coalesce(max(id),0)+110000 INTO test_salon FROM public.salons;

  INSERT INTO public.salons (id, slug, name, status)
  VALUES (test_salon,'us03-calendar-sandbox-only','US03 Isolated QA','active');
  INSERT INTO public.tenant_market_settings (salon_id,market_id)
  VALUES (test_salon,us_market_id);
  INSERT INTO public.master_salon (master_id,salon_id,status)
  VALUES (test_master,test_salon,'active');

  INSERT INTO public.us_salon_locations
    (salon_id,location_code,state_code,city_name,street_line1,
     postal_code,timezone_name,is_primary,enabled)
  VALUES
    (test_salon,'new-york','NY','New York','111 Test Street',
     '10001','America/New_York',true,false)
  RETURNING id INTO ny_id;

  INSERT INTO public.us_salon_locations
    (salon_id,location_code,state_code,city_name,street_line1,
     postal_code,timezone_name,is_primary,enabled)
  VALUES
    (test_salon,'phoenix','AZ','Phoenix','222 Example Road',
     '85001','America/Phoenix',false,false)
  RETURNING id INTO az_id;

  INSERT INTO public.us_location_master_working_hours
    (location_id,master_id,weekday,start_time,end_time,break_start,break_end)
  VALUES
    (ny_id,test_master,0,'01:00','04:00',NULL,NULL),
    (az_id,test_master,0,'09:00','17:00','12:00','13:00');

  SELECT count(*) INTO inserted
    FROM public.us_location_master_working_hours
    WHERE master_id=test_master;
  IF inserted <> 2 THEN RAISE EXCEPTION 'US03_TEST_LOCATION_MASTER_HOURS_INSERT'; END IF;

  -- Overlapping schedules between branches are not itself an overlap
  -- if they occur at different UTC instants; booking is later checked against
  -- ALL occupied intervals for the same master across all locations.

  -- Block duplicate weekly location/master schedule.
  BEGIN
    INSERT INTO public.us_location_master_working_hours
      (location_id,master_id,weekday,start_time,end_time)
    VALUES (ny_id,test_master,0,'09:00','18:00');
    RAISE EXCEPTION 'US03_TEST_DUPLICATE_HOURS_ALLOWED';
  EXCEPTION WHEN unique_violation THEN
    IF position('us_location_master_hours_pk' in SQLERRM)=0 THEN RAISE; END IF;
  END;

  -- Block impossible break, preserve KG/KZ schedules.
  BEGIN
    INSERT INTO public.us_location_master_working_hours
      (location_id,master_id,weekday,start_time,end_time,break_start,break_end)
    VALUES (ny_id,test_master,1,'09:00','17:00','18:00','19:00');
    RAISE EXCEPTION 'US03_TEST_BAD_BREAK_ALLOWED';
  EXCEPTION WHEN check_violation THEN
    IF position('us_location_master_hours_break_check' in SQLERRM)=0 THEN RAISE; END IF;
  END;

  -- A US booking link cannot be created for a location that has not been
  -- activated through the separately locked US02 release gate.
  BEGIN
    INSERT INTO public.us_booking_location_links (booking_id,location_id)
    VALUES (2147483000,ny_id);
    RAISE EXCEPTION 'US03_TEST_INACTIVE_LOCATION_LINK_ALLOWED';
  EXCEPTION WHEN check_violation THEN
    IF position('US03_BOOKING_LOCATION_INVALID_OR_DISABLED' in SQLERRM)=0 THEN
      RAISE;
    END IF;
  END;

  -- American local->UTC calendar window has date-dependent elapsed hours.
  IF ((timestamp '2026-03-09 00:00' AT TIME ZONE 'America/New_York') -
      (timestamp '2026-03-08 00:00' AT TIME ZONE 'America/New_York'))
        <> interval '23 hours' THEN
    RAISE EXCEPTION 'US03_TEST_SPRING_23_HOURS';
  END IF;
  IF ((timestamp '2026-11-02 00:00' AT TIME ZONE 'America/New_York') -
      (timestamp '2026-11-01 00:00' AT TIME ZONE 'America/New_York'))
        <> interval '25 hours' THEN
    RAISE EXCEPTION 'US03_TEST_AUTUMN_25_HOURS';
  END IF;

  IF (SELECT status FROM public.countries WHERE code='US') <> 'planned'
     OR (SELECT active FROM public.markets WHERE code='US') <> false
     OR (SELECT count(*) FROM public.us_timezones) <> 29
     OR (SELECT count(*) FROM public.us_states) <> 51 THEN
    RAISE EXCEPTION 'US03_TEST_CATALOG_OR_MARKET_DRIFT';
  END IF;
END;
$us03_qa$;

ROLLBACK;
