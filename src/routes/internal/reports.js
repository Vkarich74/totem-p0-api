import express from "express";

export default function buildReportsRouter(pool, internalReadRateLimit){

const r = express.Router();

/* PLATFORM FINANCE REPORT */
r.get("/reports/platform/finance", internalReadRateLimit, async (req,res)=>{

try{

const revenue = await pool.query(`
SELECT COALESCE(SUM(amount),0)::int AS total_revenue
FROM payments
WHERE status='confirmed'
`);

const payouts = await pool.query(`
SELECT COALESCE(SUM(amount),0)::int AS total_payouts
FROM payouts
WHERE status IN ('paid','executed')
`);

const wallets = await pool.query(`
SELECT COUNT(*)::int AS wallets_total
FROM totem_test.wallets
`);

res.json({
ok:true,
platform_finance:{
revenue_total:revenue.rows[0].total_revenue,
payouts_total:payouts.rows[0].total_payouts,
wallets_total:wallets.rows[0].wallets_total
}
});

}catch(err){

console.error("PLATFORM_FINANCE_REPORT_ERROR",err);

res.status(500).json({
ok:false,
error:"PLATFORM_FINANCE_REPORT_FAILED"
});

}

});

/* PLATFORM LEDGER REPORT */
r.get("/reports/platform/ledger", internalReadRateLimit, async (req,res)=>{

try{

const ledger = await pool.query(`
SELECT *
FROM totem_test.v_ledger_global_balance
`);

res.json({
ok:true,
ledger:ledger.rows
});

}catch(err){

console.error("PLATFORM_LEDGER_REPORT_ERROR",err);

res.status(500).json({
ok:false,
error:"PLATFORM_LEDGER_REPORT_FAILED"
});

}

});

/* PLATFORM RECONCILIATION REPORT */
r.get("/reports/platform/reconciliation", internalReadRateLimit, async (req,res)=>{

try{

const summary = await pool.query(`
SELECT *
FROM totem_test.v_reconciliation_summary
`);

res.json({
ok:true,
reconciliation:summary.rows
});

}catch(err){

console.error("RECONCILIATION_REPORT_ERROR",err);

res.status(500).json({
ok:false,
error:"RECONCILIATION_REPORT_FAILED"
});

}

});

/* PAYMENTS SUMMARY REPORT */
r.get("/reports/payments-summary", internalReadRateLimit, async (req, res) => {
try {

const {
date_from: dateFromRaw = "",
date_to: dateToRaw = "",
provider: providerRaw = "",
payment_status: paymentStatusRaw = "",
payout_status: payoutStatusRaw = "",
booking_status: bookingStatusRaw = "",
salon_id: salonIdRaw = "",
master_id: masterIdRaw = "",
limit: limitRaw = "100"
} = req.query || {};

const filters = {
date_from: String(dateFromRaw || "").trim(),
date_to: String(dateToRaw || "").trim(),
provider: String(providerRaw || "").trim(),
payment_status: String(paymentStatusRaw || "").trim(),
payout_status: String(payoutStatusRaw || "").trim(),
booking_status: String(bookingStatusRaw || "").trim(),
salon_id: String(salonIdRaw || "").trim(),
master_id: String(masterIdRaw || "").trim(),
limit: Math.min(Math.max(Number.parseInt(String(limitRaw || "100"), 10) || 100, 1), 500)
};

const params = [];
const whereParts = [];

function pushParam(value) {
params.push(value);
return `$${params.length}`;
}

if (filters.date_from) {
whereParts.push(`COALESCE(p.created_at, b.created_at)::date >= ${pushParam(filters.date_from)}`);
}

if (filters.date_to) {
whereParts.push(`COALESCE(p.created_at, b.created_at)::date <= ${pushParam(filters.date_to)}`);
}

if (filters.provider && filters.provider.toLowerCase() !== "all") {
whereParts.push(`COALESCE(p.provider, 'unknown') = ${pushParam(filters.provider)}`);
}

if (filters.payment_status && filters.payment_status.toLowerCase() !== "all") {
whereParts.push(`COALESCE(p.status, 'unknown') = ${pushParam(filters.payment_status)}`);
}

if (filters.payout_status) {
const payoutStatus = filters.payout_status.toLowerCase();
if (payoutStatus === "no_payout") {
whereParts.push(`po.id IS NULL`);
} else if (payoutStatus !== "all") {
whereParts.push(`COALESCE(po.status, 'no_payout') = ${pushParam(filters.payout_status)}`);
}
}

if (filters.booking_status && filters.booking_status.toLowerCase() !== "all") {
whereParts.push(`COALESCE(b.status, 'unknown') = ${pushParam(filters.booking_status)}`);
}

const numericFilter = (value) => /^\d+$/.test(String(value || "").trim()) ? String(value).trim() : "";

const salonId = numericFilter(filters.salon_id);
if (salonId) {
whereParts.push(`b.salon_id = ${pushParam(Number(salonId))}`);
}

const masterId = numericFilter(filters.master_id);
if (masterId) {
whereParts.push(`b.master_id = ${pushParam(Number(masterId))}`);
}

const whereSql = whereParts.length ? `WHERE ${whereParts.join("\nAND ")}` : "";
const baseCte = `
WITH base AS (
  SELECT
    p.id AS payment_id,
    p.booking_id,
    p.provider,
    p.status AS payment_status,
    p.is_active AS payment_is_active,
    p.amount AS payment_amount,
    p.created_at AS payment_created_at,
    po.id AS payout_id,
    po.status AS payout_status,
    po.gross_amount,
    po.platform_fee,
    po.provider_amount,
    po.take_rate_bps,
    b.status AS booking_status,
    b.salon_id,
    b.master_id,
    b.service_id,
    b.start_at AS booking_start_at,
    COALESCE(p.created_at, b.created_at) AS sort_created_at
  FROM public.payments p
  JOIN public.bookings b ON b.id = p.booking_id
  LEFT JOIN public.payouts po ON po.payment_id = p.id
  ${whereSql}
)
`;

const summarySql = `${baseCte}
SELECT
  COUNT(*)::int AS payments_count,
  COUNT(*) FILTER (WHERE payment_status = 'confirmed' AND payment_is_active = true)::int AS confirmed_count,
  COUNT(*) FILTER (WHERE payment_status = 'pending' AND payment_is_active = true)::int AS pending_count,
  COALESCE(SUM(payment_amount) FILTER (WHERE payment_status = 'confirmed' AND payment_is_active = true), 0) AS gross_confirmed,
  COALESCE(SUM(payment_amount) FILTER (WHERE provider = 'direct' AND payment_status = 'confirmed' AND payment_is_active = true), 0) AS direct_gross,
  COALESCE(SUM(payment_amount) FILTER (WHERE provider = 'xpay' AND payment_status = 'confirmed' AND payment_is_active = true), 0) AS xpay_confirmed_gross,
  COALESCE(SUM(payment_amount) FILTER (WHERE payment_status = 'pending' AND payment_is_active = true), 0) AS pending_gross,
  COALESCE(SUM(platform_fee) FILTER (WHERE payment_status = 'confirmed' AND payment_is_active = true), 0) AS platform_fee,
  COALESCE(SUM(provider_amount) FILTER (WHERE payment_status = 'confirmed' AND payment_is_active = true), 0) AS owner_amount,
  COALESCE(SUM(provider_amount) FILTER (WHERE provider = 'direct' AND payment_status = 'confirmed' AND payment_is_active = true), 0) AS direct_owner_amount,
  COALESCE(SUM(provider_amount) FILTER (WHERE provider = 'direct' AND payment_status = 'confirmed' AND payment_is_active = true AND payout_status = 'paid'), 0) AS direct_paid_out,
  COALESCE(SUM(provider_amount) FILTER (WHERE provider = 'direct' AND payment_status = 'confirmed' AND payment_is_active = true), 0)
    - COALESCE(SUM(provider_amount) FILTER (WHERE provider = 'direct' AND payment_status = 'confirmed' AND payment_is_active = true AND payout_status = 'paid'), 0) AS direct_remaining,
  COUNT(*) FILTER (WHERE payment_status = 'confirmed' AND payment_is_active = true AND payout_id IS NULL)::int AS payouts_missing_count,
  COUNT(*) FILTER (WHERE payment_status = 'confirmed' AND payment_is_active = true AND booking_status IN ('confirmed', 'completed') AND payout_id IS NOT NULL)::int AS accounting_valid_count,
  COUNT(*) FILTER (WHERE payment_status = 'confirmed' AND payment_is_active = true AND (payout_id IS NULL OR booking_status NOT IN ('confirmed', 'completed')))::int AS accounting_warning_count
FROM base
`;

const breakdownByProviderSql = `${baseCte}
SELECT COALESCE(provider, 'unknown') AS key, COUNT(*)::int AS count
FROM base
GROUP BY 1
ORDER BY 1
`;

const breakdownByPaymentStatusSql = `${baseCte}
SELECT COALESCE(payment_status, 'unknown') AS key, COUNT(*)::int AS count
FROM base
GROUP BY 1
ORDER BY 1
`;

const breakdownByPayoutStatusSql = `${baseCte}
SELECT COALESCE(payout_status, 'no_payout') AS key, COUNT(*)::int AS count
FROM base
GROUP BY 1
ORDER BY 1
`;

const breakdownByBookingStatusSql = `${baseCte}
SELECT COALESCE(booking_status, 'unknown') AS key, COUNT(*)::int AS count
FROM base
GROUP BY 1
ORDER BY 1
`;

const rowsSql = `${baseCte}
SELECT
  payment_id,
  booking_id,
  provider,
  payment_status,
  payment_is_active,
  payment_amount,
  payment_created_at,
  payout_id,
  payout_status,
  gross_amount,
  platform_fee,
  provider_amount,
  take_rate_bps,
  booking_status,
  salon_id,
  master_id,
  service_id,
  booking_start_at
FROM base
ORDER BY sort_created_at DESC, payment_id DESC
LIMIT ${filters.limit}
`;

const integrityCountsSql = `
SELECT issue_type, COUNT(*)::int AS count
FROM public.v_financial_integrity_check
GROUP BY issue_type
ORDER BY issue_type
`;

const integritySampleSql = `
SELECT *
FROM public.v_financial_integrity_check
LIMIT 20
`;

const [
summaryRes,
byProviderRes,
byPaymentStatusRes,
byPayoutStatusRes,
byBookingStatusRes,
rowsRes,
integrityCountsRes,
integritySampleRes
] = await Promise.all([
pool.query(summarySql, params),
pool.query(breakdownByProviderSql, params),
pool.query(breakdownByPaymentStatusSql, params),
pool.query(breakdownByPayoutStatusSql, params),
pool.query(breakdownByBookingStatusSql, params),
pool.query(rowsSql, params),
pool.query(integrityCountsSql),
pool.query(integritySampleSql)
]);

const summary = summaryRes.rows[0] || {};

res.json({
ok: true,
filters,
summary: {
  payments_count: Number(summary.payments_count || 0),
  confirmed_count: Number(summary.confirmed_count || 0),
  pending_count: Number(summary.pending_count || 0),
  gross_confirmed: summary.gross_confirmed || 0,
  direct_gross: summary.direct_gross || 0,
  xpay_confirmed_gross: summary.xpay_confirmed_gross || 0,
  pending_gross: summary.pending_gross || 0,
  platform_fee: summary.platform_fee || 0,
  owner_amount: summary.owner_amount || 0,
  direct_owner_amount: summary.direct_owner_amount || 0,
  direct_paid_out: summary.direct_paid_out || 0,
  direct_remaining: summary.direct_remaining || 0,
  payouts_missing_count: Number(summary.payouts_missing_count || 0),
  accounting_valid_count: Number(summary.accounting_valid_count || 0),
  accounting_warning_count: Number(summary.accounting_warning_count || 0)
},
breakdown: {
  by_provider: byProviderRes.rows,
  by_payment_status: byPaymentStatusRes.rows,
  by_payout_status: byPayoutStatusRes.rows,
  by_booking_status: byBookingStatusRes.rows
},
integrity: {
  counts: integrityCountsRes.rows,
  sample: integritySampleRes.rows
},
rows: rowsRes.rows
});

} catch (err) {

console.error("PAYMENTS_SUMMARY_REPORT_ERROR", err);

res.status(500).json({
ok: false,
error: "PAYMENTS_SUMMARY_REPORT_FAILED"
});

}
});

/* FINANCE STATUS (CONTROL PANEL) */
r.get("/finance/status", internalReadRateLimit, async (req,res)=>{

try{

/* settlements pending */
const settlementsPending = await pool.query(`
SELECT COUNT(*)::int AS v
FROM payments p
LEFT JOIN settlement_items si ON si.payment_id=p.id
LEFT JOIN payouts po ON po.booking_id=p.booking_id
WHERE p.status='confirmed'
AND si.id IS NULL
AND po.id IS NULL
`);

/* payouts pending */
const payoutsPending = await pool.query(`
SELECT COUNT(*)::int AS v
FROM payouts
WHERE status='created'
`);

/* withdraws pending */
const withdrawsPending = await pool.query(`
SELECT COUNT(*)::int AS v
FROM public.withdraws
WHERE status='pending'
`);

/* withdraws processing */
const withdrawsProcessing = await pool.query(`
SELECT COUNT(*)::int AS v
FROM public.withdraws
WHERE status='processing'
`);

/* withdraws failed */
const withdrawsFailed = await pool.query(`
SELECT COUNT(*)::int AS v
FROM public.withdraws
WHERE status='failed'
`);

return res.json({
ok:true,
status:{
settlements_pending:settlementsPending.rows[0].v,
payouts_pending:payoutsPending.rows[0].v,
withdraws_pending:withdrawsPending.rows[0].v,
withdraws_processing:withdrawsProcessing.rows[0].v,
withdraws_failed:withdrawsFailed.rows[0].v
}
});

}catch(err){

console.error("FINANCE_STATUS_ERROR",err);

return res.status(500).json({
ok:false,
error:"FINANCE_STATUS_FAILED"
});

}

});

return r;

}
