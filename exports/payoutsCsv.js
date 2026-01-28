// exports/payoutsCsv.js
import { db } from '../db/index.js';

function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function exportPayoutsCsv({ period_from, period_to, entity_type, entity_id } = {}) {
  let where = [];
  let params = [];

  if (period_from) { where.push('period_from >= ?'); params.push(period_from); }
  if (period_to)   { where.push('period_to <= ?');   params.push(period_to); }
  if (entity_type) { where.push('entity_type = ?');   params.push(entity_type); }
  if (entity_id)   { where.push('entity_id = ?');     params.push(entity_id); }

  const sql = `
    SELECT id, entity_type, entity_id, period_from, period_to,
           total_paid, total_commission, net_amount, currency,
           status, created_at, paid_at
    FROM payouts
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY id ASC
  `;

  const rows = db.prepare(sql).all(...params);

  const header = [
    'id','entity_type','entity_id','period_from','period_to',
    'total_paid','total_commission','net_amount','currency',
    'status','created_at','paid_at'
  ];

  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(header.map(h => csvEscape(r[h])).join(','));
  }

  return {
    ok: true,
    rows: rows.length,
    csv: lines.join('\n')
  };
}
