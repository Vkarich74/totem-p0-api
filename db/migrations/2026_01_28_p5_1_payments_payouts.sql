BEGIN;

-- ============================================================
-- P5.1 — PAYMENTS & PAYOUTS DATA MODEL
-- Safe migration. Does NOT touch bookings.
-- ============================================================

-- ------------------------
-- EXTENSIONS
-- ------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------
-- PAYMENTS
-- ------------------------
CREATE TABLE IF NOT EXISTS payments (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id      BIGINT NOT NULL,
    provider        TEXT NOT NULL,
    amount          INTEGER NOT NULL,
    currency        TEXT NOT NULL DEFAULT 'USD',
    status          TEXT NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed')),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One active payment per booking
CREATE UNIQUE INDEX IF NOT EXISTS ux_payments_active_booking
ON payments (booking_id)
WHERE is_active = true;

CREATE INDEX IF NOT EXISTS ix_payments_booking
ON payments (booking_id);

CREATE INDEX IF NOT EXISTS ix_payments_status
ON payments (status);

-- ------------------------
-- RECONCILIATIONS
-- ------------------------
CREATE TABLE IF NOT EXISTS reconciliations (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payment_id          UUID NOT NULL,
    booking_id          BIGINT NOT NULL,
    expected_status     TEXT NOT NULL,
    actual_status       TEXT NOT NULL,
    result              TEXT NOT NULL CHECK (result IN ('ok', 'mismatch', 'not_found')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_recon_payment
ON reconciliations (payment_id);

CREATE INDEX IF NOT EXISTS ix_recon_booking
ON reconciliations (booking_id);

-- ------------------------
-- PAYOUTS
-- ------------------------
CREATE TABLE IF NOT EXISTS payouts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id      BIGINT NOT NULL,
    payment_id      UUID NOT NULL,
    amount          INTEGER NOT NULL,
    status          TEXT NOT NULL CHECK (status IN ('executed', 'rejected')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One payout per booking (hard guard)
CREATE UNIQUE INDEX IF NOT EXISTS ux_payouts_booking
ON payouts (booking_id);

CREATE INDEX IF NOT EXISTS ix_payouts_payment
ON payouts (payment_id);

COMMIT;
