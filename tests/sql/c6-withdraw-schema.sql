-- Selected schema-only for disposable CI. No data, credentials or grants.

CREATE TABLE public.money_owner_balances (
    id bigint NOT NULL,
    owner_type character varying(32) NOT NULL,
    owner_id bigint NOT NULL,
    currency character varying(3) NOT NULL,
    provider_hold numeric(14,2) DEFAULT 0 NOT NULL,
    pending_settlement numeric(14,2) DEFAULT 0 NOT NULL,
    available numeric(14,2) DEFAULT 0 NOT NULL,
    locked numeric(14,2) DEFAULT 0 NOT NULL,
    paid_out numeric(14,2) DEFAULT 0 NOT NULL,
    refunded numeric(14,2) DEFAULT 0 NOT NULL,
    reversed numeric(14,2) DEFAULT 0 NOT NULL,
    fee_reserved numeric(14,2) DEFAULT 0 NOT NULL,
    commission numeric(14,2) DEFAULT 0 NOT NULL,
    requires_review numeric(14,2) DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT money_owner_balances_available_check CHECK ((available >= (0)::numeric)),
    CONSTRAINT money_owner_balances_commission_check CHECK ((commission >= (0)::numeric)),
    CONSTRAINT money_owner_balances_currency_check CHECK (((currency)::text ~ '^[A-Z]{3}$'::text)),
    CONSTRAINT money_owner_balances_fee_reserved_check CHECK ((fee_reserved >= (0)::numeric)),
    CONSTRAINT money_owner_balances_locked_check CHECK ((locked >= (0)::numeric)),
    CONSTRAINT money_owner_balances_owner_type_check CHECK (((owner_type)::text = ANY ((ARRAY['salon'::character varying, 'master'::character varying, 'platform'::character varying, 'system'::character varying])::text[]))),
    CONSTRAINT money_owner_balances_paid_out_check CHECK ((paid_out >= (0)::numeric)),
    CONSTRAINT money_owner_balances_pending_settlement_check CHECK ((pending_settlement >= (0)::numeric)),
    CONSTRAINT money_owner_balances_provider_hold_check CHECK ((provider_hold >= (0)::numeric)),
    CONSTRAINT money_owner_balances_refunded_check CHECK ((refunded >= (0)::numeric)),
    CONSTRAINT money_owner_balances_requires_review_check CHECK ((requires_review >= (0)::numeric)),
    CONSTRAINT money_owner_balances_reversed_check CHECK ((reversed >= (0)::numeric))
);

CREATE TABLE public.withdraw_requests (
    id bigint NOT NULL,
    legacy_withdraw_id bigint,
    owner_type character varying(32) NOT NULL,
    owner_id bigint NOT NULL,
    amount numeric(14,2) NOT NULL,
    currency character varying(3) NOT NULL,
    status character varying(32) DEFAULT 'created'::character varying NOT NULL,
    creation_mode character varying(32) DEFAULT 'manual'::character varying NOT NULL,
    decision character varying(32),
    risk_level character varying(16),
    decision_reasons jsonb DEFAULT '[]'::jsonb NOT NULL,
    destination_id bigint,
    available_snapshot numeric(14,2) DEFAULT 0 NOT NULL,
    locked_amount numeric(14,2) DEFAULT 0 NOT NULL,
    locked_ledger_group_id uuid,
    payout_execution_id bigint,
    expected_payout_date date,
    idempotency_key text,
    rules_version text,
    created_by_type character varying(32) DEFAULT 'owner'::character varying NOT NULL,
    created_by_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    locked_at timestamp with time zone,
    completed_at timestamp with time zone,
    failed_at timestamp with time zone,
    canceled_at timestamp with time zone,
    rejected_at timestamp with time zone,
    failure_reason text,
    admin_note text,
    CONSTRAINT withdraw_requests_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT withdraw_requests_available_snapshot_check CHECK ((available_snapshot >= (0)::numeric)),
    CONSTRAINT withdraw_requests_created_by_type_check CHECK (((created_by_type)::text = ANY ((ARRAY['owner'::character varying, 'admin'::character varying, 'system'::character varying])::text[]))),
    CONSTRAINT withdraw_requests_creation_mode_check CHECK (((creation_mode)::text = ANY ((ARRAY['manual'::character varying, 'scheduled'::character varying, 'admin'::character varying, 'system'::character varying])::text[]))),
    CONSTRAINT withdraw_requests_currency_check CHECK (((currency)::text ~ '^[A-Z]{3}$'::text)),
    CONSTRAINT withdraw_requests_decision_check CHECK (((decision IS NULL) OR ((decision)::text = ANY ((ARRAY['auto_approve'::character varying, 'manual_review'::character varying, 'reject'::character varying, 'block'::character varying])::text[])))),
    CONSTRAINT withdraw_requests_locked_amount_check CHECK ((locked_amount >= (0)::numeric)),
    CONSTRAINT withdraw_requests_risk_level_check CHECK (((risk_level IS NULL) OR ((risk_level)::text = ANY ((ARRAY['green'::character varying, 'yellow'::character varying, 'red'::character varying])::text[])))),
    CONSTRAINT withdraw_requests_status_check CHECK (((status)::text = ANY ((ARRAY['created'::character varying, 'pending_validation'::character varying, 'requires_review'::character varying, 'locked'::character varying, 'queued_for_payout'::character varying, 'bank_processing'::character varying, 'completed'::character varying, 'failed'::character varying, 'rejected'::character varying, 'canceled'::character varying])::text[])))
);

