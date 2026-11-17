-- TOTEM US-PAY-C11: existing Stripe Standard account owner-authorized OAuth.
-- Additive independent US-only state. No merchant, payments or bank records.
-- Apply after 2026_11_17__us_pay_c11_live_seller_onboarding.sql.
BEGIN;

CREATE TABLE public.us_stripe_live_oauth_attempts (
  state_hash text PRIMARY KEY CHECK (state_hash ~ '^[0-9a-f]{64}$'),
  binding_id bigint NOT NULL
    REFERENCES public.us_stripe_live_seller_bindings(id) ON DELETE RESTRICT,
  actor_user_id integer NOT NULL
    REFERENCES public.auth_users(id) ON DELETE RESTRICT,
  session_id uuid NOT NULL
    REFERENCES public.auth_sessions(id) ON DELETE RESTRICT,
  owner_type text NOT NULL CHECK (owner_type IN ('salon','master')),
  owner_id integer NOT NULL CHECK (owner_id>0),
  market_id bigint NOT NULL
    REFERENCES public.markets(id) ON DELETE RESTRICT,
  owner_slug text NOT NULL CHECK (length(owner_slug) BETWEEN 1 AND 100),
  oauth_mode text NOT NULL DEFAULT 'LIVE' CHECK (oauth_mode='LIVE'),
  oauth_scope text NOT NULL DEFAULT 'read_write'
    CHECK (oauth_scope='read_write'),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  result text NOT NULL DEFAULT 'pending'
    CHECK (result IN
      ('pending','superseded','exchange_pending','linked',
       'denied','invalidated','failed')),
  stripe_account_id text
    CHECK (stripe_account_id IS NULL OR
      stripe_account_id ~ '^acct_[A-Za-z0-9]{8,}$'),
  CONSTRAINT us_c11_live_oauth_state_lifecycle CHECK (
    (result='pending' AND consumed_at IS NULL
      AND stripe_account_id IS NULL)
    OR (result <> 'pending' AND consumed_at IS NOT NULL)
  ),
  CONSTRAINT us_c11_live_oauth_expiry CHECK (expires_at > created_at)
);

CREATE INDEX us_stripe_live_oauth_owner_idx
  ON public.us_stripe_live_oauth_attempts
  (binding_id,created_at DESC);

CREATE FUNCTION public.us_pay_c11_live_oauth_state_guard()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF TG_OP='UPDATE' THEN
    IF (NEW.state_hash, NEW.binding_id, NEW.actor_user_id,
        NEW.session_id, NEW.owner_type, NEW.owner_id, NEW.market_id,
        NEW.owner_slug, NEW.oauth_mode, NEW.oauth_scope,
        NEW.created_at, NEW.expires_at)
       IS DISTINCT FROM
       (OLD.state_hash, OLD.binding_id, OLD.actor_user_id,
        OLD.session_id, OLD.owner_type, OLD.owner_id, OLD.market_id,
        OLD.owner_slug, OLD.oauth_mode, OLD.oauth_scope,
        OLD.created_at, OLD.expires_at) THEN
      RAISE EXCEPTION 'US_C11_OAUTH_STATE_IDENTITY_IMMUTABLE'
        USING ERRCODE='23514';
    END IF;
    IF OLD.consumed_at IS NOT NULL AND
       (NEW.consumed_at IS DISTINCT FROM OLD.consumed_at OR
        NEW.result='pending') THEN
      RAISE EXCEPTION 'US_C11_OAUTH_STATE_REPLAY_FORBIDDEN'
        USING ERRCODE='23514';
    END IF;
    IF OLD.stripe_account_id IS NOT NULL AND
       NEW.stripe_account_id IS DISTINCT FROM OLD.stripe_account_id THEN
      RAISE EXCEPTION 'US_C11_OAUTH_ACCOUNT_ID_IMMUTABLE'
        USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END
$fn$;

CREATE TRIGGER us_pay_c11_live_oauth_guard
  BEFORE UPDATE ON public.us_stripe_live_oauth_attempts
  FOR EACH ROW EXECUTE FUNCTION public.us_pay_c11_live_oauth_state_guard();

COMMIT;
