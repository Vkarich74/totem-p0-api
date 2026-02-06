import Database from "better-sqlite3";

const db = new Database("totem.db");

console.log("== MASTER SCHEDULE MIGRATION START ==");

db.exec(`
CREATE TABLE IF NOT EXISTS master_schedule (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  master_id TEXT NOT NULL,
  salon_id TEXT NOT NULL,
  weekday INTEGER NOT NULL,        -- 0=Sun ... 6=Sat
  start_time TEXT NOT NULL,        -- HH:MM
  end_time TEXT NOT NULL,          -- HH:MM
  active INTEGER DEFAULT 1
);
`);

console.log("== MASTER SCHEDULE MIGRATION DONE ==");
db.close();
