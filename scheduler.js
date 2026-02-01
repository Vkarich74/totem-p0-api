// scheduler.js
import cron from "node-cron";
import { db } from "./db/index.js";
import { runAutoSettlement } from "./jobs/scheduler.js";

/**
 * ENV:
 * SCHEDULER_ENABLED=1|0
 * SCHEDULER_CRON="0 * * * *"
 * ALERT_WEBHOOK_URL=
 */

const ENABLED = process.env.SCHEDULER_ENABLED === "1";
const CRON = process.env.SCHEDULER_CRON || "0 * * * *";
const LOCK_KEY = "GLOBAL_SCHEDULER_LOCK";

async function acquireLock() {
  try {
    const res = db.prepare(`
      INSERT INTO system_locks (lock_key, acquired_at)
      VALUES (?, datetime('now'))
      ON CONFLICT(lock_key) DO NOTHING
    `).run(LOCK_KEY);
    return res.changes === 1;
  } catch (e) {
    console.error("SCHEDULER_LOCK_ERROR", e.message);
    return false;
  }
}

async function releaseLock() {
  try {
    db.prepare(`DELETE FROM system_locks WHERE lock_key = ?`).run(LOCK_KEY);
  } catch {}
}

if (!ENABLED) {
  console.log("[SCHEDULER] disabled");
  process.exit(0);
}

console.log(`[SCHEDULER] enabled (${CRON})`);

cron.schedule(CRON, async () => {
  const locked = await acquireLock();
  if (!locked) {
    console.log("[SCHEDULER] skip — lock already held");
    return;
  }

  try {
    const dryRun = process.env.NODE_ENV !== "production";
    await runAutoSettlement({ db, dryRun });
  } catch (e) {
    console.error("SCHEDULER_RUN_ERROR", e);
  } finally {
    await releaseLock();
  }
});
