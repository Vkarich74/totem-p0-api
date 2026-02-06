BEGIN;

-- ============================================================
-- P5.1 FIX — add is_active to existing payments table
-- Safe for production
-- ============================================================

-- 1. Add column if missing
ALTER TABLE payments
ADD COLUMN IF NOT EXISTS is_active BOOLEAN;

-- 2. Backfill logic:
-- pending -> active
-- others  -> inactive
UPDATE payments
SET is_active = (status = 'pending')
WHERE is_active IS NULL;

-- 3. Enforce NOT NULL + default
ALTER TABLE payments
ALTER COLUMN is_active SET NOT NULL,
ALTER COLUMN is_active SET DEFAULT false;

-- 4. Drop old index if partially created
DROP INDEX IF EXISTS ux_payments_active_booking;

-- 5. Create guard: one active payment per booking
CREATE UNIQUE INDEX ux_payments_active_booking
ON payments (booking_id)
WHERE is_active = true;

COMMIT;
