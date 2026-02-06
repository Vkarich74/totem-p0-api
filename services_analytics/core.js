import { db } from '../db/index.js';

/**
 * helpers
 */
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function parseDate(v) {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function monthKey(v) {
  const d = parseDate(v);
  if (!d) return null;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * LTV салона
 * НИКАКОГО SQL ФИЛЬТРА — только JS
 */
export function getSalonLTV({ salon_id }) {
  const rows = db.prepare('SELECT * FROM marketplace_commissions').all();
  let total = 0;

  for (const r of rows) {
    if (
      String(r.salon_id ?? r.salon ?? r.entity ?? '') === String(salon_id)
    ) {
      total += num(r.amount);
    }
  }

  return {
    salon_id: String(salon_id),
    ltv: total
  };
}

/**
 * Комиссии по мастерам
 */
export function getMasterCommissions({ limit = 50 }) {
  const rows = db.prepare('SELECT * FROM marketplace_commissions').all();
  const acc = {};

  for (const r of rows) {
    const masterId =
      r.master_id ??
      r.master ??
      (r.entity === 'master' ? r.entity_id : null);

    if (!masterId) continue;

    acc[masterId] = (acc[masterId] || 0) + num(r.amount);
  }

  return Object.entries(acc)
    .map(([master_id, total]) => ({ master_id: String(master_id), total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, Math.min(Number(limit) || 50, 200));
}

/**
 * Retention (cohort-light)
 */
export function getMonthlyRetention() {
  const rows = db.prepare('SELECT * FROM bookings').all();
  const map = {};

  for (const r of rows) {
    const key = monthKey(
      r.created_at ??
      r.booked_at ??
      r.date ??
      r.start_time ??
      null
    );
    if (!key) continue;
    map[key] = (map[key] || 0) + 1;
  }

  return {
    series: Object.keys(map)
      .sort()
      .map(m => ({ month: m, bookings: map[m] }))
  };
}
