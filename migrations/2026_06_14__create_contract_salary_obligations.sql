CREATE TABLE IF NOT EXISTS public.contract_salary_obligations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,

  contract_salon_id text NOT NULL,
  contract_master_id text NOT NULL,
  salon_id integer NOT NULL REFERENCES public.salons(id),
  master_id integer NOT NULL REFERENCES public.masters(id),

  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,

  amount integer NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'KGS' CHECK (length(trim(currency)) > 0),

  status text NOT NULL CHECK (status IN ('open', 'paid', 'cancelled', 'voided')),

  due_at timestamptz NULL,
  paid_at timestamptz NULL,
  cancelled_at timestamptz NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT contract_salary_obligations_contract_ids_match_check
    CHECK (contract_salon_id = salon_id::text AND contract_master_id = master_id::text),

  CONSTRAINT contract_salary_obligations_period_check
    CHECK (period_end > period_start)
);

CREATE UNIQUE INDEX IF NOT EXISTS contract_salary_obligations_contract_period_uniq
ON public.contract_salary_obligations(contract_id, period_start, period_end);

CREATE INDEX IF NOT EXISTS contract_salary_obligations_contract_idx
ON public.contract_salary_obligations(contract_id);

CREATE INDEX IF NOT EXISTS contract_salary_obligations_salon_status_due_idx
ON public.contract_salary_obligations(salon_id, status, due_at);

CREATE INDEX IF NOT EXISTS contract_salary_obligations_master_status_due_idx
ON public.contract_salary_obligations(master_id, status, due_at);

CREATE INDEX IF NOT EXISTS contract_salary_obligations_status_due_idx
ON public.contract_salary_obligations(status, due_at);
