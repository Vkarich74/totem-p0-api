--
-- PostgreSQL database dump
--

\restrict g6y0RNIr8rXiWS3RKNVTR48e36QVtUnM8SMKCj3TIsUI59GpGonVqGUT0atPKfE

-- Dumped from database version 17.7 (Debian 17.7-3.pgdg13+1)
-- Dumped by pg_dump version 18.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: auth_magic_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_magic_links (
    id integer NOT NULL,
    user_id integer NOT NULL,
    token text NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    used_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: auth_magic_links_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.auth_magic_links_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: auth_magic_links_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.auth_magic_links_id_seq OWNED BY public.auth_magic_links.id;


--
-- Name: auth_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_users (
    id integer NOT NULL,
    email text NOT NULL,
    role text NOT NULL,
    salon_slug text,
    master_slug text,
    enabled boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT auth_users_master_binding CHECK (((role <> 'master'::text) OR ((master_slug IS NOT NULL) AND (salon_slug IS NULL)))),
    CONSTRAINT auth_users_role_check CHECK ((role = ANY (ARRAY['salon_admin'::text, 'master'::text]))),
    CONSTRAINT auth_users_salon_admin_binding CHECK (((role <> 'salon_admin'::text) OR ((salon_slug IS NOT NULL) AND (master_slug IS NULL))))
);


--
-- Name: auth_users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.auth_users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: auth_users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.auth_users_id_seq OWNED BY public.auth_users.id;


--
-- Name: booking_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.booking_audit_log (
    id integer NOT NULL,
    booking_id integer NOT NULL,
    from_status text,
    to_status text NOT NULL,
    actor_type text NOT NULL,
    actor_id text,
    source text,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: booking_audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.booking_audit_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: booking_audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.booking_audit_log_id_seq OWNED BY public.booking_audit_log.id;


--
-- Name: bookings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bookings (
    id integer NOT NULL,
    salon_slug text NOT NULL,
    master_slug text NOT NULL,
    service_id text NOT NULL,
    date date NOT NULL,
    start_time time without time zone NOT NULL,
    status text DEFAULT 'pending_payment'::text,
    created_at timestamp without time zone DEFAULT now(),
    request_id text,
    CONSTRAINT bookings_status_check CHECK ((status = ANY (ARRAY['pending_payment'::text, 'paid'::text, 'expired'::text, 'cancelled'::text])))
);


--
-- Name: bookings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.bookings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: bookings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.bookings_id_seq OWNED BY public.bookings.id;


--
-- Name: masters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.masters (
    id integer NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: masters_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.masters_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: masters_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.masters_id_seq OWNED BY public.masters.id;


--
-- Name: owner_actions_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.owner_actions_audit_log (
    id integer NOT NULL,
    salon_slug text NOT NULL,
    actor_user_id integer NOT NULL,
    actor_email text NOT NULL,
    action_type text NOT NULL,
    entity_type text NOT NULL,
    entity_id text,
    request_id text,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: owner_actions_audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.owner_actions_audit_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: owner_actions_audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.owner_actions_audit_log_id_seq OWNED BY public.owner_actions_audit_log.id;


--
-- Name: payment_intents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_intents (
    intent_id integer NOT NULL,
    request_id integer NOT NULL,
    amount integer NOT NULL,
    currency text NOT NULL,
    status text NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: payment_intents_intent_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.payment_intents_intent_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payment_intents_intent_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.payment_intents_intent_id_seq OWNED BY public.payment_intents.intent_id;


--
-- Name: payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payments (
    id integer NOT NULL,
    booking_id integer,
    amount integer NOT NULL,
    provider text NOT NULL,
    status text NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    is_active boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT payments_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'failed'::text])))
);


--
-- Name: payments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.payments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.payments_id_seq OWNED BY public.payments.id;


--
-- Name: payouts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payouts (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    booking_id bigint NOT NULL,
    amount integer NOT NULL,
    status text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    payment_id integer NOT NULL,
    settlement_period_id bigint,
    gross_amount integer NOT NULL,
    take_rate_bps integer NOT NULL,
    platform_fee integer NOT NULL,
    provider_amount integer NOT NULL,
    payout_batch_id bigint,
    CONSTRAINT payouts_commission_check CHECK (((gross_amount >= 0) AND (platform_fee >= 0) AND (provider_amount >= 0) AND ((platform_fee + provider_amount) = gross_amount))),
    CONSTRAINT payouts_status_check CHECK ((status = ANY (ARRAY['created'::text, 'paid'::text, 'failed'::text])))
);


--
-- Name: platform_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_config (
    key text NOT NULL,
    value text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: public_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.public_tokens (
    id integer NOT NULL,
    token text NOT NULL,
    salon_id text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    rate_limit_per_min integer DEFAULT 60 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    revoked_at timestamp without time zone
);


--
-- Name: public_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.public_tokens_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: public_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.public_tokens_id_seq OWNED BY public.public_tokens.id;


--
-- Name: reconciliations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reconciliations (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    payment_id uuid NOT NULL,
    booking_id bigint NOT NULL,
    expected_status text NOT NULL,
    actual_status text NOT NULL,
    result text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT reconciliations_result_check CHECK ((result = ANY (ARRAY['ok'::text, 'mismatch'::text, 'not_found'::text])))
);


--
-- Name: settlement_payout_batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.settlement_payout_batches (
    id bigint NOT NULL,
    settlement_period_id bigint NOT NULL,
    total_gross integer NOT NULL,
    total_platform_fee integer NOT NULL,
    total_provider_amount integer NOT NULL,
    status text NOT NULL,
    paid_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT settlement_payout_batches_status_check CHECK ((status = ANY (ARRAY['ready'::text, 'paid'::text])))
);


--
-- Name: settlement_periods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.settlement_periods (
    id bigint NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    status text NOT NULL,
    closed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT settlement_periods_status_check CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text])))
);


