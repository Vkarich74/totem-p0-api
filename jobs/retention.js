// jobs/retention.js (ESM)
// STEP 25 — periodic retention job (in-process)

import { runRetention } from "../core/retention.js";

export function startRetentionJob(db) {
  const enabled = (process.env.RETENTION_ENABLED || "1") !== "0";
  if (!enabled) {
    console.log("[RETENTION] disabled (RETENTION_ENABLED=0)");
    return;
  }

  const intervalMinutes = Number(process.env.RETENTION_INTERVAL_MIN || 10);
  const auditRetentionDays = Number(process.env.AUDIT_RETENTION_DAYS || 0);

  const intervalMs = Math.max(60_000, intervalMinutes * 60_000);

  function tick() {
    try {
      const result = runRetention(db, { auditRetentionDays });
      console.log("[RETENTION]", JSON.stringify({
        ts: new Date().toISOString(),
        ok: result.ok,
        idempotency_deleted: result.idempotency_deleted,
        audit_deleted: result.audit_deleted,
        audit_skipped: result.audit_skipped
      }));
    } catch (e) {
      console.error("[RETENTION_ERROR]", e && e.message ? e.message : e);
    }
  }

  // run once on boot
  tick();

  setInterval(tick, intervalMs).unref?.();

  console.log(`[RETENTION] enabled interval=${intervalMinutes}min audit_days=${auditRetentionDays || 0}`);
}
