BEGIN;

-- extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =========================
-- PAYMENTS (FIX / UPGRADE)
-- =========================

-- add column is_active if missing
ALTER TABLE payments
ADD COLUMN IF NOT EXISTS is_active BOOLEAN;

-- backfill
UPDATE payments
SET is_active = (status = 'pending')
WHERE is_active IS NULL;

-- enforce defaults
ALTER TABLE payments
ALTER COLUMN is_active SET NOT NULL,
ALTER COLUMN is_active SET DEFAULT false;

-- drop old guard if any
DROP INDEX IF EXISTS ux_payments_active_booking;

-- one active payment per booking
CREATE UNIQUE INDEX ux_payments_active_booking
ON payments (booking_id)
WHERE is_active = true;

-- =========================
-- RECONCILIATIONS
-- =========================
CREATE TABLE IF NOT EXISTS reconciliations (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payment_id      UUID NOT NULL,
    booking_id      BIGINT NOT NULL,
    expected_status TEXT NOT NULL,
    actual_status   TEXT NOT NULL,
    result          TEXT NOT NULL CHECK (result IN ('ok','mismatch','not_found')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_recon_payment
ON reconciliations (payment_id);

CREATE INDEX IF NOT EXISTS ix_recon_booking
ON reconciliations (booking_id);

-- =========================
-- PAYOUTS
-- =========================
CREATE TABLE IF NOT EXISTS payouts (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id  BIGINT NOT NULL,
    payment_id  UUID NOT NULL,
    amount      INTEGER NOT NULL,
    status      TEXT NOT NULL CHECK (status IN ('executed','rejected')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP INDEX IF EXISTS ux_payouts_booking;
CREATE UNIQUE INDEX ux_payouts_booking
ON payouts (booking_id);

COMMIT;
