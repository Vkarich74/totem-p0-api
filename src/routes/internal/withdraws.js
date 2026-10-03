import express from "express";

export default function buildWithdrawsRouter(pool, internalReadRateLimit){

const r = express.Router();

/*
SALON BILLING ACCESS HELPER
*/
async function getSalonBillingAccess(dbOrPool, salonId){

const billing = await dbOrPool.query(`
SELECT *
FROM public.billing_subscriptions
WHERE owner_type='salon'
AND owner_id=$1
LIMIT 1
`,[salonId]);

if(!billing.rows.length){
return {
exists:false,
subscription_status:"active",
access_state:"active",
can_write:true,
can_withdraw:true,
billing:null
};
}

const row = billing.rows[0];
const status = row.subscription_status || "active";

/* 🔴 НОРМАЛИЗАЦИЯ СОСТОЯНИЙ */
let access_state = status;
let can_write = true;
let can_withdraw = true;

if(status === "grace"){
can_write = true;
can_withdraw = false;
}

if(status === "overdue"){
can_write = false;
can_withdraw = false;
}

if(status === "blocked"){
can_write = false;
can_withdraw = false;
}

return {
exists:true,
subscription_status:status,
access_state,
can_write,
can_withdraw,
billing:row
};
}

/*
LEGACY SALON WITHDRAW CREATE — quarantined.
The former route derived available funds from the contaminated totem_test wallet
and created public.withdraws plus legacy withdraw ledger rows. New withdrawals
must use the Money Core withdraw-request flow.
*/
r.post("/salons/:slug/withdraw", (req,res)=>{
return res.status(410).json({
ok:false,
error:"LEGACY_SALON_WITHDRAW_DISABLED",
use:"/salons/:slug/money-core/withdraw-requests"
});
});

/* WITHDRAW TIMELINE (AUDIT) */
r.get("/withdraws/:id/timeline", internalReadRateLimit, async (req,res)=>{

const { id } = req.params;

try{

const withdraw = await pool.query(`
SELECT
id,
status,
amount,
external_ref,
created_at,
updated_at
FROM public.withdraws
WHERE id=$1
LIMIT 1
`,[id]);

if(!withdraw.rows.length){
return res.status(404).json({ok:false,error:"WITHDRAW_NOT_FOUND"});
}

const w = withdraw.rows[0];

const timeline = [];

timeline.push({
event:"created",
status:"pending",
at:w.created_at
});

if(w.updated_at && w.updated_at !== w.created_at){

if(w.status === 'processing'){
timeline.push({
event:"processing",
status:"processing",
at:w.updated_at
});
}

if(w.status === 'completed'){
timeline.push({
event:"processing",
status:"processing",
at:w.updated_at
});
timeline.push({
event:"completed",
status:"completed",
at:w.updated_at,
external_ref:w.external_ref
});
}

if(w.status === 'failed'){
timeline.push({
event:"processing",
status:"processing",
at:w.updated_at
});
timeline.push({
event:"failed",
status:"failed",
at:w.updated_at
});
}

}

return res.json({
ok:true,
withdraw_id:id,
timeline
});

}catch(err){

console.error("WITHDRAW_TIMELINE_ERROR",err);

return res.status(500).json({
ok:false,
error:"WITHDRAW_TIMELINE_FAILED"
});

}

});

/* WITHDRAW DASHBOARD (AGGREGATES) */
r.get("/salons/:slug/withdraws/summary", internalReadRateLimit, async (req,res)=>{

const { slug } = req.params;

try{

const salon = await pool.query(
`SELECT id FROM salons WHERE slug=$1`,
[slug]
);

if(!salon.rows.length){
return res.status(404).json({ok:false,error:"SALON_NOT_FOUND"});
}

const salonId = salon.rows[0].id;

const summary = await pool.query(`
SELECT
COUNT(*) FILTER (WHERE status='pending')::int AS pending_count,
COUNT(*) FILTER (WHERE status='processing')::int AS processing_count,
COUNT(*) FILTER (WHERE status='completed')::int AS completed_count,
COUNT(*) FILTER (WHERE status='failed')::int AS failed_count,
COALESCE(SUM(amount) FILTER (WHERE status='pending'),0)::int AS pending_amount,
COALESCE(SUM(amount) FILTER (WHERE status='processing'),0)::int AS processing_amount,
COALESCE(SUM(amount) FILTER (WHERE status='completed'),0)::int AS completed_amount,
COALESCE(SUM(amount) FILTER (WHERE status='failed'),0)::int AS failed_amount
FROM public.withdraws
WHERE owner_type='salon'
AND owner_id=$1
`,[salonId]);

return res.json({
ok:true,
summary:summary.rows[0]
});

}catch(err){

console.error("WITHDRAW_SUMMARY_ERROR",err);

return res.status(500).json({
ok:false,
error:"WITHDRAW_SUMMARY_FAILED"
});

}

});

return r;

}
