// jobs/backfillPayouts.js
import { db } from '../db/index.js';
import { withMetrics } from './metrics.js';
import { log } from '../logs/logger.js';

function parseIds(idsStr) {
  if (!idsStr) return [];
  return String(idsStr)
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(n => Number(n))
    .filter(n => Number.isFinite(n) && n > 0);
}

export function runBackfillMarkPaid({
  dryRun = false,
  request_id,
  confirm = false,
  filters = {}
} = {}) {
  return withMetrics((metrics) => {
    const now = new Date().toISOString();

    const where = ["status = 'pending'"];
    const params = [];

    // filters
    if (filters.id_min) { where.push('id >= ?'); params.push(Number(filters.id_min)); }
    if (filters.id_max) { where.push('id <= ?'); params.push(Number(filters.id_max)); }

    const ids = parseIds(filters.ids);
    if (ids.length) {
      where.push(`id IN (${ids.map(() => '?').join(',')})`);
      params.push(...ids);
    }

    if (filters.entity_type) { where.push('entity_type = ?'); params.push(String(filters.entity_type)); }
    if (filters.entity_id)   { where.push('entity_id = ?');   params.push(String(filters.entity_id)); }

    if (filters.period_from) { where.push('period_from >= ?'); params.push(String(filters.period_from)); }
    if (filters.period_to)   { where.push('period_to <= ?');   params.push(String(filters.period_to)); }

    // replay-style cutoff: close everything with period_to < cutoff
    if (filters.period_to_lt) { where.push('period_to < ?'); params.push(String(filters.period_to_lt)); }

    const sqlSelect = `
      SELECT id
      FROM payouts
      WHERE ${where.join(' AND ')}
      ORDER BY id ASC
    `;

    const rows = db.prepare(sqlSelect).all(...params);
    metrics.scanned = rows.length;

    // Safety: backfill write requires confirm=1 AND not dryRun
    if (!dryRun && !confirm) {
      return {
        ok: false,
        error: 'CONFIRM_REQUIRED',
        hint: 'Re-run with confirm=1 to apply changes',
        dry_run: false
      };
    }

    if (dryRun) {
      log('info', 'backfill_mark_paid_dry_run', {
        request_id,
        filters,
        metrics
      });
      return { ok: true, dry_run: true };
    }

    const markPaid = db.prepare(`
      UPDATE payouts
      SET status = 'paid',
          paid_at = ?
      WHERE id = ?
        AND status = 'pending'
    `);

    const tx = db.transaction(() => {
      for (const r of rows) {
        const res = markPaid.run(now, r.id);
        if (res.changes === 1) metrics.affected++;
      }
    });

    tx();

    log('info', 'backfill_mark_paid_applied', {
      request_id,
      filters,
      metrics
    });

    return { ok: true, dry_run: false };
  });
}
