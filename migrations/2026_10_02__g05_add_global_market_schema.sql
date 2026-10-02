BEGIN;

CREATE TABLE public.markets (
  id bigserial PRIMARY KEY,
  code text NOT NULL UNIQUE,
  country_code text NOT NULL REFERENCES public.countries(code) ON UPDATE CASCADE ON DELETE RESTRICT,
  default_locale text NOT NULL,
  supported_locales text[] NOT NULL,
  default_currency text NOT NULL,
  supported_currencies text[] NOT NULL,
  default_timezone text NOT NULL,
  country_pack_code text NOT NULL,
  country_pack_version text NOT NULL,
  active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT markets_code_check CHECK (code ~ '^[A-Z][A-Z0-9_-]{1,31}$'),
  CONSTRAINT markets_supported_locales_nonempty_check CHECK (cardinality(supported_locales) > 0),
  CONSTRAINT markets_default_locale_supported_check CHECK (default_locale = ANY(supported_locales)),
  CONSTRAINT markets_default_currency_check CHECK (default_currency ~ '^[A-Z]{3}$'),
  CONSTRAINT markets_supported_currencies_nonempty_check CHECK (cardinality(supported_currencies) > 0),
  CONSTRAINT markets_default_currency_supported_check CHECK (default_currency = ANY(supported_currencies)),
  CONSTRAINT markets_timezone_nonempty_check CHECK (length(trim(default_timezone)) > 0),
  CONSTRAINT markets_country_pack_nonempty_check CHECK (length(trim(country_pack_code)) > 0),
  CONSTRAINT markets_country_pack_version_nonempty_check CHECK (length(trim(country_pack_version)) > 0)
);

CREATE OR REPLACE FUNCTION public.validate_market_row()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.code IS DISTINCT FROM OLD.code THEN
    RAISE EXCEPTION 'market code is immutable';
  END IF;

  IF EXISTS (
    SELECT 1 FROM unnest(NEW.supported_locales) AS locale_value
    WHERE locale_value IS NULL OR length(trim(locale_value)) = 0
  ) THEN
    RAISE EXCEPTION 'supported_locales contains an empty locale';
  END IF;

  IF EXISTS (
    SELECT 1 FROM unnest(NEW.supported_currencies) AS currency_value
    WHERE currency_value IS NULL OR currency_value !~ '^[A-Z]{3}$'
  ) THEN
    RAISE EXCEPTION 'supported_currencies contains an invalid currency code';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = NEW.default_timezone) THEN
    RAISE EXCEPTION 'invalid IANA timezone: %', NEW.default_timezone;
  END IF;

  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_validate_market_row
BEFORE INSERT OR UPDATE ON public.markets
FOR EACH ROW EXECUTE FUNCTION public.validate_market_row();

CREATE TABLE public.tenant_market_settings (
  salon_id integer PRIMARY KEY REFERENCES public.salons(id) ON DELETE CASCADE,
  market_id bigint NOT NULL REFERENCES public.markets(id) ON DELETE RESTRICT,
  city_id bigint NULL REFERENCES public.cities(id) ON DELETE RESTRICT,
  locale_override text NULL,
  currency_override text NULL,
  timezone_override text NULL,
  payment_profile_code text NULL,
  notification_profile_code text NULL,
  fiscal_profile_code text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_market_settings_currency_override_check
    CHECK (currency_override IS NULL OR currency_override ~ '^[A-Z]{3}$'),
  CONSTRAINT tenant_market_settings_locale_override_check
    CHECK (locale_override IS NULL OR length(trim(locale_override)) > 0),
  CONSTRAINT tenant_market_settings_timezone_override_check
    CHECK (timezone_override IS NULL OR length(trim(timezone_override)) > 0)
);

CREATE INDEX tenant_market_settings_market_idx ON public.tenant_market_settings(market_id);
CREATE INDEX tenant_market_settings_city_idx ON public.tenant_market_settings(city_id);
CREATE OR REPLACE FUNCTION public.validate_tenant_market_settings_row()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  market_country text;
  market_locales text[];
  market_currencies text[];
  city_country text;
