-- Schema-only selected DDL, PostgreSQL production snapshot 2026-11-16.
-- SHA256 c153acab284b2c37cc2b9a404b5cf243e4b5fe6e3df1f63241d8ff35c77f0e62
-- Isolated disposable test only. No production rows or credentials.
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
ALTER TABLE ONLY public.audit_events ALTER COLUMN id SET DEFAULT nextval('public.audit_events_id_seq'::regclass);
ALTER TABLE ONLY public.audit_events
    ADD CONSTRAINT audit_events_pkey PRIMARY KEY (id);
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
ALTER TABLE ONLY public.billing_subscriptions ALTER COLUMN id SET DEFAULT nextval('public.billing_subscriptions_id_seq'::regclass);
ALTER TABLE ONLY public.billing_subscriptions
    ADD CONSTRAINT billing_subscriptions_owner_unique UNIQUE (owner_type, owner_id);
ALTER TABLE ONLY public.billing_subscriptions
    ADD CONSTRAINT billing_subscriptions_pkey PRIMARY KEY (id);
CREATE INDEX idx_billing_subscriptions_next_charge ON public.billing_subscriptions USING btree (next_charge_at);
CREATE INDEX idx_billing_subscriptions_owner ON public.billing_subscriptions USING btree (owner_type, owner_id);
CREATE INDEX idx_billing_subscriptions_status ON public.billing_subscriptions USING btree (subscription_status);
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
ALTER TABLE ONLY public.owner_opening_requests ALTER COLUMN id SET DEFAULT nextval('public.owner_opening_requests_id_seq'::regclass);
ALTER TABLE ONLY public.owner_opening_requests
    ADD CONSTRAINT owner_opening_requests_pkey PRIMARY KEY (id);
CREATE INDEX idx_owner_opening_requests_created_at ON public.owner_opening_requests USING btree (created_at DESC);
CREATE INDEX idx_owner_opening_requests_email ON public.owner_opening_requests USING btree (email);
CREATE INDEX idx_owner_opening_requests_email_status ON public.owner_opening_requests USING btree (email_status);
CREATE INDEX idx_owner_opening_requests_owner_type ON public.owner_opening_requests USING btree (owner_type);
CREATE INDEX idx_owner_opening_requests_slug_final ON public.owner_opening_requests USING btree (slug_final);
CREATE INDEX idx_owner_opening_requests_status ON public.owner_opening_requests USING btree (status);
CREATE TABLE public.async_jobs (
    id bigint NOT NULL,
    job_type text NOT NULL,
    payload jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 5 NOT NULL,
    run_at timestamp without time zone DEFAULT now() NOT NULL,
    last_error text,
    idempotency_key text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE public.async_jobs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER TABLE ONLY public.async_jobs ALTER COLUMN id SET DEFAULT nextval('public.async_jobs_id_seq'::regclass);
ALTER TABLE ONLY public.async_jobs
    ADD CONSTRAINT async_jobs_pkey PRIMARY KEY (id);
CREATE INDEX idx_async_jobs_pending ON public.async_jobs USING btree (status, run_at);
CREATE UNIQUE INDEX uniq_async_jobs_idem ON public.async_jobs USING btree (job_type, idempotency_key) WHERE (idempotency_key IS NOT NULL);