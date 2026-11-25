-- Selected schema-only from 24 Nov 2026 verified pre-T5 archive. CI ONLY.
-- No production rows, secrets, role grants, functions, or external-table FKs.
-- Exact T5 additive DDL appended for disposable schema construction, not Production migration.

CREATE TABLE public.billing_subscriptions (
    id bigint NOT NULL,
    owner_type text NOT NULL,
    owner_id bigint NOT NULL,
    billing_model text DEFAULT 'subscription'::text NOT NULL,
    subscription_status text DEFAULT 'active'::text NOT NULL,
    subscription_period_days integer DEFAULT 30 NOT NULL,
    amount integer NOT NULL,
    currency text NOT NULL,
    wallet_only boolean DEFAULT true NOT NULL,
    current_period_start timestamp with time zone,
    current_period_end timestamp with time zone,
    grace_period_days integer DEFAULT 3 NOT NULL,
    grace_until timestamp with time zone,
    last_charge_at timestamp with time zone,
    next_charge_at timestamp with time zone,
    last_charge_status text,
    blocked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT billing_subscriptions_amount_check CHECK ((amount >= 0)),
    CONSTRAINT billing_subscriptions_grace_period_days_check CHECK ((grace_period_days >= 0)),
    CONSTRAINT billing_subscriptions_owner_type_check CHECK ((owner_type = ANY (ARRAY['salon'::text, 'master'::text]))),
    CONSTRAINT billing_subscriptions_subscription_period_days_check CHECK ((subscription_period_days > 0)),
    CONSTRAINT billing_subscriptions_subscription_status_check CHECK ((subscription_status = ANY (ARRAY['active'::text, 'grace'::text, 'blocked'::text, 'cancelled'::text])))
);

CREATE TABLE public.owner_opening_requests (
    id bigint NOT NULL,
    owner_type text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    name text NOT NULL,
    slug_requested text,
    slug_final text,
    email text NOT NULL,
    phone_raw text,
    phone_normalized text,
    city text,
    address text,
    description text,
    specialization text,
    work_mode text,
    salon_slug text,
    admin_notes text,
    created_owner_id bigint,
    created_auth_user_id bigint,
    moderation_case_id bigint,
    message_id bigint,
    precheck_result_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    provision_result_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    links_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    email_preview_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    email_status text DEFAULT 'not_ready'::text NOT NULL,
    email_sent_at timestamp with time zone,
    email_error text,
    created_by_admin_id bigint,
    created_by_admin_email text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    validated_at timestamp with time zone,
    approved_at timestamp with time zone,
    provisioned_at timestamp with time zone,
    rejected_at timestamp with time zone,
    suspended_at timestamp with time zone,
    activated_at timestamp with time zone,
    source_namespace text,
    source_company_id integer,
    source_website_id integer,
    source_partner_id bigint,
    source_request_id text,
    CONSTRAINT owner_opening_requests_email_status_check CHECK ((email_status = ANY (ARRAY['not_ready'::text, 'ready'::text, 'sent'::text, 'failed'::text]))),
    CONSTRAINT owner_opening_requests_owner_type_check CHECK ((owner_type = ANY (ARRAY['salon'::text, 'master'::text]))),
    CONSTRAINT owner_opening_requests_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'validated'::text, 'validation_failed'::text, 'approved'::text, 'provisioning'::text, 'provisioned'::text, 'email_ready'::text, 'email_sent'::text, 'email_failed'::text, 'activated'::text, 'rejected'::text, 'suspended'::text, 'failed'::text]))),
    CONSTRAINT owner_opening_requests_work_mode_check CHECK (((work_mode IS NULL) OR (work_mode = ANY (ARRAY['independent'::text, 'attached_to_salon'::text]))))
);

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

CREATE TABLE public.masters (
    id integer NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    user_id integer NOT NULL
);

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

