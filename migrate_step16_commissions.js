import Database from "better-sqlite3";

const db = new Database("totem.db");

console.log("Running STEP 16 migration: booking_commissions");

db.exec(`
CREATE TABLE IF NOT EXISTS booking_commissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL UNIQUE,
  amount INTEGER NOT NULL,
  rate INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  source TEXT NOT NULL DEFAULT 'system'
);

CREATE INDEX IF NOT EXISTS idx_booking_commissions_booking_id
  ON booking_commissions(booking_id);
`);

console.log("OK: booking_commissions created");

db.close();
