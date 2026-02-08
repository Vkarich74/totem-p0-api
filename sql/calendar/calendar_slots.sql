-- CALENDAR v1 — canonical schema
-- HARD RESET of calendar_slots
-- Schema: public

BEGIN;

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Drop legacy table
DROP TABLE IF EXISTS calendar_slots CASCADE;

-- Canonical table
CREATE TABLE calendar_slots (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  master_id  bigint NOT NULL,
  salon_id   bigint NULL,
  start_at   timestamptz NOT NULL,
  end_at     timestamptz NOT NULL,
  status     text NOT NULL CHECK (status IN ('reserved','cancelled','completed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (start_at < end_at)
);

-- One master — one timeline (no overlaps except cancelled)
ALTER TABLE calendar_slots
  ADD CONSTRAINT calendar_no_overlap_per_master
  EXCLUDE USING gist (
    master_id WITH =,
    tstzrange(start_at, end_at, '[)') WITH &&
  )
  WHERE (status <> 'cancelled');

COMMIT;
