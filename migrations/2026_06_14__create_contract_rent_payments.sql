BEGIN;

CREATE TABLE IF NOT EXISTS public.contract_rent_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  obligation_id uuid NOT NULL REFERENCES public.contract_rent_obligations(id) ON DELETE CASCADE,

  contract_salon_id text NOT NULL,
  contract_master_id text NOT NULL,
  salon_id integer NOT NULL REFERENCES public.salons(id),
  master_id integer NOT NULL REFERENCES public.masters(id),

  amount integer NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'KGS' CHECK (length(trim(currency)) > 0),

  provider text NOT NULL DEFAULT 'manual' CHECK (length(trim(provider)) > 0),
  payment_method text NULL,

  status text NOT NULL CHECK (status IN ('pending', 'confirmed', 'voided', 'cancelled')),

  idempotency_key text NOT NULL,

  confirmed_at timestamptz NULL,
  voided_at timestamptz NULL,
  cancelled_at timestamptz NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT contract_rent_payments_contract_ids_match_check
    CHECK (
      contract_salon_id = salon_id::text
      AND contract_master_id = master_id::text
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS contract_rent_payments_provider_idempotency_uniq
  ON public.contract_rent_payments(provider, idempotency_key);

CREATE UNIQUE INDEX IF NOT EXISTS contract_rent_payments_obligation_confirmed_uniq
  ON public.contract_rent_payments(obligation_id)
  WHERE status = 'confirmed';

CREATE INDEX IF NOT EXISTS contract_rent_payments_contract_idx
  ON public.contract_rent_payments(contract_id);

CREATE INDEX IF NOT EXISTS contract_rent_payments_obligation_idx
  ON public.contract_rent_payments(obligation_id);

CREATE INDEX IF NOT EXISTS contract_rent_payments_salon_status_created_idx
  ON public.contract_rent_payments(salon_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS contract_rent_payments_master_status_created_idx
  ON public.contract_rent_payments(master_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS contract_rent_payments_status_confirmed_idx
  ON public.contract_rent_payments(status, confirmed_at DESC);

COMMIT;
