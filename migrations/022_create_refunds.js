// migrations/022_create_refunds.js (ESM)
// Refunds & chargebacks ledger

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

    // --- refunds ---
    db.exec(`
      CREATE TABLE IF NOT EXISTS refunds (
        id INTEGER PRIMARY KEY AUTOINCREMENT,

        booking_id INTEGER NOT NULL,
        payment_id INTEGER,
        amount REAL NOT NULL,
        currency TEXT NOT NULL,

        reason TEXT,
        type TEXT NOT NULL CHECK (type IN ('refund','chargeback')),

        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    // One refund event per booking per type (safe default)
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS ux_refunds_booking_type
      ON refunds (booking_id, type);
    `);

    // Extend booking_payments statuses (soft, no ALTER)
    // status values now may include: succeeded | refunded | chargeback
  });

  tx();
}

try {
  run();
  console.log("✓ Migration 022_create_refunds applied successfully");
} catch (err) {
  console.error("✗ Migration 022_create_refunds failed");
  console.error(err);
  process.exit(1);
} finally {
  db.close();
}
