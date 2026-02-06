-- db_bootstrap_public_v1.sql
-- SAFE bootstrap for PUBLIC BOOKING API v1

PRAGMA foreign_keys = OFF;
BEGIN TRANSACTION;

-- -------------------------------------------------
-- booking_slots (read-only for public)
-- -------------------------------------------------
CREATE TABLE IF NOT EXISTS booking_slots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  salon_slug TEXT NOT NULL,
  master_slug TEXT NOT NULL,
  date TEXT NOT NULL,          -- YYYY-MM-DD
  start_time TEXT NOT NULL,    -- HH:MM
  end_time TEXT NOT NULL,      -- HH:MM
  available INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_booking_slots_lookup
ON booking_slots (salon_slug, master_slug, date, start_time);

-- -------------------------------------------------
-- bookings (extend EXISTING table safely)
-- -------------------------------------------------

-- SQLite doesn't support IF NOT EXISTS on ADD COLUMN
-- so we rely on try/catch during execution

ALTER TABLE bookings ADD COLUMN salon_slug TEXT;
ALTER TABLE bookings ADD COLUMN master_slug TEXT;
ALTER TABLE bookings ADD COLUMN service_id TEXT;
ALTER TABLE bookings ADD COLUMN source TEXT;
ALTER TABLE bookings ADD COLUMN status TEXT DEFAULT 'pending';
ALTER TABLE bookings ADD COLUMN created_at TEXT;

COMMIT;
PRAGMA foreign_keys = ON;
