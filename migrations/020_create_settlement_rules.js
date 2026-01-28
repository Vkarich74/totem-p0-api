// migrations/020_create_settlement_rules.js (ESM)
// Settlement rules: lock windows & refund-safe flags

import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, "..", "totem.db");

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

function run() {
  const tx = db.transaction(() => {

    // --- settlement_rules ---
    db.exec(`
      CREATE TABLE IF NOT EXISTS settlement_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,

        entity_type TEXT NOT NULL CHECK (entity_type IN ('global','salon','master')),
        entity_id   TEXT, -- null when global

        lock_days INTEGER NOT NULL, -- e.g. 7, 14, 30
        allow_refunds INTEGER NOT NULL DEFAULT 1, -- boolean (0/1)

        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    // One active rule per scope
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS ux_settlement_rules_scope
      ON settlement_rules (entity_type, COALESCE(entity_id, 'global'));
    `);

    // Seed GLOBAL default if not exists (14 days)
    const exists = db.prepare(`
      SELECT 1 FROM settlement_rules WHERE entity_type = 'global'
    `).get();

    if (!exists) {
      db.prepare(`
        INSERT INTO settlement_rules (entity_type, entity_id, lock_days, allow_refunds)
        VALUES ('global', NULL, 14, 1)
      `).run();
    }
  });

  tx();
}

try {
  run();
  console.log("✓ Migration 020_create_settlement_rules applied successfully");
} catch (err) {
  console.error("✗ Migration 020_create_settlement_rules failed");
  console.error(err);
  process.exit(1);
} finally {
  db.close();
}
