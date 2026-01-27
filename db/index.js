import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

/**
 * Resolve DB path via ENV
 * prod (Railway): /tmp/totem.db
 * dev (local): ./totem.db
 */
function resolveDbPath() {
  const envPath = process.env.DB_PATH && String(process.env.DB_PATH).trim();

  if (envPath) {
    return path.isAbsolute(envPath)
      ? envPath
      : path.resolve(process.cwd(), envPath);
  }

  const isProd =
    process.env.NODE_ENV === "production" ||
    process.env.RAILWAY_PROJECT_ID ||
    process.env.RAILWAY_ENVIRONMENT_NAME;

  return isProd
    ? "/tmp/totem.db"
    : path.resolve(process.cwd(), "totem.db");
}

const dbPath = resolveDbPath();
const dbDir = path.dirname(dbPath);

// ensure directory exists
fs.mkdirSync(dbDir, { recursive: true });

/** singleton DB */
const db = new Database(dbPath);

// sane defaults
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

/**
 * Helpers (⚠️ ВАЖНО: они уже используются в коде)
 */

function openDb() {
  return db;
}

function runInTx(fn) {
  const tx = db.transaction(fn);
  return tx();
}

function nowIso() {
  return new Date().toISOString();
}

function auditLog({ actor_type, actor_id, action, entity_type, entity_id, meta }) {
  try {
    db.prepare(`
      INSERT INTO audit_log (
        actor_type,
        actor_id,
        action,
        entity_type,
        entity_id,
        meta,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      actor_type ?? null,
      actor_id ?? null,
      action,
      entity_type ?? null,
      entity_id ?? null,
      meta ? JSON.stringify(meta) : null,
      nowIso()
    );
  } catch (e) {
    // audit НЕ должен валить приложение
    console.error("AUDIT_LOG_FAILED", e.message);
  }
}

/**
 * Exports — КОНТРАКТ МОДУЛЯ
 */
export default db;
export {
  db,
  dbPath,
  openDb,
  runInTx,
  nowIso,
  auditLog
};
