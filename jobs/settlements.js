// jobs/settlements.js
import { db } from '../db/index.js';
import { withMetrics } from './metrics.js';
import { sendWebhook } from '../webhooks/sender.js';
import { maybeAlert } from '../alerts/alert.js';
import { log } from '../logs/logger.js';

const WEBHOOK_URL = process.env.WEBHOOK_URL;

export function runSettlementsJob({ dryRun = false, request_id } = {}) {
  return withMetrics((metrics) => {
    const now = new Date().toISOString();

    const rows = db.prepare(`
      SELECT id
      FROM payouts
      WHERE status = 'pending'
    `).all();

    metrics.scanned = rows.length;

    if (!dryRun) {
      const markPaid = db.prepare(`
        UPDATE payouts
        SET status = 'paid',
            paid_at = ?
        WHERE id = ?
          AND status = 'pending'
      `);

      const tx = db.transaction(() => {
        for (const row of rows) {
          const res = markPaid.run(now, row.id);
          if (res.changes === 1) metrics.affected++;
        }
      });
      tx();
    }

    const result = { ok: true, dry_run: dryRun };

    log('info', 'job_settlements_done', {
      request_id,
      metrics,
      dry_run: dryRun
    });

    if (WEBHOOK_URL) {
      sendWebhook(WEBHOOK_URL, {
        job: 'settlements',
        request_id,
        ...result,
        metrics
      }).catch(() => {});
    }

    maybeAlert({
      job: 'settlements',
      dry_run: dryRun,
      metrics,
      note: 'post-run',
      request_id
    }).catch(() => {});

    return result;
  });
}
