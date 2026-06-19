ALTER TABLE public.money_split_allocations
  ADD COLUMN IF NOT EXISTS created_by_type varchar NOT NULL DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS created_by_id bigint,
  ADD COLUMN IF NOT EXISTS metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'ux_money_split_allocations_provider_settlement_payment_owner_ro'
  ) THEN
    CREATE UNIQUE INDEX ux_money_split_allocations_provider_settlement_payment_owner_ro
      ON public.money_split_allocations (
        provider_settlement_id,
        payment_id,
        owner_type,
        owner_id,
        role_in_split
      );
  END IF;
END
$$;
