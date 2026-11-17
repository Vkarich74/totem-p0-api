-- US-PAY-C11 LIVE onboarding isolated PG17 acceptance.
-- All seller IDs/sessions/slugs are synthetic. No Stripe LIVE network requests.
BEGIN;
ALTER TABLE public.salons ADD COLUMN slug text;
ALTER TABLE public.masters ADD COLUMN slug text;
ALTER TABLE public.masters ADD COLUMN user_id integer;

UPDATE public.salons SET slug = CASE id
 WHEN 100 THEN 'synthetic-us-salon'
 WHEN 101 THEN 'synthetic-kg-salon'
 WHEN 102 THEN 'synthetic-kz-salon'
 ELSE 'synthetic-other' END;

UPDATE public.masters SET
  slug=CASE id
    WHEN 200 THEN 'synthetic-us-master'
    WHEN 201 THEN 'synthetic-kg-master'
    WHEN 202 THEN 'synthetic-kz-master'
    ELSE 'synthetic-other-master' END,
  user_id=CASE id WHEN 200 THEN 901 ELSE NULL END;

INSERT INTO public.bookings
  (id,salon_id,master_id,service_id,client_id,currency_code,status)
VALUES
  (510,100,200,400,55,'USD','reserved'),
  (511,100,200,400,55,'USD','reserved');
INSERT INTO public.us_booking_price_snapshots
  (booking_id,market_id,salon_master_service_id,amount_minor,service_price_version)
VALUES
  (510,3,300,1205,2),
  (511,3,300,1205,2);
INSERT INTO public.us_booking_payment_collectors
  (booking_id,market_id,collector_owner_type,collector_owner_id,
   selection_source,selected_by_user_id,verification_status,verified_at)
VALUES
  (510,3,'salon',100,'owner_authorized',900,'pending',NULL),
  (511,3,'master',200,'owner_authorized',900,'pending',NULL);
COMMIT;
