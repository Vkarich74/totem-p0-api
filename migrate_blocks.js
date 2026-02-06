import Database from "better-sqlite3";

const db = new Database("totem.db");

console.log("== BLOCKS MIGRATION START ==");

db.exec(`
CREATE TABLE IF NOT EXISTS booking_blocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  master_id TEXT NOT NULL,
  salon_id TEXT NOT NULL,
  date TEXT NOT NULL,          -- YYYY-MM-DD
  start_time TEXT NOT NULL,    -- HH:MM
  end_time TEXT NOT NULL,      -- HH:MM
  reason TEXT,
  active INTEGER DEFAULT 1
);
`);

console.log("== BLOCKS MIGRATION DONE ==");
db.close();
