BEGIN;

CREATE TABLE IF NOT EXISTS public.contract_rent_obligations (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,

contract_salon_id text NOT NULL,
contract_master_id text NOT NULL,

salon_id integer NOT NULL REFERENCES public.salons(id) ON DELETE RESTRICT,
master_id integer NOT NULL REFERENCES public.masters(id) ON DELETE RESTRICT,

period_start timestamptz NOT NULL,
period_end timestamptz NOT NULL,

amount integer NOT NULL,
currency text NOT NULL DEFAULT 'KGS',

status text NOT NULL,

due_at timestamptz NULL,
paid_at timestamptz NULL,

created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
cancelled_at timestamptz NULL,

metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

CONSTRAINT contract_rent_obligations_period_check
CHECK (period_end > period_start),

CONSTRAINT contract_rent_obligations_amount_check
CHECK (amount > 0),

CONSTRAINT contract_rent_obligations_status_check
CHECK (status IN ('open', 'paid', 'cancelled', 'voided')),

CONSTRAINT contract_rent_obligations_contract_ids_match_check
CHECK (
contract_salon_id = salon_id::text
AND contract_master_id = master_id::text
),

CONSTRAINT contract_rent_obligations_contract_period_uniq
UNIQUE (contract_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS contract_rent_obligations_contract_idx
ON public.contract_rent_obligations (contract_id);

CREATE INDEX IF NOT EXISTS contract_rent_obligations_salon_status_due_idx
ON public.contract_rent_obligations (salon_id, status, due_at);

CREATE INDEX IF NOT EXISTS contract_rent_obligations_master_status_due_idx
ON public.contract_rent_obligations (master_id, status, due_at);

CREATE INDEX IF NOT EXISTS contract_rent_obligations_status_due_idx
ON public.contract_rent_obligations (status, due_at);

COMMIT;
