-- TOTEM US-02: inactive nationwide market, state/zone catalogs, isolated locations.
-- One-time FAIL-CLOSED migration. Do not auto-run on Production.
-- Requires G05 Multicountry; country pack US@1 (US-01) in source only.
-- No INSERT/UPDATE/DELETE on existing KG/KZ business data, tenants or finance.
-- US country/market default_timezone 'Etc/UTC' is a non-operational
-- compatibility sentinel. The timezone for each US salon location is mandatory.
-- Sources: USPS Publication 28 Appendix B; IANA tzdb zone.tab, US entries.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $us02_precheck$
BEGIN
  IF EXISTS (SELECT 1 FROM public.countries WHERE code = 'US')
     OR EXISTS (SELECT 1 FROM public.markets WHERE code = 'US')
     OR to_regclass('public.us_states') IS NOT NULL
     OR to_regclass('public.us_timezones') IS NOT NULL
     OR to_regclass('public.us_salon_locations') IS NOT NULL
     OR to_regclass('public.us_salon_locations_id_seq') IS NOT NULL
     OR to_regprocedure('public.validate_us_salon_location_row()') IS NOT NULL THEN
    RAISE EXCEPTION 'US02_STOP_CONFLICT_EXISTING_US_OBJECT';
  END IF;

  IF (SELECT value FROM public.platform_config WHERE key = 'default_market_code')
      IS DISTINCT FROM 'KG' THEN
    RAISE EXCEPTION 'US02_STOP_DEFAULT_MARKET_NOT_KG';
  END IF;

  -- KG remains the active default. KZ was registered as inactive by
  -- 2026_10_06__add_kz_market.sql; KZ activation is NOT a US prerequisite.
  -- Check both market identities without changing either market's status.
  IF NOT EXISTS (SELECT 1 FROM public.markets
                 WHERE code = 'KG' AND country_code = 'KG'
                       AND default_currency = 'KGS' AND active)
     OR NOT EXISTS (SELECT 1 FROM public.markets
                   WHERE code = 'KZ' AND country_code = 'KZ'
                         AND default_currency = 'KZT') THEN
    RAISE EXCEPTION 'US02_STOP_KG_KZ_MARKET_BASELINE_CHANGED';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = 'Etc/UTC') THEN
    RAISE EXCEPTION 'US02_STOP_TZDB_NOT_AVAILABLE';
  END IF;
END;
$us02_precheck$;

INSERT INTO public.countries (
  code, name_ru, name_en, currency_code, timezone, phone_prefix, status
) VALUES (
  'US', 'Соединённые Штаты Америки', 'United States',
  'USD', 'Etc/UTC', '+1', 'planned'
);

INSERT INTO public.markets (
  code, country_code, default_locale, supported_locales,
  default_currency, supported_currencies, default_timezone,
  country_pack_code, country_pack_version, active
) VALUES (
  'US', 'US', 'en-US', ARRAY['en-US']::text[],
  'USD', ARRAY['USD']::text[], 'Etc/UTC', 'US', '1', false
);

-- USPS: only 50 states + DC. US territories and military postal codes excluded.
CREATE TABLE public.us_states (
  code text PRIMARY KEY,
  country_code text NOT NULL DEFAULT 'US' REFERENCES public.countries(code) ON DELETE RESTRICT,
  name_en text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('state', 'federal_district')),
  CONSTRAINT us_states_us_only_check CHECK (country_code = 'US'),
  CONSTRAINT us_states_code_check CHECK (code ~ '^[A-Z]{2}$'),
  CONSTRAINT us_states_name_check CHECK (length(trim(name_en)) > 0)
);

