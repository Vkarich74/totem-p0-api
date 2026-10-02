BEGIN;

ALTER TABLE public.contracts ADD COLUMN currency_code text NULL;
ALTER TABLE public.services ADD COLUMN currency_code text NULL;
ALTER TABLE public.services_v2 ADD COLUMN currency_code text NULL;
ALTER TABLE public.salon_master_services ADD COLUMN currency_code text NULL;
ALTER TABLE public.bookings ADD COLUMN currency_code text NULL;
ALTER TABLE public.payments ADD COLUMN currency_code text NULL;
ALTER TABLE public.payment_refunds ADD COLUMN currency_code text NULL;
ALTER TABLE public.payouts ADD COLUMN currency_code text NULL;
ALTER TABLE public.settlement_items ADD COLUMN currency_code text NULL;
ALTER TABLE public.settlement_periods ADD COLUMN currency_code text NULL;
ALTER TABLE public.settlement_payout_batches ADD COLUMN currency_code text NULL;
ALTER TABLE public.settlement_reconciliation_reports ADD COLUMN currency_code text NULL;
ALTER TABLE public.money_reconciliation_mismatches ADD COLUMN currency_code text NULL;
ALTER TABLE public.withdraw_settings ADD COLUMN currency_code text NULL;
ALTER TABLE public.withdraws ADD COLUMN currency_code text NULL;

ALTER TABLE public.contracts ADD CONSTRAINT contracts_currency_code_check
  CHECK (currency_code IS NULL OR currency_code ~ '^[A-Z]{3}$');
ALTER TABLE public.services ADD CONSTRAINT services_currency_code_check
  CHECK (currency_code IS NULL OR currency_code ~ '^[A-Z]{3}$');
ALTER TABLE public.services_v2 ADD CONSTRAINT services_v2_currency_code_check
  CHECK (currency_code IS NULL OR currency_code ~ '^[A-Z]{3}$');
ALTER TABLE public.salon_master_services ADD CONSTRAINT salon_master_services_currency_code_check
  CHECK (currency_code IS NULL OR currency_code ~ '^[A-Z]{3}$');
ALTER TABLE public.bookings ADD CONSTRAINT bookings_currency_code_check
  CHECK (currency_code IS NULL OR currency_code ~ '^[A-Z]{3}$');
ALTER TABLE public.payments ADD CONSTRAINT payments_currency_code_check
  CHECK (currency_code IS NULL OR currency_code ~ '^[A-Z]{3}$');
ALTER TABLE public.payment_refunds ADD CONSTRAINT payment_refunds_currency_code_check
  CHECK (currency_code IS NULL OR currency_code ~ '^[A-Z]{3}$');
ALTER TABLE public.payouts ADD CONSTRAINT payouts_currency_code_check
  CHECK (currency_code IS NULL OR currency_code ~ '^[A-Z]{3}$');
ALTER TABLE public.settlement_items ADD CONSTRAINT settlement_items_currency_code_check
  CHECK (currency_code IS NULL OR currency_code ~ '^[A-Z]{3}$');
ALTER TABLE public.settlement_periods ADD CONSTRAINT settlement_periods_currency_code_check
  CHECK (currency_code IS NULL OR currency_code ~ '^[A-Z]{3}$');
ALTER TABLE public.settlement_payout_batches ADD CONSTRAINT settlement_payout_batches_currency_code_check
  CHECK (currency_code IS NULL OR currency_code ~ '^[A-Z]{3}$');
ALTER TABLE public.settlement_reconciliation_reports ADD CONSTRAINT settlement_reconciliation_reports_currency_code_check
  CHECK (currency_code IS NULL OR currency_code ~ '^[A-Z]{3}$');
ALTER TABLE public.money_reconciliation_mismatches ADD CONSTRAINT money_reconciliation_mismatches_currency_code_check
  CHECK (currency_code IS NULL OR currency_code ~ '^[A-Z]{3}$');
ALTER TABLE public.withdraw_settings ADD CONSTRAINT withdraw_settings_currency_code_check
  CHECK (currency_code IS NULL OR currency_code ~ '^[A-Z]{3}$');
ALTER TABLE public.withdraws ADD CONSTRAINT withdraws_currency_code_check
  CHECK (currency_code IS NULL OR currency_code ~ '^[A-Z]{3}$');

UPDATE public.contracts SET currency_code='KGS' WHERE currency_code IS NULL;
UPDATE public.services SET currency_code='KGS' WHERE currency_code IS NULL;
UPDATE public.services_v2 SET currency_code='KGS' WHERE currency_code IS NULL;
UPDATE public.salon_master_services SET currency_code='KGS' WHERE currency_code IS NULL;
UPDATE public.bookings SET currency_code='KGS' WHERE currency_code IS NULL;
UPDATE public.payments SET currency_code='KGS' WHERE currency_code IS NULL;
UPDATE public.payment_refunds SET currency_code='KGS' WHERE currency_code IS NULL;
UPDATE public.payouts SET currency_code='KGS' WHERE currency_code IS NULL;
UPDATE public.settlement_items SET currency_code='KGS' WHERE currency_code IS NULL;
UPDATE public.settlement_periods SET currency_code='KGS' WHERE currency_code IS NULL;
UPDATE public.settlement_payout_batches SET currency_code='KGS' WHERE currency_code IS NULL;
UPDATE public.settlement_reconciliation_reports SET currency_code='KGS' WHERE currency_code IS NULL;
UPDATE public.money_reconciliation_mismatches SET currency_code='KGS' WHERE currency_code IS NULL;
UPDATE public.withdraw_settings SET currency_code='KGS' WHERE currency_code IS NULL;
UPDATE public.withdraws SET currency_code='KGS' WHERE currency_code IS NULL;

COMMIT;
