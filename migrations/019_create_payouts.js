// migrations/019_create_payouts.js (ESM)
// Creates payout ledger with anti-double-pay guarantees.

import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// DB path relative to project root
const DB_PATH = path.join(__dirname, "..", "totem.db");

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

function run() {
  const tx = db.transaction(() => {
    // --- payouts (header) ---
    db.exec(`
      CREATE TABLE IF NOT EXISTS payouts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL CHECK (entity_type IN ('salon','master')),
        entity_id TEXT NOT NULL,

        period_from TEXT NOT NULL,  -- YYYY-MM-DD
        period_to   TEXT NOT NULL,  -- YYYY-MM-DD

        total_paid        REAL NOT NULL DEFAULT 0,
        total_commission  REAL NOT NULL DEFAULT 0,
        net_amount        REAL NOT NULL DEFAULT 0,
        currency          TEXT NOT NULL,

        status     TEXT NOT NULL CHECK (status IN ('pending','paid')) DEFAULT 'pending',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        paid_at    TEXT
      );
    `);

    // Anti-double-pay: one payout per entity per period
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS ux_payouts_entity_period
      ON payouts (entity_type, entity_id, period_from, period_to);
    `);

    // --- payout_items (ledger by booking) ---
    db.exec(`
      CREATE TABLE IF NOT EXISTS payout_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        payout_id INTEGER NOT NULL,
        booking_id INTEGER NOT NULL,

        amount     REAL NOT NULL DEFAULT 0,
        commission REAL NOT NULL DEFAULT 0,
        net        REAL NOT NULL DEFAULT 0,

        FOREIGN KEY (payout_id) REFERENCES payouts(id) ON DELETE CASCADE
      );
    `);

    // Prevent the same booking being paid twice in ledger
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS ux_payout_items_booking
      ON payout_items (booking_id);
    `);
  });

  tx();
}

try {
  run();
  console.log("✓ Migration 019_create_payouts applied successfully");
} catch (err) {
  console.error("✗ Migration 019_create_payouts failed");
  console.error(err);
  process.exit(1);
} finally {
  db.close();
}
