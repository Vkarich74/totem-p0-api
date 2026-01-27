// core/reports.js (ESM)
// Reports with adjustments (refunds / chargebacks)

function normalizeDateParam(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(s + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return null;
  const [y, m, day] = s.split("-").map(Number);
  if (
    d.getUTCFullYear() !== y ||
    d.getUTCMonth() + 1 !== m ||
    d.getUTCDate() !== day
  ) return null;
  return s;
}

function buildDateRangeWhere(from, to) {
  const clauses = [];
  const params = {};
  if (from) { clauses.push("b.date >= @from"); params.from = from; }
  if (to) { clauses.push("b.date <= @to"); params.to = to; }
  return {
    where: clauses.length ? " AND " + clauses.join(" AND ") : "",
    params
  };
}

function sumMoney(rows) {
  let total = 0;
  let currency = null;
  let adjustments = 0;

  for (const r of rows) {
    const amt = Number(r.amount ?? 0);
    if (!Number.isFinite(amt)) continue;

    total += amt;

    if (r.net < 0) {
      adjustments += r.net; // negative
    }

    if (r.currency) {
      if (!currency) currency = r.currency;
      else if (currency !== r.currency) {
        return { multiCurrency: true };
      }
    }
  }

  return {
    total,
    adjustments,
    currency: currency || "USD",
    multiCurrency: false
  };
}

export function getSalonReport(db, salonId, { from, to } = {}) {
  const fromDate = normalizeDateParam(from);
  const toDate = normalizeDateParam(to);
  if ((from && !fromDate) || (to && !toDate)) {
    const e = new Error("Invalid date range");
    e.code = "INVALID_DATE_RANGE";
    throw e;
  }

  const { where, params } = buildDateRangeWhere(fromDate, toDate);

  const rows = db.prepare(`
    SELECT
      COALESCE(pi.net, p.amount) AS amount,
      pi.net AS net,
      p.currency
    FROM booking_payments p
    JOIN bookings b ON b.id = p.booking_id
    LEFT JOIN payout_items pi ON pi.booking_id = b.id
    WHERE b.salon_id = @salonId
      AND p.status IN ('succeeded','refunded','chargeback')
      ${where}
  `).all({ salonId: String(salonId), ...params });

  const sums = sumMoney(rows);
  if (sums.multiCurrency) {
    const e = new Error("Multiple currencies not supported");
    e.code = "MULTI_CURRENCY";
    throw e;
  }

  return {
    salon_id: String(salonId),
    period: { from: fromDate, to: toDate },
    total_paid: round2(sums.total),
    adjustments_total: round2(sums.adjustments),
    net_to_salon: round2(sums.total + sums.adjustments),
    currency: sums.currency
  };
}

export function getMasterReport(db, masterId, { from, to } = {}) {
  const fromDate = normalizeDateParam(from);
  const toDate = normalizeDateParam(to);
  if ((from && !fromDate) || (to && !toDate)) {
    const e = new Error("Invalid date range");
    e.code = "INVALID_DATE_RANGE";
    throw e;
  }

  const { where, params } = buildDateRangeWhere(fromDate, toDate);

  const rows = db.prepare(`
    SELECT
      COALESCE(pi.net, p.amount) AS amount,
      pi.net AS net,
      p.currency
    FROM booking_payments p
    JOIN bookings b ON b.id = p.booking_id
    LEFT JOIN payout_items pi ON pi.booking_id = b.id
    WHERE b.master_id = @masterId
      AND p.status IN ('succeeded','refunded','chargeback')
      ${where}
  `).all({ masterId: String(masterId), ...params });

  const sums = sumMoney(rows);
  if (sums.multiCurrency) {
    const e = new Error("Multiple currencies not supported");
    e.code = "MULTI_CURRENCY";
    throw e;
  }

  return {
    master_id: String(masterId),
    period: { from: fromDate, to: toDate },
    total_paid: round2(sums.total),
    adjustments_total: round2(sums.adjustments),
    net_to_salon: round2(sums.total + sums.adjustments),
    currency: sums.currency
  };
}

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}
