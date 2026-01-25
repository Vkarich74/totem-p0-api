import Database from "better-sqlite3";

const db = new Database("totem.db");

// ===== TABLES =====

db.prepare(`
CREATE TABLE IF NOT EXISTS masters (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  active INTEGER DEFAULT 1
)
`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS salons (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  active INTEGER DEFAULT 1
)
`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS salon_masters (
  master_id TEXT NOT NULL,
  salon_id TEXT NOT NULL,
  active INTEGER DEFAULT 1,
  PRIMARY KEY (master_id, salon_id)
)
`).run();

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

db.prepare(`
CREATE TABLE IF NOT EXISTS master_services (
  master_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  PRIMARY KEY (master_id, service_id)
)
`).run();

// ===== SEED =====

db.prepare(`
INSERT OR IGNORE INTO masters (id, name, slug)
VALUES ('m1', 'Test Master', 'test-master')
`).run();

db.prepare(`
INSERT OR IGNORE INTO salons (id, name, slug)
VALUES ('s1', 'Totem Demo Salon', 'totem-demo-salon')
`).run();

db.prepare(`
INSERT OR IGNORE INTO salon_masters (master_id, salon_id, active)
VALUES ('m1', 's1', 1)
`).run();

db.prepare(`
INSERT OR IGNORE INTO services
(id, salon_id, name, duration_min, price)
VALUES ('srv1', 's1', 'Haircut', 60, 1000)
`).run();

db.prepare(`
INSERT OR IGNORE INTO master_services
(master_id, service_id)
VALUES ('m1', 'srv1')
`).run();

// ===== API HELPERS =====

export default {
  getMasterBySlug(slug) {
    return db.prepare(
      "SELECT * FROM masters WHERE slug = ? AND active = 1"
    ).get(slug);
  },

  getSalonBySlug(slug) {
    return db.prepare(
      "SELECT * FROM salons WHERE slug = ? AND active = 1"
    ).get(slug);
  },

  getActiveSalonByMaster(masterId, salonId = null) {
    if (salonId) {
      return db.prepare(`
        SELECT s.*
        FROM salons s
        JOIN salon_masters sm ON sm.salon_id = s.id
        WHERE sm.master_id = ?
          AND sm.salon_id = ?
          AND sm.active = 1
          AND s.active = 1
      `).get(masterId, salonId);
    }

    return db.prepare(`
      SELECT s.*
      FROM salons s
      JOIN salon_masters sm ON sm.salon_id = s.id
      WHERE sm.master_id = ?
        AND sm.active = 1
        AND s.active = 1
      LIMIT 1
    `).get(masterId);
  },

  getServices(masterId, salonId) {
    return db.prepare(`
      SELECT s.id, s.name, s.duration_min, s.price
      FROM services s
      JOIN master_services ms ON ms.service_id = s.id
      WHERE s.salon_id = ?
        AND ms.master_id = ?
        AND s.active = 1
    `).all(salonId, masterId);
  }
};
