-- Migration: add booking status fields to marketplace_bookings
-- Idempotent migration (safe to run multiple times)

PRAGMA foreign_keys=off;

BEGIN TRANSACTION;

-- booking_status
ALTER TABLE marketplace_bookings
ADD COLUMN booking_status TEXT
DEFAULT 'created';

-- status_changed_at
ALTER TABLE marketplace_bookings
ADD COLUMN status_changed_at TEXT;

-- cancel_reason
ALTER TABLE marketplace_bookings
ADD COLUMN cancel_reason TEXT;

COMMIT;

PRAGMA foreign_keys=on;
