-- Synthetic ONLY! These aliases reference two EXISTING Stripe Sandbox
-- Connect accounts inspected in TEST mode on 17 Nov 2026.
-- They are NOT claimed to belong to a real salon or master.
-- Never apply this fixture to a live environment.
BEGIN;

INSERT INTO public.us_stripe_merchant_bindings (
  market_id, owner_type, owner_id, stripe_connected_account_id,
  verification_status, card_payments_status, charges_enabled, payouts_enabled,
  details_submitted, country, last_checked_at, verified_at
) VALUES
  (3,'salon',100,'acct_1UcJSo8O8H3cMbfR',
   'verified','active',TRUE,TRUE,TRUE,'US',now(),now()),
  (3,'master',200,'acct_1UcJSo8O8HUdcFwl',
   'verified','active',TRUE,TRUE,TRUE,'US',now(),now());

INSERT INTO public.us_stripe_payment_attempts (
  booking_id,market_id,merchant_binding_id,stripe_connected_account_id,
  stripe_payment_intent_id,amount_minor,currency_code
) VALUES
  (500,3,(
    SELECT id FROM public.us_stripe_merchant_bindings
    WHERE owner_type='salon' AND owner_id=100 AND stripe_mode='TEST'
  ),'acct_1UcJSo8O8H3cMbfR','pi_c11_test_salon_500',1050,'USD'),
  (504,3,(
    SELECT id FROM public.us_stripe_merchant_bindings
    WHERE owner_type='master' AND owner_id=200 AND stripe_mode='TEST'
  ),'acct_1UcJSo8O8HUdcFwl','pi_c11_test_master_504',1,'USD');

COMMIT;