CREATE TABLE public.owner_salon (
    id bigint NOT NULL,
    owner_id text NOT NULL,
    salon_id bigint NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

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

CREATE TABLE public.auth_users (
    id integer NOT NULL,
    email text NOT NULL,
    role text NOT NULL,
    salon_slug text,
    master_slug text,
    enabled boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    master_id text,
    salon_id text,
    password_hash text,
    phone text,
    email_verified_at timestamp with time zone,
    phone_verified_at timestamp with time zone,
    password_changed_at timestamp with time zone,
    must_set_password boolean DEFAULT false NOT NULL,
    preferred_login_channel text,
    CONSTRAINT auth_users_master_binding CHECK (((role <> 'master'::text) OR ((master_slug IS NOT NULL) AND (salon_slug IS NULL)))),
    CONSTRAINT auth_users_master_password_required_v2 CHECK (((role <> 'master'::text) OR (password_hash IS NOT NULL) OR (must_set_password = true))),
    CONSTRAINT auth_users_phone_canonical_check CHECK (((phone IS NULL) OR (phone ~ '^\+[1-9][0-9]{7,14}$'::text))),
    CONSTRAINT auth_users_preferred_login_channel_check CHECK (((preferred_login_channel IS NULL) OR (preferred_login_channel = ANY (ARRAY['email'::text, 'whatsapp'::text])))),
    CONSTRAINT auth_users_role_check CHECK ((role = ANY (ARRAY['salon_admin'::text, 'master'::text, 'admin'::text]))),
    CONSTRAINT auth_users_salon_admin_binding CHECK (((role <> 'salon_admin'::text) OR ((salon_slug IS NOT NULL) AND (master_slug IS NULL))))
);

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

CREATE TABLE public.us_salon_locations (
    id bigint NOT NULL,
    salon_id integer NOT NULL,
    location_code text NOT NULL,
    state_code text NOT NULL,
    city_name text NOT NULL,
    street_line1 text NOT NULL,
    street_line2 text,
    postal_code text NOT NULL,
    timezone_name text NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT us_salon_locations_city_check CHECK ((length(TRIM(BOTH FROM city_name)) > 0)),
    CONSTRAINT us_salon_locations_code_check CHECK ((location_code ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text)),
    CONSTRAINT us_salon_locations_street_check CHECK ((length(TRIM(BOTH FROM street_line1)) > 0)),
    CONSTRAINT us_salon_locations_zip_check CHECK ((postal_code ~ '^[0-9]{5}(-[0-9]{4})?$'::text))
);

CREATE TABLE public.salon_master_services (
    id integer NOT NULL,
    salon_id integer NOT NULL,
    master_id integer NOT NULL,
    service_pk integer NOT NULL,
    price integer NOT NULL,
    duration_min integer NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    currency_code text,
    CONSTRAINT salon_master_services_currency_code_check CHECK (((currency_code IS NULL) OR (currency_code ~ '^[A-Z]{3}$'::text))),
    CONSTRAINT salon_master_services_duration_min_check CHECK ((duration_min > 0)),
    CONSTRAINT salon_master_services_price_check CHECK ((price >= 0))
);

CREATE TABLE public.services (
    id integer NOT NULL,
    service_id text NOT NULL,
    name text NOT NULL,
    duration_min integer NOT NULL,
    price integer NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    currency_code text,
    CONSTRAINT services_currency_code_check CHECK (((currency_code IS NULL) OR (currency_code ~ '^[A-Z]{3}$'::text)))
);

CREATE TABLE public.messages (
    id bigint NOT NULL,
    lead_id bigint,
    moderation_case_id bigint,
    status text NOT NULL,
    idempotency_key text,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.traces (
    id bigint NOT NULL,
    message_id bigint NOT NULL,
    attempt integer DEFAULT 1 NOT NULL,
    status text NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.audit_events (
    id bigint NOT NULL,
    event_type text NOT NULL,
    actor text NOT NULL,
    lead_id text,
    core_user_id bigint,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.us_owner_service_tax_settings (
    owner_type text NOT NULL,
    owner_id integer NOT NULL,
    market_id bigint NOT NULL,
    rate_bps integer DEFAULT 0 NOT NULL,
    revision bigint DEFAULT 1 NOT NULL,
    updated_by_user_id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT us_owner_service_tax_settings_owner_id_check CHECK ((owner_id > 0)),
    CONSTRAINT us_owner_service_tax_settings_owner_type_check CHECK ((owner_type = ANY (ARRAY['salon'::text, 'master'::text]))),
    CONSTRAINT us_owner_service_tax_settings_rate_bps_check CHECK (((rate_bps >= 0) AND (rate_bps <= 10000))),
    CONSTRAINT us_owner_service_tax_settings_revision_check CHECK ((revision >= 1))
);

CREATE TABLE public.us_service_price_amounts (
    salon_master_service_id integer NOT NULL,
    market_id bigint NOT NULL,
    amount_minor bigint NOT NULL,
    currency_code text DEFAULT 'USD'::text NOT NULL,
    price_version bigint DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT us_service_price_amounts_amount_minor_check CHECK (((amount_minor >= 1) AND (amount_minor <= 99999999))),
    CONSTRAINT us_service_price_amounts_currency_code_check CHECK ((currency_code = 'USD'::text)),
    CONSTRAINT us_service_price_amounts_price_version_check CHECK ((price_version > 0))
);

CREATE TABLE public.us_location_master_working_hours (
    location_id bigint NOT NULL,
    master_id integer NOT NULL,
    weekday integer NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    break_start time without time zone,
    break_end time without time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT us_location_master_hours_break_check CHECK ((((break_start IS NULL) AND (break_end IS NULL)) OR ((break_start IS NOT NULL) AND (break_end IS NOT NULL) AND (break_start < break_end) AND (break_start >= start_time) AND (break_end <= end_time)))),
    CONSTRAINT us_location_master_hours_order_check CHECK ((start_time < end_time)),
    CONSTRAINT us_location_master_working_hours_weekday_check CHECK (((weekday >= 0) AND (weekday <= 6)))
);

CREATE SEQUENCE public.billing_subscriptions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER TABLE ONLY public.billing_subscriptions ALTER COLUMN id SET DEFAULT nextval('public.billing_subscriptions_id_seq'::regclass);

CREATE SEQUENCE public.owner_opening_requests_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER TABLE ONLY public.owner_opening_requests ALTER COLUMN id SET DEFAULT nextval('public.owner_opening_requests_id_seq'::regclass);

CREATE SEQUENCE public.salons_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER TABLE ONLY public.salons ALTER COLUMN id SET DEFAULT nextval('public.salons_id_seq'::regclass);

CREATE SEQUENCE public.masters_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER TABLE ONLY public.masters ALTER COLUMN id SET DEFAULT nextval('public.masters_id_seq'::regclass);

CREATE SEQUENCE public.master_salon_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER TABLE ONLY public.master_salon ALTER COLUMN id SET DEFAULT nextval('public.master_salon_id_seq'::regclass);

CREATE SEQUENCE public.owner_salon_new_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER TABLE ONLY public.owner_salon ALTER COLUMN id SET DEFAULT nextval('public.owner_salon_new_id_seq'::regclass);

CREATE SEQUENCE public.markets_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER TABLE ONLY public.markets ALTER COLUMN id SET DEFAULT nextval('public.markets_id_seq'::regclass);

CREATE SEQUENCE public.auth_users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER TABLE ONLY public.auth_users ALTER COLUMN id SET DEFAULT nextval('public.auth_users_id_seq'::regclass);

CREATE SEQUENCE public.us_salon_locations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER TABLE ONLY public.us_salon_locations ALTER COLUMN id SET DEFAULT nextval('public.us_salon_locations_id_seq'::regclass);

CREATE SEQUENCE public.services_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER TABLE ONLY public.services ALTER COLUMN id SET DEFAULT nextval('public.services_id_seq'::regclass);

CREATE SEQUENCE public.audit_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER TABLE ONLY public.audit_events ALTER COLUMN id SET DEFAULT nextval('public.audit_events_id_seq'::regclass);

ALTER TABLE ONLY public.billing_subscriptions
    ADD CONSTRAINT billing_subscriptions_owner_unique UNIQUE (owner_type, owner_id);

ALTER TABLE ONLY public.billing_subscriptions
    ADD CONSTRAINT billing_subscriptions_pkey PRIMARY KEY (id);

CREATE INDEX idx_billing_subscriptions_next_charge ON public.billing_subscriptions USING btree (next_charge_at);

CREATE INDEX idx_billing_subscriptions_owner ON public.billing_subscriptions USING btree (owner_type, owner_id);

CREATE INDEX idx_billing_subscriptions_status ON public.billing_subscriptions USING btree (subscription_status);

ALTER TABLE ONLY public.owner_opening_requests
    ADD CONSTRAINT owner_opening_requests_pkey PRIMARY KEY (id);

CREATE INDEX idx_owner_opening_requests_created_at ON public.owner_opening_requests USING btree (created_at DESC);

CREATE INDEX idx_owner_opening_requests_email ON public.owner_opening_requests USING btree (email);

CREATE INDEX idx_owner_opening_requests_email_status ON public.owner_opening_requests USING btree (email_status);

CREATE INDEX idx_owner_opening_requests_owner_type ON public.owner_opening_requests USING btree (owner_type);

CREATE INDEX idx_owner_opening_requests_slug_final ON public.owner_opening_requests USING btree (slug_final);

CREATE INDEX idx_owner_opening_requests_status ON public.owner_opening_requests USING btree (status);

CREATE UNIQUE INDEX ux_open_owner_odoo_source_role ON public.owner_opening_requests USING btree (source_namespace, source_company_id, source_website_id, source_request_id, owner_type) WHERE ((source_namespace = 'odoo_online'::text) AND (source_request_id IS NOT NULL));

ALTER TABLE ONLY public.salons
    ADD CONSTRAINT salons_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.salons
    ADD CONSTRAINT salons_slug_key UNIQUE (slug);

ALTER TABLE ONLY public.masters
    ADD CONSTRAINT masters_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.masters
    ADD CONSTRAINT masters_slug_key UNIQUE (slug);


ALTER TABLE ONLY public.master_salon
    ADD CONSTRAINT master_salon_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.master_salon
    ADD CONSTRAINT ux_master_salon_pair UNIQUE (master_id, salon_id);



CREATE INDEX idx_master_salon_master_id ON public.master_salon USING btree (master_id);

CREATE INDEX idx_master_salon_salon_id ON public.master_salon USING btree (salon_id);

ALTER TABLE ONLY public.owner_salon
    ADD CONSTRAINT owner_salon_new_pkey PRIMARY KEY (id);

CREATE INDEX idx_owner_salon_owner_id ON public.owner_salon USING btree (owner_id);

CREATE INDEX idx_owner_salon_salon_id ON public.owner_salon USING btree (salon_id);

CREATE UNIQUE INDEX ux_owner_salon ON public.owner_salon USING btree (owner_id, salon_id);

ALTER TABLE ONLY public.markets
    ADD CONSTRAINT markets_code_key UNIQUE (code);

ALTER TABLE ONLY public.markets
    ADD CONSTRAINT markets_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.tenant_market_settings
    ADD CONSTRAINT tenant_market_settings_pkey PRIMARY KEY (salon_id);



CREATE INDEX tenant_market_settings_city_idx ON public.tenant_market_settings USING btree (city_id);

CREATE INDEX tenant_market_settings_market_idx ON public.tenant_market_settings USING btree (market_id);

ALTER TABLE ONLY public.auth_users
    ADD CONSTRAINT auth_users_email_role_key UNIQUE (email, role);

ALTER TABLE ONLY public.auth_users
    ADD CONSTRAINT auth_users_pkey PRIMARY KEY (id);

CREATE UNIQUE INDEX auth_users_phone_unique ON public.auth_users USING btree (phone) WHERE (phone IS NOT NULL);

CREATE INDEX idx_auth_users_email_lower ON public.auth_users USING btree (lower(email));

ALTER TABLE ONLY public.auth_sessions
    ADD CONSTRAINT auth_sessions_pkey PRIMARY KEY (id);


CREATE INDEX idx_auth_sessions_expires_at ON public.auth_sessions USING btree (expires_at);

CREATE INDEX idx_auth_sessions_last_seen_at ON public.auth_sessions USING btree (last_seen_at);

CREATE INDEX idx_auth_sessions_revoked_at ON public.auth_sessions USING btree (revoked_at);

CREATE INDEX idx_auth_sessions_user_id ON public.auth_sessions USING btree (user_id);

ALTER TABLE ONLY public.us_salon_locations
    ADD CONSTRAINT us_salon_locations_per_salon_code UNIQUE (salon_id, location_code);

ALTER TABLE ONLY public.us_salon_locations
    ADD CONSTRAINT us_salon_locations_pkey PRIMARY KEY (id);


CREATE INDEX us_salon_locations_by_salon_idx ON public.us_salon_locations USING btree (salon_id, enabled);

CREATE INDEX us_salon_locations_by_state_idx ON public.us_salon_locations USING btree (state_code, city_name);

CREATE UNIQUE INDEX us_salon_locations_one_primary_per_salon_idx ON public.us_salon_locations USING btree (salon_id) WHERE (is_primary = true);

ALTER TABLE ONLY public.salon_master_services
    ADD CONSTRAINT salon_master_services_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.salon_master_services
    ADD CONSTRAINT uq_sms_unique UNIQUE (salon_id, master_id, service_pk);




CREATE INDEX idx_sms_master_active ON public.salon_master_services USING btree (master_id, active);

CREATE INDEX idx_sms_salon_active ON public.salon_master_services USING btree (salon_id, active);

CREATE INDEX idx_sms_service ON public.salon_master_services USING btree (service_pk);

CREATE UNIQUE INDEX ux_sms_single_active ON public.salon_master_services USING btree (salon_id, master_id, service_pk) WHERE (active = true);

ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_service_id_key UNIQUE (service_id);

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);

CREATE INDEX idx_messages_created_at ON public.messages USING btree (created_at);

CREATE INDEX idx_messages_lead_id ON public.messages USING btree (lead_id);

CREATE INDEX idx_messages_moderation_case_id ON public.messages USING btree (moderation_case_id);

CREATE INDEX idx_messages_status ON public.messages USING btree (status);

CREATE UNIQUE INDEX ux_messages_idempotency_key ON public.messages USING btree (idempotency_key) WHERE (idempotency_key IS NOT NULL);

ALTER TABLE ONLY public.traces
    ADD CONSTRAINT traces_pkey PRIMARY KEY (id);


CREATE INDEX idx_traces_created_at ON public.traces USING btree (created_at);

CREATE INDEX idx_traces_message_id ON public.traces USING btree (message_id);

CREATE INDEX idx_traces_status ON public.traces USING btree (status);

ALTER TABLE ONLY public.audit_events
    ADD CONSTRAINT audit_events_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.us_owner_service_tax_settings
    ADD CONSTRAINT us_owner_service_tax_settings_pkey PRIMARY KEY (owner_type, owner_id);



CREATE INDEX us_owner_service_tax_settings_market_idx ON public.us_owner_service_tax_settings USING btree (market_id, owner_type, owner_id);

ALTER TABLE ONLY public.us_service_price_amounts
    ADD CONSTRAINT us_service_price_amounts_pkey PRIMARY KEY (salon_master_service_id);



ALTER TABLE ONLY public.us_location_master_working_hours
    ADD CONSTRAINT us_location_master_hours_pk PRIMARY KEY (location_id, master_id, weekday);



ALTER TABLE public.billing_subscriptions
  ADD COLUMN provider_namespace TEXT,
  ADD COLUMN provider_company_id INTEGER,
  ADD COLUMN provider_website_id INTEGER,
  ADD COLUMN provider_partner_id BIGINT,
  ADD COLUMN provider_source_request_id TEXT,
  ADD COLUMN provider_subscription_order_id BIGINT,
  ADD COLUMN provider_invoice_id BIGINT,
  ADD COLUMN provider_policy_version TEXT,
  ADD COLUMN provider_verified_at TIMESTAMPTZ,
  ADD COLUMN provider_revoked_at TIMESTAMPTZ;

ALTER TABLE public.billing_subscriptions
    ADD CONSTRAINT ck_billing_us_odoo_projection_exact
    CHECK (
      (
        provider_namespace IS NULL AND provider_company_id IS NULL
        AND provider_website_id IS NULL AND provider_partner_id IS NULL
        AND provider_source_request_id IS NULL
        AND provider_subscription_order_id IS NULL
        AND provider_invoice_id IS NULL
        AND provider_policy_version IS NULL
        AND provider_verified_at IS NULL AND provider_revoked_at IS NULL
      ) OR (
        provider_namespace IS NOT NULL AND provider_namespace = 'odoo_online'
        AND provider_company_id = 4 AND provider_company_id IS NOT NULL
        AND provider_website_id = 5 AND provider_website_id IS NOT NULL
        AND provider_partner_id IS NOT NULL AND provider_partner_id > 0
        AND provider_source_request_id IS NOT NULL
        AND provider_source_request_id = ('odoo-us-partner-' || provider_partner_id::text)
        AND provider_subscription_order_id IS NOT NULL
        AND provider_subscription_order_id > 0
        AND provider_invoice_id IS NOT NULL AND provider_invoice_id > 0
        AND provider_policy_version IS NOT NULL
        AND length(provider_policy_version) BETWEEN 1 AND 40
        AND provider_verified_at IS NOT NULL
        AND wallet_only IS FALSE AND currency = 'USD' AND billing_model = 'subscription'
        AND grace_until IS NULL
        AND current_period_start IS NOT NULL
        AND current_period_end IS NOT NULL
        AND current_period_end > current_period_start
      )
    );

CREATE UNIQUE INDEX ux_billing_odoo_source_role
  ON public.billing_subscriptions (
    provider_namespace,provider_company_id,provider_website_id,
    provider_source_request_id,owner_type
  )
  WHERE provider_namespace='odoo_online';

CREATE INDEX idx_billing_odoo_projection_due
  ON public.billing_subscriptions (
    current_period_end,provider_verified_at
  ) WHERE provider_namespace='odoo_online';

ALTER TABLE ONLY public.masters
    ADD CONSTRAINT fk_masters_user FOREIGN KEY (user_id) REFERENCES public.auth_users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.master_salon
    ADD CONSTRAINT fk_ms_master FOREIGN KEY (master_id) REFERENCES public.masters(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.master_salon
    ADD CONSTRAINT fk_ms_salon FOREIGN KEY (salon_id) REFERENCES public.salons(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.tenant_market_settings
    ADD CONSTRAINT tenant_market_settings_market_id_fkey FOREIGN KEY (market_id) REFERENCES public.markets(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.tenant_market_settings
    ADD CONSTRAINT tenant_market_settings_salon_id_fkey FOREIGN KEY (salon_id) REFERENCES public.salons(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.auth_sessions
    ADD CONSTRAINT auth_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.auth_users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.us_salon_locations
    ADD CONSTRAINT us_salon_locations_salon_id_fkey FOREIGN KEY (salon_id) REFERENCES public.salons(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.salon_master_services
    ADD CONSTRAINT fk_sms_master FOREIGN KEY (master_id) REFERENCES public.masters(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.salon_master_services
    ADD CONSTRAINT fk_sms_salon FOREIGN KEY (salon_id) REFERENCES public.salons(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.salon_master_services
    ADD CONSTRAINT fk_sms_service FOREIGN KEY (service_pk) REFERENCES public.services(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.traces
    ADD CONSTRAINT traces_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.us_owner_service_tax_settings
    ADD CONSTRAINT us_owner_service_tax_settings_market_id_fkey FOREIGN KEY (market_id) REFERENCES public.markets(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.us_owner_service_tax_settings
    ADD CONSTRAINT us_owner_service_tax_settings_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.auth_users(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.us_service_price_amounts
    ADD CONSTRAINT us_service_price_amounts_market_id_fkey FOREIGN KEY (market_id) REFERENCES public.markets(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.us_service_price_amounts
    ADD CONSTRAINT us_service_price_amounts_salon_master_service_id_fkey FOREIGN KEY (salon_master_service_id) REFERENCES public.salon_master_services(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.us_location_master_working_hours
    ADD CONSTRAINT us_location_master_working_hours_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.us_salon_locations(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.us_location_master_working_hours
    ADD CONSTRAINT us_location_master_working_hours_master_id_fkey FOREIGN KEY (master_id) REFERENCES public.masters(id) ON DELETE RESTRICT;

ALTER TABLE public.messages ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.messages_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE public.traces ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.traces_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE public.salon_master_services ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.salon_master_services_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
