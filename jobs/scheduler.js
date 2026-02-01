// jobs/scheduler.js
/**
 * Canonical scheduler jobs
 * NO cron
 * NO intervals
 */

export async function runAutoSettlement({ db, dryRun }) {
  const started = Date.now();

  const payouts = db
    .prepare(`SELECT id FROM payouts WHERE status = 'pending'`)
    .all();

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
  console.log(
    `[JOB] auto-settlement ${dryRun ? "DRY" : "RUN"} affected=${payouts.length} ${duration}ms`
  );

  return { affected: payouts.length, duration };
}
