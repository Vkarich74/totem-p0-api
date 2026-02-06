-- migrations/2026_01_29_booking_audit.sql
-- Booking audit log (lifecycle v2)

CREATE TABLE IF NOT EXISTS booking_audit_log (
  id SERIAL PRIMARY KEY,

  booking_id INTEGER NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,

  actor_type TEXT NOT NULL, -- system | public
  actor_id TEXT,

  source TEXT, -- endpoint /payments/webhook etc

  created_at TIMESTAMP WITHOUT TIME ZONE
    DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_booking_audit_booking
  ON booking_audit_log (booking_id);

CREATE INDEX IF NOT EXISTS idx_booking_audit_created
  ON booking_audit_log (created_at);
