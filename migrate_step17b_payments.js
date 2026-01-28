import Database from "better-sqlite3";

const db = new Database("totem.db");

console.log("Running STEP 17B migration: booking_payments");

db.exec(`
CREATE TABLE IF NOT EXISTS booking_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL UNIQUE,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  provider TEXT NOT NULL,            -- stripe | qr | cash
  provider_ref TEXT,                 -- intent_id / tx_id
  status TEXT NOT NULL,              -- pending | succeeded | failed
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_booking_payments_booking_id
  ON booking_payments(booking_id);
`);

console.log("OK: booking_payments created");
db.close();