--
-- Name: report_batches; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.report_batches AS
 SELECT b.id AS batch_id,
    b.settlement_period_id,
    sp.period_start,
    sp.period_end,
    b.total_gross,
    b.total_platform_fee,
    b.total_provider_amount,
    b.status AS batch_status,
    b.paid_at,
    b.created_at
   FROM (public.settlement_payout_batches b
     JOIN public.settlement_periods sp ON ((sp.id = b.settlement_period_id)))
  ORDER BY b.created_at DESC;


--
-- Name: report_financials_by_period; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.report_financials_by_period AS
 SELECT sp.id AS settlement_period_id,
    sp.period_start,
    sp.period_end,
    sp.status AS period_status,
    count(p.id) AS payouts_count,
    sum(p.gross_amount) AS gmv,
    sum(p.platform_fee) AS platform_fee,
    sum(p.provider_amount) AS provider_payout
   FROM (public.settlement_periods sp
     LEFT JOIN public.payouts p ON ((p.settlement_period_id = sp.id)))
  GROUP BY sp.id, sp.period_start, sp.period_end, sp.status
  ORDER BY sp.period_start;


--
-- Name: report_owner_kpi; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.report_owner_kpi AS
 SELECT count(DISTINCT sp.id) AS settlement_periods,
    count(DISTINCT b.id) AS batches,
    count(p.id) AS payouts_count,
    COALESCE(sum(p.gross_amount), (0)::bigint) AS gmv_total,
    COALESCE(sum(p.platform_fee), (0)::bigint) AS platform_revenue,
    COALESCE(sum(p.provider_amount), (0)::bigint) AS provider_payouts,
        CASE
            WHEN (sum(p.gross_amount) > 0) THEN round((((sum(p.platform_fee))::numeric * (100)::numeric) / (sum(p.gross_amount))::numeric), 2)
            ELSE (0)::numeric
        END AS take_rate_percent
   FROM ((public.settlement_periods sp
     LEFT JOIN public.settlement_payout_batches b ON ((b.settlement_period_id = sp.id)))
     LEFT JOIN public.payouts p ON ((p.settlement_period_id = sp.id)));


