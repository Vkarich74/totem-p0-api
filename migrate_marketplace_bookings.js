import Database from "better-sqlite3";

const db = new Database("totem.db");

console.log("== MARKETPLACE BOOKINGS MIGRATION START ==");

db.prepare(`
  CREATE TABLE IF NOT EXISTS marketplace_bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id INTEGER NOT NULL,
    owner_id INTEGER NOT NULL,
    client_id INTEGER NOT NULL,
    price REAL NOT NULL,
    commission_pct INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )
`).run();

console.log("== MARKETPLACE BOOKINGS MIGRATION DONE ==");

db.close();
