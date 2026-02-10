BEGIN;

-- =========================
-- PAYMENT INTENTS
-- =========================
CREATE TABLE IF NOT EXISTS payment_intents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    salon_id INTEGER NOT NULL,
    master_id INTEGER,
    booking_id INTEGER,

    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',

    status VARCHAR(32) NOT NULL,
    provider VARCHAR(32) NOT NULL DEFAULT 'generic',

    idempotency_key VARCHAR(128) NOT NULL,
    provider_intent_id VARCHAR(128),

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_payment_intents_idempotency
ON payment_intents(idempotency_key);

CREATE INDEX IF NOT EXISTS ix_payment_intents_status
ON payment_intents(status);

-- =========================
-- PAYMENT EVENTS (WEBHOOKS)
-- =========================
CREATE TABLE IF NOT EXISTS payment_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    intent_id UUID REFERENCES payment_intents(id) ON DELETE CASCADE,

    provider VARCHAR(32) NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    event_external_id VARCHAR(128) NOT NULL,

    payload JSONB NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_payment_events_external
ON payment_events(provider, event_external_id);

-- =========================
-- PAYMENT REFUNDS
-- =========================
CREATE TABLE IF NOT EXISTS payment_refunds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    intent_id UUID NOT NULL REFERENCES payment_intents(id) ON DELETE CASCADE,

    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
    status VARCHAR(32) NOT NULL,

    provider_refund_id VARCHAR(128),

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_payment_refunds_status
ON payment_refunds(status);

COMMIT;