BEGIN
  SELECT country_code, supported_locales, supported_currencies
  INTO market_country, market_locales, market_currencies
  FROM public.markets
  WHERE id = NEW.market_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown market_id: %', NEW.market_id;
  END IF;

  IF NEW.city_id IS NOT NULL THEN
    SELECT country_code INTO city_country FROM public.cities WHERE id = NEW.city_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'unknown city_id: %', NEW.city_id;
    END IF;
    IF city_country IS DISTINCT FROM market_country THEN
      RAISE EXCEPTION 'city country % does not match market country %', city_country, market_country;
    END IF;
  END IF;
  IF NEW.locale_override IS NOT NULL AND NOT (NEW.locale_override = ANY(market_locales)) THEN
    RAISE EXCEPTION 'locale_override % is not supported by market', NEW.locale_override;
  END IF;

  IF NEW.currency_override IS NOT NULL AND NOT (NEW.currency_override = ANY(market_currencies)) THEN
    RAISE EXCEPTION 'currency_override % is not supported by market', NEW.currency_override;
  END IF;

  IF NEW.timezone_override IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = NEW.timezone_override) THEN
    RAISE EXCEPTION 'invalid tenant IANA timezone: %', NEW.timezone_override;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_tenant_market_settings_row
BEFORE INSERT OR UPDATE ON public.tenant_market_settings
FOR EACH ROW EXECUTE FUNCTION public.validate_tenant_market_settings_row();

CREATE TABLE public.market_capabilities (
  market_id bigint NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  capability_code text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT market_capabilities_code_check CHECK (length(trim(capability_code)) > 0),
  CONSTRAINT market_capabilities_pkey PRIMARY KEY (market_id, capability_code)
);

CREATE INDEX market_capabilities_enabled_idx
  ON public.market_capabilities(market_id, enabled);

CREATE TABLE public.market_provider_bindings (
  market_id bigint NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  provider_type text NOT NULL,
  provider_code text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  priority integer NOT NULL DEFAULT 100,
  profile_code text NULL,
  config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT market_provider_bindings_type_check
    CHECK (provider_type IN ('payment','payout','notification','identity','fiscal')),
  CONSTRAINT market_provider_bindings_code_check CHECK (length(trim(provider_code)) > 0),
  CONSTRAINT market_provider_bindings_priority_check CHECK (priority >= 0),
  CONSTRAINT market_provider_bindings_pkey PRIMARY KEY (market_id, provider_type, provider_code)
);

CREATE INDEX market_provider_bindings_enabled_priority_idx
  ON public.market_provider_bindings(market_id, provider_type, enabled, priority);

INSERT INTO public.markets (
  code,
  country_code,
  default_locale,
  supported_locales,
  default_currency,
  supported_currencies,
  default_timezone,
  country_pack_code,
  country_pack_version,
  active
) VALUES (
  'KG',
  'KG',
  'ru-KG',
  ARRAY['ru-KG']::text[],
  'KGS',
  ARRAY['KGS']::text[],
  'Asia/Bishkek',
  'KG',
  '1',
  true
);

INSERT INTO public.platform_config(key, value, updated_at)
VALUES ('default_market_code', 'KG', now());

WITH kg_market AS (
  SELECT id FROM public.markets WHERE code = 'KG'
), bishkek AS (
  SELECT id FROM public.cities
  WHERE country_code = 'KG' AND slug = 'bishkek' AND status = 'active'
)
INSERT INTO public.tenant_market_settings(salon_id, market_id, city_id)
SELECT
  s.id,
  m.id,
  CASE WHEN s.city IN ('Bishkek', 'Бишкек') THEN b.id ELSE NULL END
FROM public.salons s
CROSS JOIN kg_market m
CROSS JOIN bishkek b
ORDER BY s.id;

COMMIT;
