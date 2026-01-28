import Database from "better-sqlite3";

const db = new Database("totem.db");

console.log("Running STEP 14 migration: booking_status_log");

db.exec(`
CREATE TABLE IF NOT EXISTS booking_status_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL,
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  changed_at TEXT NOT NULL DEFAULT (datetime('now')),
  actor_type TEXT,
  actor_id INTEGER,
  request_id TEXT,
  note TEXT
);

CREATE INDEX IF NOT EXISTS idx_booking_status_log_booking_id
  ON booking_status_log(booking_id);

CREATE INDEX IF NOT EXISTS idx_booking_status_log_changed_at
  ON booking_status_log(changed_at);
`);

console.log("OK: booking_status_log created");

db.close();
