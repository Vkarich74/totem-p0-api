-- US-PAY-C11-PAYEE-AUTH. Additive append-only selection audit; US-only.
-- Keep the three frozen USD/booking/collector sidecars untouched.
-- No changes to KG/KZ, legacy payment tables, Money Core, or Stripe.
BEGIN;

CREATE TABLE public.us_booking_collector_selection_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  booking_id integer NOT NULL REFERENCES public.bookings(id) ON DELETE RESTRICT,
  market_id bigint NOT NULL REFERENCES public.markets(id) ON DELETE RESTRICT,
  actor_user_id integer NOT NULL,
  previous_owner_type text CHECK (previous_owner_type IS NULL OR previous_owner_type IN ('salon','master')),
  previous_owner_id integer CHECK (previous_owner_id IS NULL OR previous_owner_id > 0),
  selected_owner_type text NOT NULL CHECK (selected_owner_type IN ('salon','master')),
  selected_owner_id integer NOT NULL CHECK (selected_owner_id > 0),
  revision bigint NOT NULL CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_id, revision),
  CONSTRAINT us_collector_selection_previous_pair CHECK (
    (previous_owner_type IS NULL AND previous_owner_id IS NULL) OR
    (previous_owner_type IS NOT NULL AND previous_owner_id IS NOT NULL)
  )
);

CREATE INDEX us_booking_collector_selection_events_actor_idx
  ON public.us_booking_collector_selection_events (actor_user_id, created_at DESC);

CREATE FUNCTION public.us_pay_c11_immutable_selection_event()
RETURNS trigger LANGUAGE plpgsql AS $block$
BEGIN
  RAISE EXCEPTION 'US_C11_COLLECTOR_SELECTION_AUDIT_IMMUTABLE'
    USING ERRCODE = '23514';
END
$block$;

CREATE TRIGGER us_pay_c11_collector_selection_audit_immutable
  BEFORE UPDATE OR DELETE ON public.us_booking_collector_selection_events
  FOR EACH ROW EXECUTE FUNCTION public.us_pay_c11_immutable_selection_event();

COMMIT;
