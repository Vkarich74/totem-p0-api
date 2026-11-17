-- US-PAY-C11-API, synthetic-only disposable PostgreSQL staging.
-- Applied AFTER stage acceptance (which rolls back its temporary records).
BEGIN;

INSERT INTO public.us_service_price_amounts
  (salon_master_service_id, market_id, amount_minor)
VALUES
  (300, 3, 1050),
  (302, 3, 1);

INSERT INTO public.us_booking_price_snapshots
  (booking_id, market_id, salon_master_service_id, amount_minor, service_price_version)
VALUES
  (500, 3, 300, 1050, 1),
  (504, 3, 302, 1, 1);

-- Owner choices are synthetic test records, not a substitute for live owner auth.
INSERT INTO public.us_booking_payment_collectors
  (booking_id, market_id, collector_owner_type, collector_owner_id,
   selection_source, selected_by_user_id, verification_status, verified_at)
VALUES
  (500, 3, 'salon', 100, 'owner_authorized', 900, 'verified', now()),
  (504, 3, 'master', 200, 'owner_authorized', 900, 'verified', now()),
  (501, 3, 'salon', 100, 'owner_authorized', 900, 'pending', NULL);

-- Current catalog moves to $12.05; immutable historical booking stays $10.50.
UPDATE public.us_service_price_amounts
   SET amount_minor = 1205
 WHERE salon_master_service_id = 300;

COMMIT;
