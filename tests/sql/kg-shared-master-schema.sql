-- Selected schema-only exact tables, PK/unique constraints and sequences from hash-verified 2026-11-16 snapshot; no customer data, dependency FKs omitted. Disposable test DB only.
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
CREATE SEQUENCE public.auth_users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.auth_users_id_seq OWNED BY public.auth_users.id;
ALTER TABLE ONLY public.auth_users ALTER COLUMN id SET DEFAULT nextval('public.auth_users_id_seq'::regclass);
ALTER TABLE ONLY public.auth_users
    ADD CONSTRAINT auth_users_email_role_key UNIQUE (email, role);
ALTER TABLE ONLY public.auth_users
    ADD CONSTRAINT auth_users_pkey PRIMARY KEY (id);
CREATE UNIQUE INDEX auth_users_phone_unique ON public.auth_users USING btree (phone) WHERE (phone IS NOT NULL);
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
CREATE TABLE public.auth_otps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id integer,
    channel text NOT NULL,
    target text NOT NULL,
    purpose text NOT NULL,
    code_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    attempts_used integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 5 NOT NULL,
    blocked_until timestamp with time zone,
    resend_available_at timestamp with time zone NOT NULL,
    consumed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT auth_otps_attempts_used_check CHECK ((attempts_used >= 0)),
    CONSTRAINT auth_otps_channel_check CHECK ((channel = ANY (ARRAY['email'::text, 'whatsapp'::text]))),
    CONSTRAINT auth_otps_max_attempts_check CHECK ((max_attempts > 0)),
    CONSTRAINT auth_otps_purpose_check CHECK ((purpose = ANY (ARRAY['signup_verify'::text, 'email_verify'::text, 'phone_verify'::text, 'password_reset'::text, 'login_verify'::text])))
);
ALTER TABLE ONLY public.auth_otps
    ADD CONSTRAINT auth_otps_pkey PRIMARY KEY (id);
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
CREATE SEQUENCE public.salons_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.salons_id_seq OWNED BY public.salons.id;
ALTER TABLE ONLY public.salons ALTER COLUMN id SET DEFAULT nextval('public.salons_id_seq'::regclass);
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
CREATE SEQUENCE public.masters_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.masters_id_seq OWNED BY public.masters.id;
ALTER TABLE ONLY public.masters ALTER COLUMN id SET DEFAULT nextval('public.masters_id_seq'::regclass);
ALTER TABLE ONLY public.masters
    ADD CONSTRAINT masters_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.masters
    ADD CONSTRAINT masters_slug_key UNIQUE (slug);
CREATE TABLE public.owner_salon (
    id bigint NOT NULL,
    owner_id text NOT NULL,
    salon_id bigint NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);
CREATE SEQUENCE public.owner_salon_new_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.owner_salon_new_id_seq OWNED BY public.owner_salon.id;
ALTER TABLE ONLY public.owner_salon ALTER COLUMN id SET DEFAULT nextval('public.owner_salon_new_id_seq'::regclass);
ALTER TABLE ONLY public.owner_salon
    ADD CONSTRAINT owner_salon_new_pkey PRIMARY KEY (id);
CREATE UNIQUE INDEX ux_owner_salon ON public.owner_salon USING btree (owner_id, salon_id);
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
CREATE SEQUENCE public.master_salon_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.master_salon_id_seq OWNED BY public.master_salon.id;
ALTER TABLE ONLY public.master_salon ALTER COLUMN id SET DEFAULT nextval('public.master_salon_id_seq'::regclass);
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
CREATE SEQUENCE public.markets_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.markets_id_seq OWNED BY public.markets.id;
ALTER TABLE ONLY public.markets ALTER COLUMN id SET DEFAULT nextval('public.markets_id_seq'::regclass);
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
CREATE SEQUENCE public.owner_opening_requests_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.owner_opening_requests_id_seq OWNED BY public.owner_opening_requests.id;
ALTER TABLE ONLY public.owner_opening_requests ALTER COLUMN id SET DEFAULT nextval('public.owner_opening_requests_id_seq'::regclass);
ALTER TABLE ONLY public.owner_opening_requests
    ADD CONSTRAINT owner_opening_requests_pkey PRIMARY KEY (id);
CREATE TABLE public.moderation_cases (
    id bigint NOT NULL,
    lead_id bigint,
    status text NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.moderation_cases ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.moderation_cases_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
ALTER TABLE ONLY public.moderation_cases
    ADD CONSTRAINT moderation_cases_pkey PRIMARY KEY (id);
CREATE TABLE public.audit_events (
    id bigint NOT NULL,
    event_type text NOT NULL,
    actor text NOT NULL,
    lead_id text,
    core_user_id bigint,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE public.audit_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.audit_events_id_seq OWNED BY public.audit_events.id;
ALTER TABLE ONLY public.audit_events ALTER COLUMN id SET DEFAULT nextval('public.audit_events_id_seq'::regclass);
ALTER TABLE ONLY public.audit_events
    ADD CONSTRAINT audit_events_pkey PRIMARY KEY (id);
CREATE TABLE public.slug_reservations (
    id bigint NOT NULL,
    owner_type text NOT NULL,
    owner_id bigint,
    slug text NOT NULL,
    status text DEFAULT 'reserved'::text NOT NULL,
    meta jsonb DEFAULT '{}'::jsonb NOT NULL,
    reserved_at timestamp with time zone DEFAULT now() NOT NULL,
    activated_at timestamp with time zone,
    released_at timestamp with time zone,
    expires_at timestamp with time zone DEFAULT (now() + '72:00:00'::interval) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE public.slug_reservations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.slug_reservations_id_seq OWNED BY public.slug_reservations.id;
ALTER TABLE ONLY public.slug_reservations ALTER COLUMN id SET DEFAULT nextval('public.slug_reservations_id_seq'::regclass);
ALTER TABLE ONLY public.slug_reservations
    ADD CONSTRAINT slug_reservations_pkey PRIMARY KEY (id);
CREATE UNIQUE INDEX slug_reservations_active_slug_idx ON public.slug_reservations USING btree (owner_type, lower(slug)) WHERE (status = ANY (ARRAY['reserved'::text, 'activated'::text]));

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
CREATE SEQUENCE public.billing_subscriptions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.billing_subscriptions_id_seq OWNED BY public.billing_subscriptions.id;
ALTER TABLE ONLY public.billing_subscriptions ALTER COLUMN id SET DEFAULT nextval('public.billing_subscriptions_id_seq'::regclass);
ALTER TABLE ONLY public.billing_subscriptions
    ADD CONSTRAINT billing_subscriptions_owner_unique UNIQUE (owner_type, owner_id);
ALTER TABLE ONLY public.billing_subscriptions
    ADD CONSTRAINT billing_subscriptions_pkey PRIMARY KEY (id);

-- CI fixture parity with verified 24 Nov source schema and committed T5 structure. No production migration.
CREATE UNIQUE INDEX ux_open_owner_odoo_source_role ON public.owner_opening_requests USING btree (source_namespace, source_company_id, source_website_id, source_request_id, owner_type) WHERE ((source_namespace = 'odoo_online'::text) AND (source_request_id IS NOT NULL));
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
