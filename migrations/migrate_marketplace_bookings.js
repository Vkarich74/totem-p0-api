// migrations/migrate_marketplace_bookings.js
import Database from "better-sqlite3";

const db = new Database("db.sqlite");

db.exec(`
DROP TABLE IF EXISTS marketplace_bookings;

CREATE TABLE marketplace_bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  salon_id TEXT NOT NULL,
  master_slug TEXT NOT NULL,
  service_id TEXT NOT NULL,
  date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`);

console.log("OK: marketplace_bookings recreated WITH master_slug");
