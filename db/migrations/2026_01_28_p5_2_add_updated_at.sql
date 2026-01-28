BEGIN;

ALTER TABLE payments
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

UPDATE payments
SET updated_at = created_at
WHERE updated_at IS NULL;

ALTER TABLE payments
ALTER COLUMN updated_at SET NOT NULL;

COMMIT;
