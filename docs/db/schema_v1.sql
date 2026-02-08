-- =========================================================
-- TOTEM Financial Core — SQL Schema v1 (FREEZE)
-- Target: PostgreSQL
-- =========================================================

BEGIN;

-- -------------------------
-- ENUMS
-- -------------------------
CREATE TYPE wallet_owner_type AS ENUM ('system', 'master', 'salon');
CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'failed', 'cancelled');
CREATE TYPE payout_status AS ENUM ('requested', 'processing', 'completed', 'failed');
CREATE TYPE ledger_direction AS ENUM ('debit', 'credit');
CREATE TYPE provider_tx_status AS ENUM ('received', 'validated', 'ignored');

-- -------------------------
-- WALLETS
-- -------------------------
CREATE TABLE wallets (
    id              BIGSERIAL PRIMARY KEY,
    owner_type      wallet_owner_type NOT NULL,
    owner_id        BIGINT NOT NULL,
    currency        CHAR(3) NOT NULL DEFAULT 'USD',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (owner_type, owner_id, currency)
);

-- -------------------------
-- LEDGER (append-only)
-- -------------------------
CREATE TABLE ledger_entries (
    id              BIGSERIAL PRIMARY KEY,
    wallet_id       BIGINT NOT NULL REFERENCES wallets(id),
    direction       ledger_direction NOT NULL,
    amount_cents    BIGINT NOT NULL CHECK (amount_cents > 0),
    reference_type  TEXT NOT NULL,
    reference_id    BIGINT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ledger_wallet ON ledger_entries(wallet_id);
CREATE INDEX idx_ledger_ref ON ledger_entries(reference_type, reference_id);

-- -------------------------
-- PAYMENTS (business-level)
-- -------------------------
CREATE TABLE payments (
    id              BIGSERIAL PRIMARY KEY,
    client_ref      TEXT NOT NULL,
    target_wallet   BIGINT NOT NULL REFERENCES wallets(id),
    amount_cents    BIGINT NOT NULL CHECK (amount_cents > 0),
    status          payment_status NOT NULL DEFAULT 'pending',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    paid_at         TIMESTAMPTZ
);

-- -------------------------
-- PAYMENT PROVIDERS (catalog)
-- -------------------------
CREATE TABLE payment_providers (
    id              BIGSERIAL PRIMARY KEY,
    code            TEXT NOT NULL UNIQUE,
    name            TEXT NOT NULL,
    active          BOOLEAN NOT NULL DEFAULT true
);

-- -------------------------
-- PROVIDER TRANSACTIONS (webhook log)
-- -------------------------
CREATE TABLE provider_transactions (
    id              BIGSERIAL PRIMARY KEY,
    provider_id     BIGINT NOT NULL REFERENCES payment_providers(id),
    external_tx_id  TEXT NOT NULL,
    payment_id      BIGINT REFERENCES payments(id),
    raw_payload     JSONB NOT NULL,
    status          provider_tx_status NOT NULL DEFAULT 'received',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (provider_id, external_tx_id)
);

-- -------------------------
-- FEE RULES (engine)
-- -------------------------
CREATE TABLE fee_rules (
    id              BIGSERIAL PRIMARY KEY,
    applies_to      TEXT NOT NULL,
    percent         NUMERIC(5,2),
    fixed_cents     BIGINT,
    active          BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (
        percent IS NOT NULL OR fixed_cents IS NOT NULL
    )
);

-- -------------------------
-- PAYOUTS
-- -------------------------
CREATE TABLE payouts (
    id              BIGSERIAL PRIMARY KEY,
    wallet_id       BIGINT NOT NULL REFERENCES wallets(id),
    amount_cents    BIGINT NOT NULL CHECK (amount_cents > 0),
    status          payout_status NOT NULL DEFAULT 'requested',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at    TIMESTAMPTZ
);

-- -------------------------
-- SERVICE INVOICES (platform fees)
-- -------------------------
CREATE TABLE service_invoices (
    id              BIGSERIAL PRIMARY KEY,
    system_wallet   BIGINT NOT NULL REFERENCES wallets(id),
    description     TEXT NOT NULL,
    amount_cents    BIGINT NOT NULL CHECK (amount_cents > 0),
    payment_id      BIGINT REFERENCES payments(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMIT;
