BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.markets WHERE code = 'KG' AND active = true) THEN
    RAISE EXCEPTION 'Active KG market is required';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.user_locale_preferences (
  user_id integer NOT NULL REFERENCES public.auth_users(id) ON DELETE CASCADE,
  market_id bigint NOT NULL REFERENCES public.markets(id) ON DELETE RESTRICT,
  locale text NOT NULL CHECK (locale = btrim(locale) AND length(locale) > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, market_id)
);
CREATE INDEX IF NOT EXISTS user_locale_preferences_market_idx
  ON public.user_locale_preferences(market_id);

CREATE OR REPLACE FUNCTION public.validate_user_locale_preference()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE allowed_locales text[]; market_active boolean;
BEGIN
  SELECT supported_locales, active INTO allowed_locales, market_active
  FROM public.markets WHERE id = NEW.market_id FOR SHARE;
  IF NOT FOUND OR NOT market_active THEN
    RAISE EXCEPTION 'Active locale market is required' USING ERRCODE = '23514';
  END IF;
  IF NOT (NEW.locale = ANY(allowed_locales)) THEN
    RAISE EXCEPTION 'User locale is unsupported' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_validate_user_locale_preference ON public.user_locale_preferences;
CREATE TRIGGER trg_validate_user_locale_preference
BEFORE INSERT OR UPDATE ON public.user_locale_preferences
FOR EACH ROW EXECUTE FUNCTION public.validate_user_locale_preference();

-- Serialize tenant locale writes with supported_locales reductions without
-- replacing the existing tenant/currency/timezone validation function.
CREATE OR REPLACE FUNCTION public.lock_tenant_locale_market()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE allowed_locales text[];
BEGIN
  SELECT supported_locales INTO allowed_locales
  FROM public.markets WHERE id = NEW.market_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown tenant market' USING ERRCODE = '23503';
  END IF;
  IF NEW.locale_override IS NOT NULL AND NOT (NEW.locale_override = ANY(allowed_locales)) THEN
    RAISE EXCEPTION 'Tenant locale is unsupported' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_lock_tenant_locale_market ON public.tenant_market_settings;
CREATE TRIGGER trg_lock_tenant_locale_market
BEFORE INSERT OR UPDATE ON public.tenant_market_settings
FOR EACH ROW EXECUTE FUNCTION public.lock_tenant_locale_market();

CREATE OR REPLACE FUNCTION public.validate_market_locale_references()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.supported_locales IS DISTINCT FROM OLD.supported_locales AND (
    EXISTS (SELECT 1 FROM public.user_locale_preferences p
      WHERE p.market_id = OLD.id AND NOT (p.locale = ANY(NEW.supported_locales)))
    OR EXISTS (SELECT 1 FROM public.tenant_market_settings t
      WHERE t.market_id = OLD.id AND t.locale_override IS NOT NULL
        AND NOT (t.locale_override = ANY(NEW.supported_locales)))
  ) THEN
    RAISE EXCEPTION 'Market locales are referenced by preferences or tenants'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_validate_market_locale_references ON public.markets;
CREATE TRIGGER trg_validate_market_locale_references
BEFORE UPDATE OF supported_locales ON public.markets
FOR EACH ROW EXECUTE FUNCTION public.validate_market_locale_references();

UPDATE public.markets
SET supported_locales = array_append(supported_locales, 'en-KG'), updated_at = now()
WHERE code = 'KG' AND NOT ('en-KG' = ANY(supported_locales));
COMMIT;
