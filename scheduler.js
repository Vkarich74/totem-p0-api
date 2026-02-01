// scheduler.js
import cron from "node-cron";
import pool from "./db/index.js";
import { runAutoSettlement } from "./jobs/scheduler.js";
import { runQueueWorker } from "./jobs/queueWorker.js";

/**
 * ENV:
 * SCHEDULER_ENABLED=1|0
 * SCHEDULER_CRON="0 * * * *"
 */

const ENABLED = process.env.SCHEDULER_ENABLED === "1";
const CRON = process.env.SCHEDULER_CRON || "0 * * * *";
const LOCK_KEY = "GLOBAL_SCHEDULER_LOCK";

/**
 * Simple DB-backed process lock
 * prevents double execution on scale / restart
 */
async function acquireLock(client) {
  const res = await client.query(
    `
    INSERT INTO system_locks (lock_key, acquired_at)
    VALUES ($1, now())
    ON CONFLICT (lock_key) DO NOTHING
  `,
    [LOCK_KEY]
  );
  return res.rowCount === 1;
}

async function releaseLock(client) {
  await client.query(`DELETE FROM system_locks WHERE lock_key = $1`, [LOCK_KEY]);
}

if (!ENABLED) {
  console.log("[SCHEDULER] disabled");
  process.exit(0);
}

console.log(`[SCHEDULER] enabled (${CRON})`);

cron.schedule(CRON, async () => {
  const client = await pool.connect();
  try {
    const locked = await acquireLock(client);
    if (!locked) {
      console.log("[SCHEDULER] skip — lock already held");
      return;
    }

    const dryRun = process.env.NODE_ENV !== "production";

    // 1) settlements
    await runAutoSettlement({ db: client, dryRun });

    // 2) async queue
    await runQueueWorker({ limit: 10 });
  } catch (err) {
    console.error("SCHEDULER_RUN_ERROR", err);
  } finally {
    try {
      await releaseLock(client);
    } catch {}
    client.release();
  }
});
