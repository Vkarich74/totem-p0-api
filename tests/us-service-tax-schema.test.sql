-- TAX-01 acceptance: run ONLY against disposable restored PostgreSQL staging.
-- Uses pre-existing cloned salon/master/auth user IDs; never creates real profiles.
-- All changes, temporary tables, and fixtures roll back at the end.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout = '20000ms';

DO $test$
DECLARE
  v_salon integer;
  v_master integer;
  v_actor integer;
  v_market bigint;
  v_rate integer;
  v_revision bigint;
  v_before bigint;
BEGIN
  SELECT id INTO v_market FROM public.markets
   WHERE code = 'US' AND default_currency = 'USD' AND active IS TRUE;
  SELECT s.id, ms.master_id INTO v_salon, v_master
    FROM public.salons s
    JOIN public.tenant_market_settings tm ON tm.salon_id = s.id
    JOIN public.master_salon ms ON ms.salon_id = s.id
    JOIN public.masters m ON m.id = ms.master_id
   WHERE s.enabled IS TRUE AND s.status = 'active'
     AND ms.status = 'active' AND m.active IS TRUE
   ORDER BY s.id LIMIT 1;
  SELECT id INTO v_actor FROM public.auth_users
   WHERE enabled IS TRUE ORDER BY id LIMIT 1;

  IF v_salon IS NULL OR v_master IS NULL OR
     v_market IS NULL OR v_actor IS NULL THEN
    RAISE EXCEPTION 'TAX01_TEST_ISOLATED_FIXTURE_UNAVAILABLE';
  END IF;

  IF (SELECT COUNT(*) FROM public.us_owner_service_tax_settings) <> 0
     OR (SELECT COUNT(*) FROM public.us_booking_service_tax_snapshots) <> 0 THEN
    RAISE EXCEPTION 'TAX01_TEST_STARTING_TAX_TABLES_NOT_EMPTY';
  END IF;

  -- A real cloned KG salon cannot set an US tax without US market binding.
  BEGIN
    INSERT INTO public.us_owner_service_tax_settings
      (owner_type, owner_id, market_id, updated_by_user_id)
    VALUES ('salon', v_salon, v_market, v_actor);
    RAISE EXCEPTION 'TAX01_TEST_CROSS_MARKET_ACCEPTED';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: non-US owner refused';
  END;

  -- Local temporary fixture only; this entire transaction is rolled back.
  UPDATE public.tenant_market_settings
     SET market_id = v_market, city_id = NULL,
         locale_override = NULL, currency_override = NULL
   WHERE salon_id = v_salon;

  INSERT INTO public.us_owner_service_tax_settings
    (owner_type, owner_id, market_id, updated_by_user_id)
  VALUES ('salon', v_salon, v_market, v_actor)
  RETURNING rate_bps, revision INTO v_rate, v_revision;

  IF v_rate <> 0 OR v_revision <> 1 THEN
    RAISE EXCEPTION 'TAX01_TEST_DEFAULT_ZERO_FAILED';
  END IF;
  RAISE NOTICE 'PASS: salon tax default 0%%';

  INSERT INTO public.us_owner_service_tax_settings
    (owner_type, owner_id, market_id, rate_bps, updated_by_user_id)
  VALUES ('master', v_master, v_market, 725, v_actor);

  IF NOT EXISTS (
    SELECT 1 FROM public.us_owner_service_tax_settings
     WHERE owner_type = 'master' AND owner_id = v_master
       AND rate_bps = 725 AND market_id = v_market
  ) THEN
    RAISE EXCEPTION 'TAX01_TEST_MASTER_725_FAILED';
  END IF;
  RAISE NOTICE 'PASS: master has independent 7.25%%';

  -- Percent bounds reject -0.01% and 100.01%.
  BEGIN
    UPDATE public.us_owner_service_tax_settings
       SET rate_bps = -1
     WHERE owner_type = 'salon' AND owner_id = v_salon;
    RAISE EXCEPTION 'TAX01_TEST_NEGATIVE_ACCEPTED';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: rate -1 rejected';
  END;

  BEGIN
    UPDATE public.us_owner_service_tax_settings
       SET rate_bps = 10001
     WHERE owner_type = 'salon' AND owner_id = v_salon;
    RAISE EXCEPTION 'TAX01_TEST_OVER_100_ACCEPTED';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: rate above 100%% rejected';
  END;

  UPDATE public.us_owner_service_tax_settings
     SET rate_bps = 10000
   WHERE owner_type = 'salon' AND owner_id = v_salon
   RETURNING rate_bps, revision INTO v_rate, v_revision;

  IF v_rate <> 10000 OR v_revision <> 2 THEN
    RAISE EXCEPTION 'TAX01_TEST_RATE_REVISION_FAILED';
  END IF;
  RAISE NOTICE 'PASS: rate 100%% and revision auto-increment';

  v_before := (SELECT COUNT(*) FROM public.us_booking_service_tax_snapshots);
  BEGIN
    INSERT INTO public.us_booking_service_tax_snapshots
      (booking_id, market_id, collector_owner_type, collector_owner_id,
       collector_revision, tax_setting_revision, service_base_minor,
       rate_bps, service_tax_minor, charge_total_minor)
    VALUES (2147000000, v_market, 'salon', v_salon,
            1, 2, 10000, 10000, 10000, 20000);
    RAISE EXCEPTION 'TAX01_TEST_NO_PRICE_BOOKING_ACCEPTED';
  EXCEPTION WHEN foreign_key_violation OR check_violation THEN
    RAISE NOTICE 'PASS: snapshot requires existing authorized base price';
  END;
  IF (SELECT COUNT(*) FROM public.us_booking_service_tax_snapshots) <> v_before THEN
    RAISE EXCEPTION 'TAX01_TEST_SNAPSHOT_GUARD_FAILED';
  END IF;