CREATE TABLE public.withdraw_destinations (
    id bigint NOT NULL,
    owner_type character varying(32) NOT NULL,
    owner_id bigint NOT NULL,
    method character varying(32) NOT NULL,
    provider_code character varying(64),
    wallet_provider character varying(64),
    phone text,
    bank_name text,
    account_masked text,
    card_last4 character varying(4),
    account_holder text,
    destination_relation character varying(32) DEFAULT 'unknown'::character varying NOT NULL,
    payload_sanitized jsonb DEFAULT '{}'::jsonb NOT NULL,
    provider_token text,
    status character varying(32) DEFAULT 'unverified'::character varying NOT NULL,
    verified_at timestamp with time zone,
    last_used_at timestamp with time zone,
    last_success_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT withdraw_destinations_method_check CHECK (((method)::text = ANY ((ARRAY['wallet'::character varying, 'card'::character varying, 'bank_account'::character varying, 'manual_other'::character varying])::text[]))),
    CONSTRAINT withdraw_destinations_owner_type_check CHECK (((owner_type)::text = ANY ((ARRAY['salon'::character varying, 'master'::character varying, 'platform'::character varying, 'system'::character varying])::text[]))),
    CONSTRAINT withdraw_destinations_relation_check CHECK (((destination_relation)::text = ANY ((ARRAY['self'::character varying, 'company_account'::character varying, 'authorized_person'::character varying, 'third_party'::character varying, 'unknown'::character varying])::text[]))),
    CONSTRAINT withdraw_destinations_status_check CHECK (((status)::text = ANY ((ARRAY['unverified'::character varying, 'active'::character varying, 'requires_review'::character varying, 'blocked'::character varying, 'archived'::character varying])::text[]))),
    CONSTRAINT withdraw_destinations_wallet_check CHECK ((((method)::text <> 'wallet'::text) OR ((wallet_provider IS NOT NULL) AND (phone IS NOT NULL))))
);

CREATE TABLE public.money_ledger_entries (
    id bigint NOT NULL,
    entry_group_id uuid NOT NULL,
    owner_type character varying(32) NOT NULL,
    owner_id bigint NOT NULL,
    money_zone character varying(32) NOT NULL,
    direction character varying(16) NOT NULL,
    amount numeric(14,2) NOT NULL,
    currency character varying(3) NOT NULL,
    source_type character varying(64) NOT NULL,
    source_id bigint NOT NULL,
    reason text,
    provider_code character varying(64),
    created_by_type character varying(32) DEFAULT 'system'::character varying NOT NULL,
    created_by_id bigint,
    metadata_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT money_ledger_entries_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT money_ledger_entries_created_by_type_check CHECK (((created_by_type)::text = ANY ((ARRAY['system'::character varying, 'admin'::character varying, 'owner'::character varying, 'provider'::character varying])::text[]))),
    CONSTRAINT money_ledger_entries_currency_check CHECK (((currency)::text ~ '^[A-Z]{3}$'::text)),
    CONSTRAINT money_ledger_entries_direction_check CHECK (((direction)::text = ANY ((ARRAY['debit'::character varying, 'credit'::character varying])::text[]))),
    CONSTRAINT money_ledger_entries_money_zone_check CHECK (((money_zone)::text = ANY ((ARRAY['provider_hold'::character varying, 'pending_settlement'::character varying, 'available'::character varying, 'locked'::character varying, 'paid_out'::character varying, 'refunded'::character varying, 'reversed'::character varying, 'fee_reserved'::character varying, 'commission'::character varying, 'requires_review'::character varying, 'manual_adjustment'::character varying])::text[]))),
    CONSTRAINT money_ledger_entries_owner_type_check CHECK (((owner_type)::text = ANY ((ARRAY['salon'::character varying, 'master'::character varying, 'platform'::character varying, 'system'::character varying])::text[])))
);

CREATE TABLE public.money_audit_events (
    id bigint NOT NULL,
    event_type character varying(64) NOT NULL,
    actor_type character varying(32) DEFAULT 'system'::character varying NOT NULL,
    actor_id bigint,
    owner_type character varying(32),
    owner_id bigint,
    source_type character varying(64),
    source_id bigint,
    amount numeric(14,2),
    currency character varying(3) NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT money_audit_events_actor_type_check CHECK (((actor_type)::text = ANY ((ARRAY['system'::character varying, 'admin'::character varying, 'owner'::character varying, 'provider'::character varying])::text[]))),
    CONSTRAINT money_audit_events_amount_check CHECK (((amount IS NULL) OR (amount >= (0)::numeric))),
    CONSTRAINT money_audit_events_currency_check CHECK (((currency)::text ~ '^[A-Z]{3}$'::text)),
    CONSTRAINT money_audit_events_owner_type_check CHECK (((owner_type IS NULL) OR ((owner_type)::text = ANY ((ARRAY['salon'::character varying, 'master'::character varying, 'platform'::character varying, 'system'::character varying])::text[]))))
);

