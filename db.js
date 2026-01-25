import Database from "better-sqlite3";

export const db = new Database("totem.db");

// === TABLES ===

// masters
db.prepare(`
  CREATE TABLE IF NOT EXISTS masters (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL
  )
`).run();

// salons
db.prepare(`
  CREATE TABLE IF NOT EXISTS salons (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL
  )
`).run();

// master ↔ salon
db.prepare(`
  CREATE TABLE IF NOT EXISTS salon_masters (
    master_id TEXT NOT NULL,
    salon_id TEXT NOT NULL,
    active INTEGER NOT NULL,
    PRIMARY KEY (master_id, salon_id)
  )
`).run();

// === SEED (idempotent) ===

// master
db.prepare(`
  INSERT OR IGNORE INTO masters (id, name, slug)
  VALUES ('m1', 'Test Master', 'test-master')
`).run();

// salon
db.prepare(`
  INSERT OR IGNORE INTO salons (id, name, slug)
  VALUES ('s1', 'Totem Demo Salon', 'totem-demo-salon')
`).run();

// relation
db.prepare(`
  INSERT OR IGNORE INTO salon_masters (master_id, salon_id, active)
  VALUES ('m1', 's1', 1)
`).run();
