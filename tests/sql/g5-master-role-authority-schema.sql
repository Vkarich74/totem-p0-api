-- Selected exact table DDL and unique/primary constraints from verified 2026-11-16 schema-only snapshot. No data. Other dependencies not reproduced.
CREATE TABLE public.auth_sessions (
    id text NOT NULL,
    user_id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone,
    revoked_reason text,
    ip_address text,
    user_agent text
);
ALTER TABLE ONLY public.auth_sessions
    ADD CONSTRAINT auth_sessions_pkey PRIMARY KEY (id);
CREATE TABLE public.owner_salon (
    id bigint NOT NULL,
    owner_id text NOT NULL,
    salon_id bigint NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);
ALTER TABLE ONLY public.owner_salon
    ADD CONSTRAINT owner_salon_new_pkey PRIMARY KEY (id);
CREATE UNIQUE INDEX ux_owner_salon ON public.owner_salon USING btree (owner_id, salon_id);
CREATE TABLE public.salons (
    id integer NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    enabled boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    status text DEFAULT 'active'::text NOT NULL,
    description text,
    logo_url text,
    cover_url text,
    city text,
    phone text,
    slogan text
);
ALTER TABLE ONLY public.salons
    ADD CONSTRAINT salons_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.salons
    ADD CONSTRAINT salons_slug_key UNIQUE (slug);
CREATE TABLE public.masters (
    id integer NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    user_id integer NOT NULL
);
ALTER TABLE ONLY public.masters
    ADD CONSTRAINT masters_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.masters
    ADD CONSTRAINT masters_slug_key UNIQUE (slug);
