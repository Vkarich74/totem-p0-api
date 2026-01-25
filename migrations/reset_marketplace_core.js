import { createDb } from "../lib/db.js";
import crypto from "node:crypto";

const db = createDb({ filename: "data.db" });
const id = (p) => p + "_" + crypto.randomBytes(4).toString("hex");

db.transaction(() => {
  db.exec("DROP TABLE IF EXISTS marketplace_bookings");
  db.exec("DROP TABLE IF EXISTS services");
  db.exec("DROP TABLE IF EXISTS marketplace_salons");

  db.exec(`
    CREATE TABLE marketplace_salons (
      salon_id TEXT PRIMARY KEY,
      salon_slug TEXT UNIQUE,
      enabled INTEGER,
      enabled_at TEXT
    )
  `);

  db.exec(`
    CREATE TABLE services (
      service_id TEXT PRIMARY KEY,
      title TEXT,
      duration_min INTEGER
    )
  `);

  db.exec(`
    CREATE TABLE marketplace_bookings (
      booking_id TEXT PRIMARY KEY,
      salon_slug TEXT,
      master_slug TEXT,
      service_id TEXT,
      day TEXT,
      start_min INTEGER,
      end_min INTEGER,
      created_at TEXT
    )
  `);

  db.run(
    "INSERT INTO marketplace_salons VALUES (?, ?, 1, ?)",
    [id("salon"), "demo-salon", new Date().toISOString()]
  );

  db.run(
    "INSERT INTO services VALUES (?, ?, ?)",
    ["svc_haircut", "Haircut", 60]
  );

  db.run(
    "INSERT INTO marketplace_bookings VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [
      id("bk"),
      "demo-salon",
      "master-alex",
      "svc_haircut",
      "2026-01-25",
      600,
      660,
      new Date().toISOString(),
    ]
  );
});

console.log("reset_marketplace_core: OK");
