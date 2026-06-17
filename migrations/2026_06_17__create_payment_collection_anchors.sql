BEGIN;

CREATE TABLE IF NOT EXISTS public.payment_collection_anchors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  payment_id integer NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  booking_id integer NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  salon_id integer NOT NULL REFERENCES public.salons(id) ON DELETE RESTRICT,
  beneficiary_master_id integer NOT NULL REFERENCES public.masters(id) ON DELETE RESTRICT,

  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'KGS' CHECK (length(trim(currency)) > 0),

  provider text NULL,
  method text NULL,

  collector_owner_type text NOT NULL CHECK (collector_owner_type IN ('master', 'salon', 'unknown', 'conflict')),
  collector_owner_id integer NULL,

  anchor_status text NOT NULL CHECK (anchor_status IN ('open', 'closed', 'not_needed', 'unknown', 'conflict')),
  source_type text NOT NULL,
  source_id text NULL,

  closed_at timestamptz NULL,
  closed_by_user_id integer NULL,
  close_note text NULL,
  close_batch_id text NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT payment_collection_anchors_unique_payment
    UNIQUE (payment_id),

  CONSTRAINT payment_collection_anchors_anchor_type_owner_check
    CHECK (
      (anchor_status = 'open' AND collector_owner_type = 'salon')
      OR (anchor_status = 'closed' AND collector_owner_type = 'salon')
      OR (anchor_status = 'not_needed' AND collector_owner_type = 'master')
      OR (anchor_status = 'unknown' AND collector_owner_type = 'unknown')
      OR (anchor_status = 'conflict' AND collector_owner_type = 'conflict')
    )
);

CREATE INDEX IF NOT EXISTS payment_collection_anchors_booking_idx
  ON public.payment_collection_anchors (booking_id);

CREATE INDEX IF NOT EXISTS payment_collection_anchors_salon_idx
  ON public.payment_collection_anchors (salon_id);

CREATE INDEX IF NOT EXISTS payment_collection_anchors_master_idx
  ON public.payment_collection_anchors (beneficiary_master_id);

CREATE INDEX IF NOT EXISTS payment_collection_anchors_anchor_status_idx
  ON public.payment_collection_anchors (anchor_status);

CREATE INDEX IF NOT EXISTS payment_collection_anchors_collector_owner_idx
  ON public.payment_collection_anchors (collector_owner_type, collector_owner_id);

CREATE INDEX IF NOT EXISTS payment_collection_anchors_closed_at_idx
  ON public.payment_collection_anchors (closed_at);

CREATE INDEX IF NOT EXISTS payment_collection_anchors_created_at_idx
  ON public.payment_collection_anchors (created_at DESC);

COMMIT;