CREATE TABLE public.master_salon (
    id bigint NOT NULL,
    master_id integer NOT NULL,
    salon_id integer NOT NULL,
    status text DEFAULT 'invited'::text NOT NULL,
    invited_at timestamp with time zone,
    activated_at timestamp with time zone,
    fired_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE ONLY public.master_salon
    ADD CONSTRAINT master_salon_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.master_salon
    ADD CONSTRAINT ux_master_salon_pair UNIQUE (master_id, salon_id);
CREATE TABLE public.markets (
    id bigint NOT NULL,
    code text NOT NULL,
    country_code text NOT NULL,
    default_locale text NOT NULL,
    supported_locales text[] NOT NULL,
    default_currency text NOT NULL,
    supported_currencies text[] NOT NULL,
    default_timezone text NOT NULL,
    country_pack_code text NOT NULL,
    country_pack_version text NOT NULL,
    active boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT markets_code_check CHECK ((code ~ '^[A-Z][A-Z0-9_-]{1,31}$'::text)),
    CONSTRAINT markets_country_pack_nonempty_check CHECK ((length(TRIM(BOTH FROM country_pack_code)) > 0)),
    CONSTRAINT markets_country_pack_version_nonempty_check CHECK ((length(TRIM(BOTH FROM country_pack_version)) > 0)),
    CONSTRAINT markets_default_currency_check CHECK ((default_currency ~ '^[A-Z]{3}$'::text)),
    CONSTRAINT markets_default_currency_supported_check CHECK ((default_currency = ANY (supported_currencies))),
    CONSTRAINT markets_default_locale_supported_check CHECK ((default_locale = ANY (supported_locales))),
    CONSTRAINT markets_supported_currencies_nonempty_check CHECK ((cardinality(supported_currencies) > 0)),
    CONSTRAINT markets_supported_locales_nonempty_check CHECK ((cardinality(supported_locales) > 0)),
    CONSTRAINT markets_timezone_nonempty_check CHECK ((length(TRIM(BOTH FROM default_timezone)) > 0))
);
ALTER TABLE ONLY public.markets
    ADD CONSTRAINT markets_code_key UNIQUE (code);
ALTER TABLE ONLY public.markets
    ADD CONSTRAINT markets_pkey PRIMARY KEY (id);
CREATE TABLE public.tenant_market_settings (
    salon_id integer NOT NULL,
    market_id bigint NOT NULL,
    city_id bigint,
    locale_override text,
    currency_override text,
    timezone_override text,
    payment_profile_code text,
    notification_profile_code text,
    fiscal_profile_code text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tenant_market_settings_currency_override_check CHECK (((currency_override IS NULL) OR (currency_override ~ '^[A-Z]{3}$'::text))),
    CONSTRAINT tenant_market_settings_locale_override_check CHECK (((locale_override IS NULL) OR (length(TRIM(BOTH FROM locale_override)) > 0))),
    CONSTRAINT tenant_market_settings_timezone_override_check CHECK (((timezone_override IS NULL) OR (length(TRIM(BOTH FROM timezone_override)) > 0)))
);
ALTER TABLE ONLY public.tenant_market_settings
    ADD CONSTRAINT tenant_market_settings_pkey PRIMARY KEY (salon_id);

-- Exact selected onboarding transition DDL, same hash-verified snapshot.
CREATE TABLE public.onboarding_state_transitions (
 id bigint NOT NULL, core_user_id bigint NOT NULL, from_state text NOT NULL,
 to_state text NOT NULL, reason text DEFAULT ''::text NOT NULL,
 created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE public.onboarding_state_transitions_id_seq START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
ALTER SEQUENCE public.onboarding_state_transitions_id_seq OWNED BY public.onboarding_state_transitions.id;
ALTER TABLE ONLY public.onboarding_state_transitions ALTER COLUMN id SET DEFAULT nextval('public.onboarding_state_transitions_id_seq'::regclass);
ALTER TABLE ONLY public.onboarding_state_transitions ADD CONSTRAINT onboarding_state_transitions_pkey PRIMARY KEY(id);

-- Selected geo table DDL/keys from verified 2026-11-16 schema-only snapshot;
-- no data, catalog FKs or triggers reproduced. Exact fingerprint from US07.
CREATE TABLE public.us_salon_locations (
 id bigint NOT NULL,salon_id integer NOT NULL,location_code text NOT NULL,state_code text NOT NULL,
 city_name text NOT NULL,street_line1 text NOT NULL,street_line2 text,postal_code text NOT NULL,
 timezone_name text NOT NULL,is_primary boolean DEFAULT false NOT NULL,enabled boolean DEFAULT false NOT NULL,
 created_at timestamp with time zone DEFAULT now() NOT NULL,updated_at timestamp with time zone DEFAULT now() NOT NULL,
 CONSTRAINT us_salon_locations_city_check CHECK ((length(TRIM(BOTH FROM city_name)) > 0)),
 CONSTRAINT us_salon_locations_code_check CHECK ((location_code ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text)),
 CONSTRAINT us_salon_locations_street_check CHECK ((length(TRIM(BOTH FROM street_line1)) > 0)),
 CONSTRAINT us_salon_locations_zip_check CHECK ((postal_code ~ '^[0-9]{5}(-[0-9]{4})?$'::text))
);
ALTER TABLE ONLY public.us_salon_locations ADD CONSTRAINT us_salon_locations_per_salon_code UNIQUE (salon_id,location_code);
ALTER TABLE ONLY public.us_salon_locations ADD CONSTRAINT us_salon_locations_pkey PRIMARY KEY(id);
CREATE UNIQUE INDEX us_salon_locations_one_primary_per_salon_idx ON public.us_salon_locations USING btree(salon_id) WHERE (is_primary=true);
CREATE TABLE public.us_location_geo_verifications (
 location_id bigint NOT NULL,status text NOT NULL,reasons text[] DEFAULT ARRAY[]::text[] NOT NULL,
 address_fingerprint_sha256 text NOT NULL,source_version text NOT NULL,dataset_sha256 text NOT NULL,
 census_benchmark text NOT NULL,census_matched_address text,census_state_code text,census_zip5 text,
 resolved_timezone text,latitude double precision,longitude double precision,boundary_distance_m double precision,
 checked_at timestamp with time zone NOT NULL,expires_at timestamp with time zone NOT NULL,
 updated_at timestamp with time zone DEFAULT now() NOT NULL,
 CONSTRAINT us_geo_status_evidence_check CHECK ((((status = 'VERIFIED_GEOMETRY'::text) AND (cardinality(reasons) = 0) AND (census_matched_address IS NOT NULL) AND (census_state_code IS NOT NULL) AND (census_zip5 IS NOT NULL) AND (resolved_timezone IS NOT NULL) AND ((latitude >= (18)::double precision) AND (latitude <= (72)::double precision)) AND ((longitude >= ('-180'::integer)::double precision) AND (longitude <= (180)::double precision)) AND (boundary_distance_m >= (250)::double precision)) OR ((status = 'NEEDS_REVIEW'::text) AND (cardinality(reasons) > 0)))),
 CONSTRAINT us_geo_time_window_check CHECK (((expires_at > checked_at) AND (expires_at <= (checked_at + '30 days'::interval)))),
 CONSTRAINT us_location_geo_verifications_address_fingerprint_sha256_check CHECK ((address_fingerprint_sha256 ~ '^[0-9a-f]{64}$'::text)),
 CONSTRAINT us_location_geo_verifications_census_benchmark_check CHECK ((census_benchmark = 'Public_AR_Current'::text)),
 CONSTRAINT us_location_geo_verifications_dataset_sha256_check CHECK ((dataset_sha256 = '2da5f1e980e70f53c781e1416e8e47bee03b98160353951c886a9901f525550a'::text)),
 CONSTRAINT us_location_geo_verifications_source_version_check CHECK ((source_version = '2026d'::text)),
 CONSTRAINT us_location_geo_verifications_status_check CHECK ((status = ANY (ARRAY['VERIFIED_GEOMETRY'::text,'NEEDS_REVIEW'::text])))
);
ALTER TABLE ONLY public.us_location_geo_verifications ADD CONSTRAINT us_location_geo_verifications_pkey PRIMARY KEY(location_id);
CREATE FUNCTION public.us_geo_location_fingerprint(
  p_state text,p_city text,p_street1 text,p_street2 text,
  p_postal text,p_tz text
) RETURNS text LANGUAGE sql IMMUTABLE
AS $fingerprint$
  SELECT encode(sha256(convert_to(
    upper(coalesce(p_state,'')) || chr(31) ||
    btrim(regexp_replace(upper(coalesce(p_city,'')), '[^A-Z0-9]+', ' ', 'g')) || chr(31) ||
    btrim(regexp_replace(upper(coalesce(p_street1,'')), '[^A-Z0-9]+', ' ', 'g')) || chr(31) ||
    btrim(regexp_replace(upper(coalesce(p_street2,'')), '[^A-Z0-9]+', ' ', 'g')) || chr(31) ||
    coalesce(p_postal,'') || chr(31) || coalesce(p_tz,''),
    'UTF8')),'hex')
$fingerprint$;
