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
