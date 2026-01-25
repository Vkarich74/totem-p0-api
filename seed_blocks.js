import Database from "better-sqlite3";

const db = new Database("totem.db");

console.log("== SEED BLOCKS ==");

db.prepare(`
INSERT INTO booking_blocks
(master_id, salon_id, date, start_time, end_time, reason)
VALUES (?, ?, ?, ?, ?, ?)
`).run(
  "m1",
  "s1",
  "2026-01-26",
  "12:00",
  "12:30",
  "Break"
);

console.log("== SEED DONE ==");
db.close();
