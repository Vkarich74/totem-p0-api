// scripts/migrate_step23_idempotency.js
import Database from "better-sqlite3";
import path from "path";

function dbPath() {
  // приоритет: env, иначе локальная db рядом с проектом
  const fromEnv = process.env.TOTEM_DB_PATH && String(process.env.TOTEM_DB_PATH).trim();
  if (fromEnv) return fromEnv;
  return path.resolve(process.cwd(), "totem.db");
}

function nowIso() {
  return new Date().toISOString();
}

function main() {
  const file = dbPath();
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS idempotency_keys (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      scope              TEXT    NOT NULL,
      idem_key           TEXT    NOT NULL,
      actor              TEXT    NOT NULL,
      method             TEXT    NOT NULL,
      path               TEXT    NOT NULL,
      request_hash       TEXT    NOT NULL,

      status             TEXT    NOT NULL DEFAULT 'in_progress', -- in_progress | completed
      status_code        INTEGER,
      response_headers_json TEXT,
      response_body_json    TEXT,

      created_at         TEXT    NOT NULL,
      updated_at         TEXT    NOT NULL,
      expires_at         TEXT    NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS ux_idem_scope_key
      ON idempotency_keys(scope, idem_key);

    CREATE INDEX IF NOT EXISTS ix_idem_expires
      ON idempotency_keys(expires_at);

    CREATE INDEX IF NOT EXISTS ix_idem_actor
      ON idempotency_keys(actor);
  `);

  console.log(`[OK] idempotency_keys ensured in ${file} at ${nowIso()}`);
  db.close();
}

main();
