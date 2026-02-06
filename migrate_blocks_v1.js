import db from "./db.js";

db.exec(`
CREATE TABLE IF NOT EXISTS blocks (
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

console.log("OK: blocks table ready");
process.exit(0);