END
$test$;

-- Test actual snapshot CHECKs independently with a temp relation
-- carrying the exact production constraints, but no FK dependencies.
CREATE TEMP TABLE tax_snapshot_constraint_probe
  (LIKE public.us_booking_service_tax_snapshots
   INCLUDING DEFAULTS INCLUDING CONSTRAINTS)
ON COMMIT DROP;

INSERT INTO tax_snapshot_constraint_probe
  (booking_id,market_id,collector_owner_type,collector_owner_id,
   collector_revision,service_base_minor,rate_bps,service_tax_minor,
   charge_total_minor,tax_setting_revision)
VALUES
  (1,5,'salon',1,1,10000,0,0,10000,0),
  (2,5,'salon',1,1,10000,725,725,10725,0),
  (3,5,'master',2,1,10000,10000,10000,20000,0),
  (4,5,'master',2,1,1,5000,1,2,0);

DO $test$
BEGIN
  IF (SELECT COUNT(*) FROM tax_snapshot_constraint_probe) <> 4 THEN
    RAISE EXCEPTION 'TAX01_TEST_TAX_MATH_FIXTURE_MISSING';
  END IF;

  BEGIN
    INSERT INTO tax_snapshot_constraint_probe
      (booking_id,market_id,collector_owner_type,collector_owner_id,
       collector_revision,service_base_minor,rate_bps,
       service_tax_minor,charge_total_minor)
    VALUES (5,5,'salon',1,1,10000,725,725,10000);
    RAISE EXCEPTION 'TAX01_TEST_WRONG_TOTAL_ACCEPTED';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: wrong gross total rejected';
  END;

  BEGIN
    INSERT INTO tax_snapshot_constraint_probe
      (booking_id,market_id,collector_owner_type,collector_owner_id,
       collector_revision,service_base_minor,rate_bps,
       service_tax_minor,charge_total_minor)
    VALUES (6,5,'salon',1,1,60000000,10000,60000000,120000000);
    RAISE EXCEPTION 'TAX01_TEST_OVER_MAX_ACCEPTED';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: Stripe amount cap protected';
  END;

  BEGIN
    INSERT INTO tax_snapshot_constraint_probe
      (booking_id,market_id,payment_purpose,collector_owner_type,collector_owner_id,
       collector_revision,service_base_minor,rate_bps,
       service_tax_minor,charge_total_minor)
    VALUES (7,5,'subscription','salon',1,1,10000,0,0,10000);
    RAISE EXCEPTION 'TAX01_TEST_NON_SERVICE_TAX_ACCEPTED';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: non-service tax purpose rejected';
  END;
END
$test$;
ROLLBACK;
