import Database from "better-sqlite3";

const db = new Database("totem.db");

console.log("== SERVICES MIGRATION START ==");

// services
db.prepare(`
  CREATE TABLE IF NOT EXISTS services (
    id TEXT PRIMARY KEY,
    salon_id TEXT NOT NULL,
    name TEXT NOT NULL,
    duration_min INTEGER NOT NULL,
    price INTEGER NOT NULL,
    active INTEGER DEFAULT 1
  )
`).run();

// master_services
db.prepare(`
  CREATE TABLE IF NOT EXISTS master_services (
    master_id TEXT NOT NULL,
    service_id TEXT NOT NULL,
    PRIMARY KEY (master_id, service_id)
  )
`).run();

// seed service
db.prepare(`
  INSERT OR IGNORE INTO services
  (id, salon_id, name, duration_min, price)
  VALUES ('srv1', 's1', 'Haircut', 60, 1000)
`).run();

// link master ↔ service
db.prepare(`
  INSERT OR IGNORE INTO master_services
  (master_id, service_id)
  VALUES ('m1', 'srv1')
`).run();

console.log("== SERVICES MIGRATION DONE ==");
