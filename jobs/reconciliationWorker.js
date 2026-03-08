// jobs/reconciliationWorker.js
// FINANCIAL RECONCILIATION ORCHESTRATOR
// Runs all finance integrity checks in one place

import { detectReconcileMismatch } from "./detectReconcileMismatch.js";
import { payoutConsistencyCheck } from "./payoutConsistencyCheck.js";
import { dataDisciplineCheck } from "./dataDisciplineCheck.js";
import { detectLockedPayouts } from "./detectLockedPayouts.js";
import { autoHealingHints } from "./autoHealingHints.js";

function normalizeResult(name, value) {
  return {
    name,
    ok: true,
    result: value ?? null,
  };
}

function normalizeError(name, error) {
  return {
    name,
    ok: false,
    error: error?.message || String(error),
  };
}

async function runSafe(name, fn) {
  try {
    const result = await fn();
    return normalizeResult(name, result);
  } catch (error) {
    console.error(`[RECONCILIATION_STEP_ERROR] ${name}`, error);
    return normalizeError(name, error);
  }
}

export async function runReconciliationWorker() {
  const startedAt = new Date().toISOString();

  const checks = [];

  checks.push(
    await runSafe("detectReconcileMismatch", async () => {
      return await detectReconcileMismatch();
    })
  );

  checks.push(
    await runSafe("payoutConsistencyCheck", async () => {
      return await payoutConsistencyCheck();
    })
  );

  checks.push(
    await runSafe("dataDisciplineCheck", async () => {
      return await dataDisciplineCheck();
    })
  );

  checks.push(
    await runSafe("detectLockedPayouts", async () => {
      return await detectLockedPayouts();
    })
  );

  checks.push(
    await runSafe("autoHealingHints", async () => {
      return await autoHealingHints();
    })
  );

  const failed = checks.filter((x) => !x.ok);
  const succeeded = checks.filter((x) => x.ok);

  const summary = {
    ok: failed.length === 0,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    total_checks: checks.length,
    passed_checks: succeeded.length,
    failed_checks: failed.length,
    checks,
  };

  if (!summary.ok) {
    console.error("[RECONCILIATION_WORKER_FAILED]", {
      failed_checks: failed.map((x) => x.name),
    });
  } else {
    console.log("[RECONCILIATION_WORKER_OK]", {
      total_checks: summary.total_checks,
    });
  }

  return summary;
}