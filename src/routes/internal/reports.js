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