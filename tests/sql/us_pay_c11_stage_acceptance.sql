-- US-PAY-C11-DB: one atomic staging acceptance run (all tests roll back).
-- Requires synthetic fixture and additive migration, never production.
BEGIN;
CREATE FUNCTION public.us_pay_c11_assert(p_valid boolean, p_message text)
RETURNS void LANGUAGE plpgsql AS $fn$
BEGIN
 IF p_valid IS DISTINCT FROM TRUE THEN
   RAISE EXCEPTION 'US_PAY_C11_STAGE_FAIL: %', p_message;
 END IF;
END
$fn$;
CREATE FUNCTION public.us_pay_c11_expect_rejected(p_sql text, p_case text)
RETURNS void LANGUAGE plpgsql AS $fn$
BEGIN
 BEGIN
   EXECUTE p_sql;
 EXCEPTION WHEN OTHERS THEN
   RETURN;
 END;
 RAISE EXCEPTION 'US_PAY_C11_NEGATIVE_NOT_REJECTED: %', p_case;
END
$fn$;

-- US amount_minor=1050 represents exactly $10.50; 1 is one cent.
INSERT INTO public.us_service_price_amounts
 (salon_master_service_id,market_id,amount_minor)
 VALUES (300,3,1050),(302,3,1);
SELECT public.us_pay_c11_assert(
 (SELECT amount_minor FROM public.us_service_price_amounts
   WHERE salon_master_service_id=300)=1050, 'USD_1050');
SELECT public.us_pay_c11_assert(
 (SELECT amount_minor FROM public.us_service_price_amounts
   WHERE salon_master_service_id=302)=1, 'USD_001');

-- Cross-market price, fractional/invalid cents and currency mismatch rejected.
SELECT public.us_pay_c11_expect_rejected(
 $$INSERT INTO public.us_service_price_amounts
   (salon_master_service_id,market_id,amount_minor)
   VALUES (301,1,1000)$$, 'KG_SERVICE_IN_US_PRICES');
SELECT public.us_pay_c11_expect_rejected(
 $$INSERT INTO public.us_service_price_amounts
   (salon_master_service_id,market_id,amount_minor)
   VALUES (303,2,1000)$$, 'KZ_SERVICE_IN_US_PRICES');
SELECT public.us_pay_c11_expect_rejected(
 $$UPDATE public.us_service_price_amounts
   SET amount_minor=0 WHERE salon_master_service_id=300$$, 'ZERO_CENTS');
SELECT public.us_pay_c11_expect_rejected(
 $$UPDATE public.us_service_price_amounts
   SET amount_minor=10.5 WHERE salon_master_service_id=300$$, 'FRACTIONAL_CENTS');
SELECT public.us_pay_c11_expect_rejected(
 $$UPDATE public.us_service_price_amounts
   SET currency_code='KGS' WHERE salon_master_service_id=300$$, 'CURRENCY_KGS');

INSERT INTO public.us_booking_price_snapshots
 (booking_id,market_id,salon_master_service_id,amount_minor,service_price_version)
 VALUES (500,3,300,1050,1),(504,3,302,1,1);
SELECT public.us_pay_c11_assert(
 (SELECT amount_minor FROM public.us_booking_price_snapshots
   WHERE booking_id=500)=1050, 'BOOKING_PRICE_1050');

-- No client catalog/server mismatch, wrong link, or wrong market.
SELECT public.us_pay_c11_expect_rejected(
 $$INSERT INTO public.us_booking_price_snapshots
   (booking_id,market_id,salon_master_service_id,amount_minor,service_price_version)
   VALUES (501,3,300,1000,1)$$, 'WRONG_SNAPSHOT_AMOUNT');
SELECT public.us_pay_c11_expect_rejected(
 $$INSERT INTO public.us_booking_price_snapshots
   (booking_id,market_id,salon_master_service_id,amount_minor,service_price_version)
   VALUES (501,3,302,1,1)$$, 'WRONG_BOOKING_SERVICE');
SELECT public.us_pay_c11_expect_rejected(
 $$INSERT INTO public.us_booking_price_snapshots
   (booking_id,market_id,salon_master_service_id,amount_minor,service_price_version)
   VALUES (502,1,300,1050,1)$$, 'KG_BOOKING_SNAPSHOT');
