BEGIN;

ALTER TABLE public.money_owner_obligations
  DROP CONSTRAINT IF EXISTS money_owner_obligations_source_type_check;

ALTER TABLE public.money_owner_obligations
  ADD CONSTRAINT money_owner_obligations_source_type_check
  CHECK (source_type = ANY (ARRAY['owner_qr_payment'::text, 'direct_payment'::text]));

ALTER TABLE public.money_owner_obligations
  DROP CONSTRAINT IF EXISTS money_owner_obligations_obligation_type_check;

ALTER TABLE public.money_owner_obligations
  ADD CONSTRAINT money_owner_obligations_obligation_type_check
  CHECK (obligation_type = ANY (ARRAY['owner_qr_split_due'::text, 'platform_fee_due'::text, 'direct_cash_split_due'::text]));

COMMIT;
