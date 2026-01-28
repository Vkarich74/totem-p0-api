import Database from "better-sqlite3";

const db = new Database("totem.db");

console.log("Running STEP 17 migration: booking source");

db.exec(`
ALTER TABLE bookings ADD COLUMN source TEXT DEFAULT 'marketplace';
`);

console.log("OK: bookings.source added");

db.close();
