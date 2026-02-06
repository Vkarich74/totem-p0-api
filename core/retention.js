// core/retention.js (ESM)
// STEP 25 — Data lifecycle: retention & cleanup helpers

import { cleanupExpiredIdempotency } from "./idempotency.js";

function auditTableExists(db) {
  const row = db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type='table' AND name='audit_log'
  `).get();
  return !!row;
}

export function runRetention(db, opts = {}) {
  const out = {
    ok: true,
    idempotency_deleted: 0,
    audit_deleted: 0,
    audit_skipped: false
  };

  // 1) idempotency cleanup (always)
  try {
    const r = cleanupExpiredIdempotency(db);
    out.idempotency_deleted = Number(r.deleted || 0);
  } catch (e) {
    out.ok = false;
    out.idempotency_error = "IDEMPOTENCY_CLEANUP_FAILED";
  }

  // 2) audit retention (optional)
  const auditRetentionDays = Number(opts.auditRetentionDays || 0);

  if (!auditRetentionDays || auditRetentionDays < 1) {
    out.audit_skipped = true;
    return out;
  }

  if (!auditTableExists(db)) {
    out.audit_skipped = true;
    return out;
  }

  try {
    // keep last N days; assumes created_at is ISO string
    const cutoff = new Date(Date.now() - auditRetentionDays * 24 * 60 * 60 * 1000).toISOString();
    const del = db.prepare(`DELETE FROM audit_log WHERE created_at < ?`);
    const info = del.run(cutoff);
    out.audit_deleted = Number(info.changes || 0);
  } catch (e) {
    out.ok = false;
    out.audit_error = "AUDIT_RETENTION_FAILED";
  }

  return out;
}