INSERT INTO public.us_states (code, name_en, kind) VALUES
  ('AL','Alabama','state'),
  ('AK','Alaska','state'),
  ('AZ','Arizona','state'),
  ('AR','Arkansas','state'),
  ('CA','California','state'),
  ('CO','Colorado','state'),
  ('CT','Connecticut','state'),
  ('DE','Delaware','state'),
  ('DC','District of Columbia','federal_district'),
  ('FL','Florida','state'),
  ('GA','Georgia','state'),
  ('HI','Hawaii','state'),
  ('ID','Idaho','state'),
  ('IL','Illinois','state'),
  ('IN','Indiana','state'),
  ('IA','Iowa','state'),
  ('KS','Kansas','state'),
  ('KY','Kentucky','state'),
  ('LA','Louisiana','state'),
  ('ME','Maine','state'),
  ('MD','Maryland','state'),
  ('MA','Massachusetts','state'),
  ('MI','Michigan','state'),
  ('MN','Minnesota','state'),
  ('MS','Mississippi','state'),
  ('MO','Missouri','state'),
  ('MT','Montana','state'),
  ('NE','Nebraska','state'),
  ('NV','Nevada','state'),
  ('NH','New Hampshire','state'),
  ('NJ','New Jersey','state'),
  ('NM','New Mexico','state'),
  ('NY','New York','state'),
  ('NC','North Carolina','state'),
  ('ND','North Dakota','state'),
  ('OH','Ohio','state'),
  ('OK','Oklahoma','state'),
  ('OR','Oregon','state'),
  ('PA','Pennsylvania','state'),
  ('RI','Rhode Island','state'),
  ('SC','South Carolina','state'),
  ('SD','South Dakota','state'),
  ('TN','Tennessee','state'),
  ('TX','Texas','state'),
  ('UT','Utah','state'),
  ('VT','Vermont','state'),
  ('VA','Virginia','state'),
  ('WA','Washington','state'),
  ('WV','West Virginia','state'),
  ('WI','Wisconsin','state'),
  ('WY','Wyoming','state');

-- Explicit US IANA timezones from tzdb zone.tab (US lines).
-- Includes multi-zone states, Indiana/Kentucky subdivisions, Arizona,
-- Alaska/Aleutians and Hawaii. No single per-state timezone assumption.
CREATE TABLE public.us_timezones (
  name text PRIMARY KEY,
  source text NOT NULL DEFAULT 'IANA zone.tab',
  CONSTRAINT us_timezones_name_check CHECK (
    name LIKE 'America/%' OR name = 'Pacific/Honolulu'
  )
);

INSERT INTO public.us_timezones (name) VALUES
  ('America/New_York'),
  ('America/Detroit'),
  ('America/Kentucky/Louisville'),
  ('America/Kentucky/Monticello'),
  ('America/Indiana/Indianapolis'),
  ('America/Indiana/Vincennes'),
  ('America/Indiana/Winamac'),
  ('America/Indiana/Marengo'),
  ('America/Indiana/Petersburg'),
  ('America/Indiana/Vevay'),
  ('America/Chicago'),
  ('America/Indiana/Tell_City'),
  ('America/Indiana/Knox'),
  ('America/Menominee'),
  ('America/North_Dakota/Center'),
  ('America/North_Dakota/New_Salem'),
  ('America/North_Dakota/Beulah'),
  ('America/Denver'),
  ('America/Boise'),
  ('America/Phoenix'),
  ('America/Los_Angeles'),
  ('America/Anchorage'),
  ('America/Juneau'),
  ('America/Sitka'),
  ('America/Metlakatla'),
  ('America/Yakutat'),
  ('America/Nome'),
  ('America/Adak'),
  ('Pacific/Honolulu');

DO $us02_catalog_guard$
DECLARE
  missing_zone text;
BEGIN
  IF (SELECT count(*) FROM public.us_states) <> 51
     OR (SELECT count(*) FROM public.us_states WHERE kind='state') <> 50
     OR (SELECT count(*) FROM public.us_states WHERE kind='federal_district') <> 1
     OR (SELECT count(*) FROM public.us_timezones) <> 29 THEN
    RAISE EXCEPTION 'US02_STOP_CATALOG_COUNTS_MISMATCH';
  END IF;

  SELECT z.name INTO missing_zone
  FROM public.us_timezones z
  WHERE NOT EXISTS (SELECT 1 FROM pg_timezone_names p WHERE p.name = z.name)
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'US02_STOP_TZDB_ZONE_MISSING: %', missing_zone;
  END IF;
