BEGIN;

ALTER TABLE calendar_slots
  ADD COLUMN IF NOT EXISTS request_id text;

CREATE UNIQUE INDEX IF NOT EXISTS calendar_slots_request_id_uq
  ON calendar_slots(request_id)
  WHERE request_id IS NOT NULL;

COMMIT;
