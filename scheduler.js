import cron from "node-cron";
import fetch from "node-fetch";
import { db } from "./db/index.js";

/**
 * ENV:
 * SCHEDULER_ENABLED=1|0
 * SCHEDULER_CRON="0 * * * *"
 * ALERT_WEBHOOK_URL=
 * ALERT_MIN_AFFECTED=1
 * ALERT_MAX_DURATION_MS=60000
 */

const ENABLED = process.env.SCHEDULER_ENABLED === "1";
const CRON = process.env.SCHEDULER_CRON || "0 * * * *";

const ALERT_WEBHOOK_URL = process.env.ALERT_WEBHOOK_URL || "";
const ALERT_MIN_AFFECTED = Number(process.env.ALERT_MIN_AFFECTED || 1);
const ALERT_MAX_DURATION_MS = Number(process.env.ALERT_MAX_DURATION_MS || 60000);

async function alert(payload) {
  if (!ALERT_WEBHOOK_URL) return;
  try {
    await fetch(ALERT_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.error("ALERT_SEND_ERROR", e.message);
  }
}

async function runSettlement({ dryRun }) {
  const started = Date.now();

  const payouts = db.prepare(`
    SELECT id FROM payouts WHERE status = 'pending'
  `).all();

  if (!dryRun) {
    const tx = db.transaction(() => {
      for (const p of payouts) {
        db.prepare(`
          UPDATE payouts
          SET status='paid', paid_at=datetime('now')
          WHERE id=?
        `).run(p.id);
      }
    });
    tx();
  }

  const duration = Date.now() - started;

  if (
    payouts.length >= ALERT_MIN_AFFECTED ||
    duration >= ALERT_MAX_DURATION_MS
  ) {
    await alert({
      type: "settlement",
      dry_run: dryRun,
      affected: payouts.length,
      duration_ms: duration,
      at: new Date().toISOString(),
    });
  }

  console.log(
    `[SCHEDULER] settlement ${dryRun ? "DRY" : "RUN"} affected=${payouts.length} ${duration}ms`
  );
}

if (ENABLED) {
  console.log(`[SCHEDULER] enabled (${CRON})`);
  cron.schedule(CRON, async () => {
    const dryRun = process.env.NODE_ENV !== "production";
    try {
      await runSettlement({ dryRun });
    } catch (e) {
      console.error("SCHEDULER_ERROR", e);
      await alert({ type: "scheduler_error", message: e.message });
    }
  });
} else {
  console.log("[SCHEDULER] disabled");
}
