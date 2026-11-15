-- TOTEM US06-GEO-I — strictly additive, US-only owner-address evidence.
-- Apply ONLY to isolated copy until release approval. Never auto-enable US.
-- Real US02 activation trigger remains in place. KG/KZ untouched.
-- Polygon content: timezone-boundary-builder 2026d, ODbL-1.0.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $geo_preflight$
BEGIN
  IF to_regclass('public.us_location_geo_verifications') IS NOT NULL
     OR to_regclass('public.us_location_geo_verifications_status_idx') IS NOT NULL
  THEN
    RAISE EXCEPTION 'US06_GEO_I_EXISTING_REGISTRY_CONFLICT';
  END IF;
  IF to_regclass('public.us_salon_locations') IS NULL
     OR to_regclass('public.us_states') IS NULL
     OR to_regclass('public.us_timezones') IS NULL
     OR (SELECT count(*) FROM public.us_states) <> 51
     OR (SELECT count(*) FROM public.us_timezones) <> 29
  THEN
    RAISE EXCEPTION 'US06_GEO_I_US02_CATALOG_MISSING_OR_DRIFT';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.markets
     WHERE code='US' AND country_code='US' AND default_currency='USD'
       AND country_pack_code='US' AND country_pack_version='1'
       AND active=false
  ) THEN
    RAISE EXCEPTION 'US06_GEO_I_MARKET_NOT_SAFELY_INACTIVE';
  END IF;
  IF (SELECT value FROM public.platform_config WHERE key='default_market_code')
       IS DISTINCT FROM 'KG'
  THEN
    RAISE EXCEPTION 'US06_GEO_I_DEFAULT_MARKET_CHANGED';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid='public.us_salon_locations'::regclass
       AND tgname='trg_validate_us_salon_location_row' AND NOT tgisinternal
       AND tgenabled='O'
  ) THEN
    RAISE EXCEPTION 'US06_GEO_I_LOCATION_ACTIVATION_GUARD_NOT_ENABLED';
  END IF;
END;
$geo_preflight$;

CREATE TABLE public.us_location_geo_verifications (
  location_id bigint PRIMARY KEY
    REFERENCES public.us_salon_locations(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('VERIFIED_GEOMETRY','NEEDS_REVIEW')),
  reasons text[] NOT NULL DEFAULT ARRAY[]::text[],
  address_fingerprint_sha256 text NOT NULL CHECK (
    address_fingerprint_sha256 ~ '^[0-9a-f]{64}$'
  ),
  source_version text NOT NULL CHECK (source_version = '2026d'),
  dataset_sha256 text NOT NULL CHECK (
    dataset_sha256 =
    '2da5f1e980e70f53c781e1416e8e47bee03b98160353951c886a9901f525550a'
  ),
  census_benchmark text NOT NULL CHECK (census_benchmark='Public_AR_Current'),
  census_matched_address text,
  census_state_code text,
  census_zip5 text,
  resolved_timezone text REFERENCES public.us_timezones(name)
    ON DELETE RESTRICT,
  latitude double precision,
  longitude double precision,
  boundary_distance_m double precision,
  checked_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT us_geo_status_evidence_check CHECK (
    (status='VERIFIED_GEOMETRY'
      AND cardinality(reasons)=0
      AND census_matched_address IS NOT NULL
      AND census_state_code IS NOT NULL
      AND census_zip5 IS NOT NULL
      AND resolved_timezone IS NOT NULL
      AND latitude BETWEEN 18 AND 72
      AND longitude BETWEEN -180 AND 180
      AND boundary_distance_m >= 250)
    OR (status='NEEDS_REVIEW' AND cardinality(reasons)>0)
  ),
  CONSTRAINT us_geo_time_window_check CHECK (
    expires_at > checked_at AND
    expires_at <= checked_at + INTERVAL '30 days'
  )
);

CREATE INDEX us_location_geo_verifications_status_idx
  ON public.us_location_geo_verifications (status, expires_at);
COMMENT ON TABLE public.us_location_geo_verifications IS
  'US06-GEO-I: US-only Census/TIGER and IANA 2026d polygon consistency. '
  'NOT USPS or rooftop certification. No activation permission inferred.';
COMMENT ON COLUMN public.us_location_geo_verifications.status IS
  'VERIFIED_GEOMETRY = address/ZIP5/state and IANA polygon agree; '
  'NEEDS_REVIEW = fail-closed. Neither state permits production US activation.';

DO $geo_post$
BEGIN
  IF (SELECT count(*) FROM public.us_location_geo_verifications) <> 0
     OR EXISTS (SELECT 1 FROM public.us_salon_locations WHERE enabled)
     OR (SELECT active FROM public.markets WHERE code='US')
        IS DISTINCT FROM false
  THEN
    RAISE EXCEPTION 'US06_GEO_I_FINAL_INACTIVE_PRECONDITION_FAILED';
  END IF;
END;
$geo_post$;
COMMIT;
