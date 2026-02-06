import Database from "better-sqlite3";

const db = new Database("totem.db");

console.log("== CANCEL MIGRATION START ==");

db.exec(`
ALTER TABLE bookings ADD COLUMN cancelled_at TEXT;
ALTER TABLE bookings ADD COLUMN cancel_reason TEXT;
`);

console.log("== CANCEL MIGRATION DONE ==");
db.close();
