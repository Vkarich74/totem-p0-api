BEGIN;

ALTER TABLE bookings
ADD COLUMN calendar_slot_id uuid;

ALTER TABLE bookings
ADD CONSTRAINT bookings_calendar_slot_fk
FOREIGN KEY (calendar_slot_id)
REFERENCES calendar_slots(id)
ON DELETE RESTRICT;

ALTER TABLE bookings
ALTER COLUMN calendar_slot_id SET NOT NULL;

COMMIT;