CREATE SEQUENCE public.money_owner_balances_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER TABLE ONLY public.money_owner_balances ALTER COLUMN id SET DEFAULT nextval('public.money_owner_balances_id_seq'::regclass);

CREATE SEQUENCE public.withdraw_requests_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER TABLE ONLY public.withdraw_requests ALTER COLUMN id SET DEFAULT nextval('public.withdraw_requests_id_seq'::regclass);

CREATE SEQUENCE public.withdraw_destinations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER TABLE ONLY public.withdraw_destinations ALTER COLUMN id SET DEFAULT nextval('public.withdraw_destinations_id_seq'::regclass);

CREATE SEQUENCE public.money_ledger_entries_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER TABLE ONLY public.money_ledger_entries ALTER COLUMN id SET DEFAULT nextval('public.money_ledger_entries_id_seq'::regclass);

CREATE SEQUENCE public.money_audit_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER TABLE ONLY public.money_audit_events ALTER COLUMN id SET DEFAULT nextval('public.money_audit_events_id_seq'::regclass);

ALTER TABLE ONLY public.money_owner_balances
    ADD CONSTRAINT money_owner_balances_owner_currency_uniq UNIQUE (owner_type, owner_id, currency);

ALTER TABLE ONLY public.money_owner_balances
    ADD CONSTRAINT money_owner_balances_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.withdraw_requests
    ADD CONSTRAINT withdraw_requests_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.withdraw_destinations
    ADD CONSTRAINT withdraw_destinations_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.money_ledger_entries
    ADD CONSTRAINT money_ledger_entries_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.money_audit_events
    ADD CONSTRAINT money_audit_events_pkey PRIMARY KEY (id);

CREATE INDEX idx_money_owner_balances_available ON public.money_owner_balances USING btree (available);

CREATE INDEX idx_money_owner_balances_locked ON public.money_owner_balances USING btree (locked);

CREATE INDEX idx_money_owner_balances_owner ON public.money_owner_balances USING btree (owner_type, owner_id);

CREATE INDEX idx_withdraw_requests_destination_id ON public.withdraw_requests USING btree (destination_id);

CREATE INDEX idx_withdraw_requests_locked_group ON public.withdraw_requests USING btree (locked_ledger_group_id);

CREATE INDEX idx_withdraw_requests_owner_status ON public.withdraw_requests USING btree (owner_type, owner_id, status);

CREATE INDEX idx_withdraw_requests_payout_execution_id ON public.withdraw_requests USING btree (payout_execution_id);

CREATE INDEX idx_withdraw_requests_status_created ON public.withdraw_requests USING btree (status, created_at);

CREATE UNIQUE INDEX ux_withdraw_requests_idempotency_key ON public.withdraw_requests USING btree (idempotency_key) WHERE (idempotency_key IS NOT NULL);

CREATE INDEX idx_withdraw_destinations_method ON public.withdraw_destinations USING btree (method);

CREATE INDEX idx_withdraw_destinations_owner ON public.withdraw_destinations USING btree (owner_type, owner_id);

CREATE INDEX idx_withdraw_destinations_status ON public.withdraw_destinations USING btree (status);

CREATE INDEX idx_withdraw_destinations_wallet_provider ON public.withdraw_destinations USING btree (wallet_provider);

CREATE INDEX idx_money_ledger_created_at ON public.money_ledger_entries USING btree (created_at);

CREATE INDEX idx_money_ledger_entry_group_id ON public.money_ledger_entries USING btree (entry_group_id);

CREATE INDEX idx_money_ledger_owner_currency ON public.money_ledger_entries USING btree (owner_type, owner_id, currency);

CREATE INDEX idx_money_ledger_source ON public.money_ledger_entries USING btree (source_type, source_id);

CREATE INDEX idx_money_ledger_zone ON public.money_ledger_entries USING btree (money_zone);

CREATE UNIQUE INDEX ux_money_ledger_xpay_split_allocation ON public.money_ledger_entries USING btree (source_type, source_id, owner_type, owner_id, money_zone, direction) WHERE ((source_type)::text = 'xpay_split_allocation'::text);

CREATE INDEX idx_money_audit_events_actor ON public.money_audit_events USING btree (actor_type, actor_id);

CREATE INDEX idx_money_audit_events_created_at ON public.money_audit_events USING btree (created_at);

CREATE INDEX idx_money_audit_events_event_type ON public.money_audit_events USING btree (event_type);

CREATE INDEX idx_money_audit_events_owner ON public.money_audit_events USING btree (owner_type, owner_id);

CREATE INDEX idx_money_audit_events_source ON public.money_audit_events USING btree (source_type, source_id);

ALTER TABLE ONLY public.withdraw_requests
    ADD CONSTRAINT withdraw_requests_destination_id_fkey FOREIGN KEY (destination_id) REFERENCES public.withdraw_destinations(id);
