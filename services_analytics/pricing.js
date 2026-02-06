import { db } from '../db/index.js';

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function getDate(v) {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function inRange(d, from, to) {
  if (!d) return false;
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

/**
 * GMV считаем максимально толерантно:
 * - payments.amount
 * - bookings.price / total / amount
 */
function calcGMV({ from, to }) {
  let sum = 0;

  // payments (если есть)
  try {
    const pays = db.prepare('SELECT * FROM payments').all();
    for (const p of pays) {
      const d = getDate(p.created_at ?? p.paid_at ?? p.date);
      if (!inRange(d, from, to)) continue;
      sum += num(p.amount);
    }
  } catch (_) {
    // таблицы может не быть — это ок
  }

  // fallback: bookings
  try {
    const books = db.prepare('SELECT * FROM bookings').all();
    for (const b of books) {
      const d = getDate(b.created_at ?? b.booked_at ?? b.date);
      if (!inRange(d, from, to)) continue;
      sum += num(b.price ?? b.total ?? b.amount);
    }
  } catch (_) {}

  return sum;
}

/**
 * Комиссии
 */
function calcCommissions({ from, to }) {
  let sum = 0;
  const rows = db.prepare('SELECT * FROM marketplace_commissions').all();
  for (const r of rows) {
    const d = getDate(r.created_at ?? r.date);
    if (!inRange(d, from, to)) continue;
    sum += num(r.amount);
  }
  return sum;
}

/**
 * ARPU / take-rate
 */
export function getPricingMetrics({ from = null, to = null }) {
  const fromD = from ? getDate(from) : null;
  const toD = to ? getDate(to) : null;

  const gmv = calcGMV({ from: fromD, to: toD });
  const commissions = calcCommissions({ from: fromD, to: toD });

  const salons = {};
  const rows = db.prepare('SELECT * FROM marketplace_commissions').all();
  for (const r of rows) {
    const salonId = r.salon_id ?? r.salon ?? null;
    if (!salonId) continue;
    salons[salonId] = true;
  }
  const salonsCount = Object.keys(salons).length || 0;

  const takeRate = gmv > 0 ? Number((commissions / gmv).toFixed(4)) : 0;
  const arpuGross = salonsCount ? Number((gmv / salonsCount).toFixed(2)) : 0;
  const arpuNet = salonsCount ? Number((commissions / salonsCount).toFixed(2)) : 0;

  return {
    period: { from, to },
    gmv,
    commissions,
    take_rate: takeRate,
    salons: salonsCount,
    arpu: {
      gross: arpuGross,
      net: arpuNet
    }
  };
}