SELECT public.us_pay_c11_expect_rejected(
 $$UPDATE public.us_booking_price_snapshots SET amount_minor=2000
   WHERE booking_id=500$$, 'IMMUTABLE_BOOKING_PRICE');
SELECT public.us_pay_c11_expect_rejected(
 $$DELETE FROM public.us_booking_price_snapshots WHERE booking_id=500$$,
 'CANNOT_DELETE_PRICE_HISTORY');

-- New USD price gets new version, old booking remains exactly $10.50.
UPDATE public.us_service_price_amounts SET amount_minor=1205
 WHERE salon_master_service_id=300;
SELECT public.us_pay_c11_assert(
 (SELECT price_version FROM public.us_service_price_amounts
  WHERE salon_master_service_id=300)=2, 'VERSION_INCREMENT');
SELECT public.us_pay_c11_assert(
 (SELECT amount_minor FROM public.us_booking_price_snapshots
  WHERE booking_id=500)=1050, 'OLD_PRICE_SNAPSHOT_UNCHANGED');
INSERT INTO public.us_booking_price_snapshots
 (booking_id,market_id,salon_master_service_id,amount_minor,service_price_version)
 VALUES (501,3,300,1205,2);

-- Owner-selected recipient must belong to this booking, not an arbitrary party.
INSERT INTO public.us_booking_payment_collectors
 (booking_id,market_id,collector_owner_type,collector_owner_id,
  selection_source,selected_by_user_id,verification_status,verified_at)
 VALUES (500,3,'salon',100,'owner_authorized',900,'verified',now());
SELECT public.us_pay_c11_assert(
 (SELECT collector_owner_id FROM public.us_booking_payment_collectors
  WHERE booking_id=500)=100, 'OWNER_COLLECTOR');
SELECT public.us_pay_c11_expect_rejected(
 $$INSERT INTO public.us_booking_payment_collectors
   (booking_id,market_id,collector_owner_type,collector_owner_id,
    selection_source,selected_by_user_id,verification_status,verified_at)
   VALUES (501,3,'master',9999,'owner_authorized',900,'verified',now())$$,
 'UNRELATED_OWNER_ID');
SELECT public.us_pay_c11_expect_rejected(
 $$INSERT INTO public.us_booking_payment_collectors
   (booking_id,market_id,collector_owner_type,collector_owner_id,
    selection_source,selected_by_user_id,verification_status)
   VALUES (502,1,'salon',101,'owner_authorized',900,'pending')$$,
 'KG_COLLECTOR_CROSS_MARKET');
SELECT public.us_pay_c11_expect_rejected(
 $$UPDATE public.us_booking_payment_collectors
   SET collector_owner_type='master',collector_owner_id=200
    WHERE booking_id=500$$, 'VERIFIED_RECIPIENT_SWAP');
SELECT public.us_pay_c11_expect_rejected(
 $$UPDATE public.us_booking_payment_collectors
   SET verification_status='verified',verified_at=NULL
    WHERE booking_id=500$$, 'FALSE_VERIFIED_NO_TIMESTAMP');

-- No writes or triggers in historic payments, payouts, wallet.
SELECT public.us_pay_c11_assert(
 (SELECT count(*) FROM public.pg_tables
   WHERE schemaname='public' AND tablename LIKE 'us_%')=3,
 'THREE_US_SIDECAR_TABLES_ONLY');
SELECT public.us_pay_c11_assert(
 (SELECT count(*) FROM pg_trigger
   WHERE tgrelid='public.us_booking_price_snapshots'::regclass AND NOT tgisinternal)=2,
 'SNAPSHOT_GUARDS_PRESENT');
SELECT public.us_pay_c11_assert(
 (SELECT count(*) FROM pg_trigger
   WHERE tgrelid='public.us_booking_payment_collectors'::regclass AND NOT tgisinternal)=1,
 'COLLECTOR_GUARD_PRESENT');
SELECT 'US_PAY_C11_DB_ACCEPTANCE_PASS' AS result;
ROLLBACK;
