-- US-PAY-C11: Live Stripe Standard onboarding consent + seller identity.
-- SAFE GATE: no live connected accounts are created by this migration.
-- No changes to legacy KG/KZ, no payment initiation, no payouts/refunds.
-- This DDL requires a separate actual-schema review before production.
BEGIN;

CREATE TABLE public.us_stripe_live_seller_bindings (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  market_id bigint NOT NULL REFERENCES public.markets(id) ON DELETE RESTRICT,
  owner_type text NOT NULL CHECK (owner_type IN ('salon','master')),
  owner_id integer NOT NULL CHECK (owner_id > 0),
  created_by_user_id integer NOT NULL REFERENCES public.auth_users(id) ON DELETE RESTRICT,
  owner_consent_at timestamptz NOT NULL DEFAULT now(),
  owner_consent_version text NOT NULL DEFAULT 'US-C11-connect-v1'
    CHECK (owner_consent_version = 'US-C11-connect-v1'),
  stripe_mode text NOT NULL DEFAULT 'LIVE' CHECK (stripe_mode = 'LIVE'),
  account_type text NOT NULL DEFAULT 'standard' CHECK (account_type = 'standard'),
  connection_method text NOT NULL DEFAULT 'new_standard'
    CHECK (connection_method IN ('new_standard','oauth_existing')),
  provisioning_token uuid NOT NULL UNIQUE,
  stripe_account_id text UNIQUE
    CHECK (stripe_account_id IS NULL OR stripe_account_id ~ '^acct_[a-zA-Z0-9]{8,}$'),
  verification_status text NOT NULL DEFAULT 'initiated'
    CHECK (verification_status IN ('initiated','onboarding','verified','restricted','revoked')),
  charges_enabled boolean NOT NULL DEFAULT false,
  payouts_enabled boolean NOT NULL DEFAULT false,
  details_submitted boolean NOT NULL DEFAULT false,
  card_payments_status text NOT NULL DEFAULT 'unknown'
    CHECK (card_payments_status IN ('unknown','active','pending','inactive')),
  transfers_status text NOT NULL DEFAULT 'unknown'
    CHECK (transfers_status IN ('unknown','active','pending','inactive')),
  verified_at timestamptz,
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_type,owner_id,stripe_mode),
  CONSTRAINT us_c11_live_seller_verified CHECK (
    (verification_status='verified' AND stripe_account_id IS NOT NULL
      AND verified_at IS NOT NULL AND last_checked_at IS NOT NULL
      AND charges_enabled AND payouts_enabled AND details_submitted
      AND card_payments_status='active' AND transfers_status='active')
    OR (verification_status<>'verified' AND verified_at IS NULL)
  ),
  CONSTRAINT us_c11_live_seller_onboarding_exists CHECK (
    verification_status='initiated' OR stripe_account_id IS NOT NULL
  )
);

CREATE FUNCTION public.us_c11_live_seller_guard()
RETURNS trigger LANGUAGE plpgsql AS $sql$
DECLARE
  target_market bigint;
BEGIN
  IF NEW.owner_type='salon' THEN
    SELECT tms.market_id INTO target_market
      FROM public.salons s
      JOIN public.tenant_market_settings tms ON tms.salon_id=s.id
      JOIN public.markets m ON m.id=tms.market_id
     WHERE s.id=NEW.owner_id AND m.code='US'
       AND m.active IS TRUE AND m.default_currency='USD';
  ELSE
    SELECT tms.market_id INTO target_market
      FROM public.masters mas
      JOIN public.master_salon ms ON ms.master_id=mas.id
      JOIN public.tenant_market_settings tms ON tms.salon_id=ms.salon_id
      JOIN public.markets m ON m.id=tms.market_id
     WHERE mas.id=NEW.owner_id AND ms.status='active'
       AND m.code='US' AND m.active IS TRUE
       AND m.default_currency='USD'
     ORDER BY tms.market_id LIMIT 1;
  END IF;
  IF target_market IS NULL OR target_market<>NEW.market_id THEN
    RAISE EXCEPTION 'US_C11_LIVE_SELLER_MARKET_MISMATCH' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' THEN
    IF (NEW.id,NEW.market_id,NEW.owner_type,NEW.owner_id,
        NEW.created_by_user_id,NEW.owner_consent_at,NEW.owner_consent_version,
        NEW.stripe_mode,NEW.account_type,NEW.provisioning_token,NEW.created_at)
       IS DISTINCT FROM
       (OLD.id,OLD.market_id,OLD.owner_type,OLD.owner_id,
        OLD.created_by_user_id,OLD.owner_consent_at,OLD.owner_consent_version,
        OLD.stripe_mode,OLD.account_type,OLD.provisioning_token,OLD.created_at)
      OR (OLD.stripe_account_id IS NOT NULL
          AND NEW.stripe_account_id IS DISTINCT FROM OLD.stripe_account_id) THEN
      RAISE EXCEPTION 'US_C11_LIVE_SELLER_IDENTITY_IMMUTABLE' USING ERRCODE='23514';
    END IF;
    -- Once bound to a real Stripe account, its creation/authorization
    -- method cannot be switched to disguise a different authorization.
    IF OLD.stripe_account_id IS NOT NULL AND
       NEW.connection_method IS DISTINCT FROM OLD.connection_method THEN
      RAISE EXCEPTION 'US_C11_LIVE_CONNECTION_METHOD_IMMUTABLE'
        USING ERRCODE='23514';
    END IF;
    IF OLD.verification_status='revoked' AND NEW.verification_status<>'revoked' THEN
      RAISE EXCEPTION 'US_C11_LIVE_SELLER_REVOKED' USING ERRCODE='23514';
    END IF;
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END
$sql$;

CREATE TRIGGER us_c11_live_seller_trigger
  BEFORE INSERT OR UPDATE ON public.us_stripe_live_seller_bindings
  FOR EACH ROW EXECUTE FUNCTION public.us_c11_live_seller_guard();

-- Business/legal trace. Only server can create rows; applications must never
-- trust frontend actor fields, confirmation flags or Stripe account IDs.
CREATE TABLE public.us_stripe_live_seller_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  binding_id bigint NOT NULL REFERENCES public.us_stripe_live_seller_bindings(id) ON DELETE RESTRICT,
  actor_user_id integer REFERENCES public.auth_users(id) ON DELETE RESTRICT,
  event text NOT NULL CHECK (event IN
    ('owner_consent','account_provisioned','onboarding_link_issued',
     'stripe_verified','stripe_restricted','stripe_revoked')),
  stripe_mode text NOT NULL DEFAULT 'LIVE' CHECK (stripe_mode='LIVE'),
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION public.us_c11_live_seller_events_immutable()
RETURNS trigger LANGUAGE plpgsql AS $sql$
BEGIN
  RAISE EXCEPTION 'US_C11_LIVE_SELLER_EVENT_IMMUTABLE' USING ERRCODE='23514';
END
$sql$;

CREATE TRIGGER us_c11_live_seller_events_no_mutation
  BEFORE UPDATE OR DELETE ON public.us_stripe_live_seller_events
  FOR EACH ROW EXECUTE FUNCTION public.us_c11_live_seller_events_immutable();

COMMIT;