END;
$us02_catalog_guard$;

-- Data model only. Existing calendar/booking resolvers remain unchanged.
-- Multiple physical locations are allowed per US salon; precisely one may
-- be primary, and each has its own state/city/ZIP and explicit IANA zone.
-- The address is STRUCTURALLY validated, not USPS delivery-point verified.
CREATE TABLE public.us_salon_locations (
  id bigserial PRIMARY KEY,
  salon_id integer NOT NULL REFERENCES public.salons(id) ON DELETE RESTRICT,
  location_code text NOT NULL,
  state_code text NOT NULL REFERENCES public.us_states(code) ON DELETE RESTRICT,
  city_name text NOT NULL,
  street_line1 text NOT NULL,
  street_line2 text,
  postal_code text NOT NULL,
  timezone_name text NOT NULL REFERENCES public.us_timezones(name) ON DELETE RESTRICT,
  is_primary boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT us_salon_locations_code_check CHECK (
    location_code ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  CONSTRAINT us_salon_locations_city_check CHECK (length(trim(city_name)) > 0),
  CONSTRAINT us_salon_locations_street_check CHECK (length(trim(street_line1)) > 0),
  CONSTRAINT us_salon_locations_zip_check CHECK (
    postal_code ~ '^[0-9]{5}(-[0-9]{4})?$'
  ),
  CONSTRAINT us_salon_locations_per_salon_code UNIQUE (salon_id, location_code)
);

CREATE UNIQUE INDEX us_salon_locations_one_primary_per_salon_idx
  ON public.us_salon_locations (salon_id) WHERE is_primary = true;
CREATE INDEX us_salon_locations_by_state_idx
  ON public.us_salon_locations (state_code, city_name);
CREATE INDEX us_salon_locations_by_salon_idx
  ON public.us_salon_locations (salon_id, enabled);

-- No US location may be attached to a KG/KZ salon. No US locations may
-- be operational until a SEPARATELY APPROVED later release replaces the
-- activation gate after booking/locale/DST/tax readiness.
CREATE FUNCTION public.validate_us_salon_location_row()
RETURNS trigger
LANGUAGE plpgsql
AS $us02_location_guard$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.salon_id IS DISTINCT FROM OLD.salon_id THEN
    RAISE EXCEPTION 'US02_LOCATION_SALON_IMMUTABLE'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tenant_market_settings t
    JOIN public.markets m ON m.id = t.market_id
    WHERE t.salon_id = NEW.salon_id AND m.code = 'US'
      AND m.country_code = 'US'
  ) THEN
    RAISE EXCEPTION 'US02_LOCATION_REQUIRES_US_TENANT'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.enabled THEN
    RAISE EXCEPTION 'US02_LOCATION_ACTIVATION_LOCKED'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$us02_location_guard$;

CREATE TRIGGER trg_validate_us_salon_location_row
  BEFORE INSERT OR UPDATE ON public.us_salon_locations
  FOR EACH ROW EXECUTE FUNCTION public.validate_us_salon_location_row();

DO $us02_final_guard$
BEGIN
  IF (SELECT value FROM public.platform_config WHERE key='default_market_code')
      IS DISTINCT FROM 'KG'
     OR (SELECT active FROM public.markets WHERE code='US') IS DISTINCT FROM false
     OR (SELECT status FROM public.countries WHERE code='US') IS DISTINCT FROM 'planned'
     OR EXISTS (SELECT 1 FROM public.us_salon_locations) THEN
    RAISE EXCEPTION 'US02_STOP_FINAL_MARKET_SAFETY_MISMATCH';
  END IF;
END;
$us02_final_guard$;
COMMIT;