--
-- Name: salons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.salons (
    id integer NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    enabled boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: salons_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.salons_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: salons_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.salons_id_seq OWNED BY public.salons.id;


--
-- Name: services; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.services (
    id integer NOT NULL,
    service_id text NOT NULL,
    name text NOT NULL,
    duration_min integer NOT NULL,
    price integer NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: services_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.services_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: services_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.services_id_seq OWNED BY public.services.id;


--
-- Name: settlement_payout_batches_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.settlement_payout_batches_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: settlement_payout_batches_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.settlement_payout_batches_id_seq OWNED BY public.settlement_payout_batches.id;


--
-- Name: settlement_periods_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.settlement_periods_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: settlement_periods_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.settlement_periods_id_seq OWNED BY public.settlement_periods.id;


--
-- Name: auth_magic_links id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_magic_links ALTER COLUMN id SET DEFAULT nextval('public.auth_magic_links_id_seq'::regclass);


--
-- Name: auth_users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_users ALTER COLUMN id SET DEFAULT nextval('public.auth_users_id_seq'::regclass);


--
-- Name: booking_audit_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_audit_log ALTER COLUMN id SET DEFAULT nextval('public.booking_audit_log_id_seq'::regclass);


--
-- Name: bookings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings ALTER COLUMN id SET DEFAULT nextval('public.bookings_id_seq'::regclass);


--
-- Name: masters id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.masters ALTER COLUMN id SET DEFAULT nextval('public.masters_id_seq'::regclass);


--
-- Name: owner_actions_audit_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.owner_actions_audit_log ALTER COLUMN id SET DEFAULT nextval('public.owner_actions_audit_log_id_seq'::regclass);


--
-- Name: payment_intents intent_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_intents ALTER COLUMN intent_id SET DEFAULT nextval('public.payment_intents_intent_id_seq'::regclass);


--
-- Name: payments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments ALTER COLUMN id SET DEFAULT nextval('public.payments_id_seq'::regclass);


--
-- Name: public_tokens id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.public_tokens ALTER COLUMN id SET DEFAULT nextval('public.public_tokens_id_seq'::regclass);


--
-- Name: salons id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salons ALTER COLUMN id SET DEFAULT nextval('public.salons_id_seq'::regclass);


--
-- Name: services id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.services ALTER COLUMN id SET DEFAULT nextval('public.services_id_seq'::regclass);


--
-- Name: settlement_payout_batches id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settlement_payout_batches ALTER COLUMN id SET DEFAULT nextval('public.settlement_payout_batches_id_seq'::regclass);


--
-- Name: settlement_periods id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settlement_periods ALTER COLUMN id SET DEFAULT nextval('public.settlement_periods_id_seq'::regclass);


--
-- Name: auth_magic_links auth_magic_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_magic_links
    ADD CONSTRAINT auth_magic_links_pkey PRIMARY KEY (id);


--
-- Name: auth_magic_links auth_magic_links_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_magic_links
    ADD CONSTRAINT auth_magic_links_token_key UNIQUE (token);


--
-- Name: auth_users auth_users_email_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_users
    ADD CONSTRAINT auth_users_email_role_key UNIQUE (email, role);


--
-- Name: auth_users auth_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_users
    ADD CONSTRAINT auth_users_pkey PRIMARY KEY (id);


--
-- Name: booking_audit_log booking_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_audit_log
    ADD CONSTRAINT booking_audit_log_pkey PRIMARY KEY (id);


--
-- Name: bookings bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_pkey PRIMARY KEY (id);


--
-- Name: masters masters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.masters
    ADD CONSTRAINT masters_pkey PRIMARY KEY (id);


--
-- Name: masters masters_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.masters
    ADD CONSTRAINT masters_slug_key UNIQUE (slug);


--
-- Name: owner_actions_audit_log owner_actions_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.owner_actions_audit_log
    ADD CONSTRAINT owner_actions_audit_log_pkey PRIMARY KEY (id);


--
-- Name: payment_intents payment_intents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_intents
    ADD CONSTRAINT payment_intents_pkey PRIMARY KEY (intent_id);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: payouts payouts_booking_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payouts
    ADD CONSTRAINT payouts_booking_id_unique UNIQUE (booking_id);


--
-- Name: payouts payouts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payouts
    ADD CONSTRAINT payouts_pkey PRIMARY KEY (id);


--
-- Name: platform_config platform_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_config
    ADD CONSTRAINT platform_config_pkey PRIMARY KEY (key);


--
-- Name: public_tokens public_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.public_tokens
    ADD CONSTRAINT public_tokens_pkey PRIMARY KEY (id);


--
-- Name: public_tokens public_tokens_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.public_tokens
    ADD CONSTRAINT public_tokens_token_key UNIQUE (token);


--
-- Name: reconciliations reconciliations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reconciliations
    ADD CONSTRAINT reconciliations_pkey PRIMARY KEY (id);


--
-- Name: salons salons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salons
    ADD CONSTRAINT salons_pkey PRIMARY KEY (id);


--
-- Name: salons salons_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salons
    ADD CONSTRAINT salons_slug_key UNIQUE (slug);


--
-- Name: services services_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_pkey PRIMARY KEY (id);


--
-- Name: services services_service_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_service_id_key UNIQUE (service_id);


--
-- Name: settlement_payout_batches settlement_payout_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settlement_payout_batches
    ADD CONSTRAINT settlement_payout_batches_pkey PRIMARY KEY (id);


--
-- Name: settlement_payout_batches settlement_payout_batches_settlement_period_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settlement_payout_batches
    ADD CONSTRAINT settlement_payout_batches_settlement_period_id_key UNIQUE (settlement_period_id);


--
-- Name: settlement_periods settlement_periods_period_start_period_end_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settlement_periods
    ADD CONSTRAINT settlement_periods_period_start_period_end_key UNIQUE (period_start, period_end);


--
-- Name: settlement_periods settlement_periods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settlement_periods
    ADD CONSTRAINT settlement_periods_pkey PRIMARY KEY (id);


--
-- Name: idx_booking_audit_booking; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_audit_booking ON public.booking_audit_log USING btree (booking_id);


--
-- Name: idx_booking_audit_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_audit_created ON public.booking_audit_log USING btree (created_at);


--
-- Name: idx_owner_audit_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_owner_audit_action ON public.owner_actions_audit_log USING btree (action_type);


--
-- Name: idx_owner_audit_request; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_owner_audit_request ON public.owner_actions_audit_log USING btree (request_id);


--
-- Name: idx_owner_audit_salon_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_owner_audit_salon_created ON public.owner_actions_audit_log USING btree (salon_slug, created_at DESC);


--
-- Name: idx_public_tokens_salon; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_public_tokens_salon ON public.public_tokens USING btree (salon_id);


--
-- Name: idx_public_tokens_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_public_tokens_token ON public.public_tokens USING btree (token);


--
-- Name: ix_recon_booking; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_recon_booking ON public.reconciliations USING btree (booking_id);


--
-- Name: ix_recon_payment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_recon_payment ON public.reconciliations USING btree (payment_id);


--
-- Name: settlement_periods_only_one_open; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX settlement_periods_only_one_open ON public.settlement_periods USING btree (status) WHERE (status = 'open'::text);


--
-- Name: ux_bookings_request_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_bookings_request_id ON public.bookings USING btree (request_id) WHERE (request_id IS NOT NULL);


--
-- Name: ux_payments_active_booking; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_payments_active_booking ON public.payments USING btree (booking_id) WHERE (is_active = true);


--
-- Name: ux_payouts_booking; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_payouts_booking ON public.payouts USING btree (booking_id);


--
-- Name: auth_magic_links auth_magic_links_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_magic_links
    ADD CONSTRAINT auth_magic_links_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.auth_users(id) ON DELETE CASCADE;


--
-- Name: owner_actions_audit_log owner_actions_audit_log_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.owner_actions_audit_log
    ADD CONSTRAINT owner_actions_audit_log_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.auth_users(id);


--
-- Name: payouts payouts_batch_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payouts
    ADD CONSTRAINT payouts_batch_fk FOREIGN KEY (payout_batch_id) REFERENCES public.settlement_payout_batches(id);


--
-- Name: payouts payouts_payment_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payouts
    ADD CONSTRAINT payouts_payment_fk FOREIGN KEY (payment_id) REFERENCES public.payments(id);


--
-- Name: payouts payouts_settlement_period_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payouts
    ADD CONSTRAINT payouts_settlement_period_fk FOREIGN KEY (settlement_period_id) REFERENCES public.settlement_periods(id);


--
-- Name: settlement_payout_batches settlement_batches_period_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settlement_payout_batches
    ADD CONSTRAINT settlement_batches_period_fk FOREIGN KEY (settlement_period_id) REFERENCES public.settlement_periods(id);


--
-- PostgreSQL database dump complete
--

\unrestrict g6y0RNIr8rXiWS3RKNVTR48e36QVtUnM8SMKCj3TIsUI59GpGonVqGUT0atPKfE

