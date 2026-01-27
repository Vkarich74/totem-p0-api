import Database from "better-sqlite3";

/**
 * SINGLETON DB
 */
export const db = new Database("totem.db", {
  fileMustExist: true
});

/**
 * OPEN DB (compat layer)
 */
export function openDb() {
  return db;
}

/**
 * TRANSACTION WRAPPER
 */
export function runInTx(fn) {
  const tx = db.transaction(fn);
  return tx();
}

/**
 * ISO TIME
 */
export function nowIso() {
  return new Date().toISOString();
}

/**
 * AUDIT LOG (NO-OP SAFE DEFAULT)
 * Used by marketplace/system routes
 */
export function auditLog({
  actor_type = "system",
  actor_id = null,
  action,
  entity_type = null,
  entity_id = null,
  meta = null
}) {
  try {
    db.prepare(`
      INSERT INTO audit_log
        (actor_type, actor_id, action, entity_type, entity_id, meta, created_at)
      VALUES
        (?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      actor_type,
      actor_id,
      action,
      entity_type,
      entity_id,
      meta ? JSON.stringify(meta) : null
    );
  } catch (e) {
    // audit MUST NOT break core flow
    console.error("AUDIT_LOG_ERROR", e.message);
  }
}
