import db from "./db.js";

try {
  db.prepare(`
    ALTER TABLE bookings
    ADD COLUMN service_id TEXT
  `).run();

  console.log("OK: service_id added to bookings");
} catch (e) {
  console.log("SKIP: service_id already exists");
}

process.exit(0);
