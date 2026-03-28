import express from "express";

export default function buildWithdrawsRouter(pool, internalReadRateLimit){

const r = express.Router();

/* SALON WITHDRAW */
r.post("/salons/:slug/withdraw", async (req,res)=>{

const { slug } = req.params;
const { amount, destination } = req.body;

const db = await pool.connect();

try{

await db.query("BEGIN");

const value = parseInt(amount,10);

if(!value || value <= 0){
await db.query("ROLLBACK");
return res.status(400).json({ok:false,error:"INVALID_AMOUNT"});
}

const salon = await db.query(`
SELECT id
FROM salons
WHERE slug=$1
`,[slug]);

if(!salon.rows.length){
await db.query("ROLLBACK");
return res.status(404).json({ok:false,error:"SALON_NOT_FOUND"});
}

const salonId = salon.rows[0].id;

const wallet = await db.query(`
SELECT id
FROM totem_test.wallets
WHERE owner_type='salon'
AND owner_id=$1
LIMIT 1
`,[salonId]);

if(!wallet.rows.length){
await db.query("ROLLBACK");
return res.status(400).json({ok:false,error:"SALON_WALLET_NOT_FOUND"});
}

const walletId = wallet.rows[0].id;

const balance = await db.query(`
SELECT COALESCE(v.computed_balance_cents,0)::int AS balance
FROM totem_test.v_wallet_balance_computed v
WHERE v.wallet_id=$1
`,[walletId]);

const currentBalance = balance.rows[0]?.balance || 0;

if(value > currentBalance){
await db.query("ROLLBACK");
return res.status(400).json({
ok:false,
error:"INSUFFICIENT_FUNDS",
balance:currentBalance
});
}

const withdraw = await db.query(`
INSERT INTO public.withdraws(
owner_type,
owner_id,
wallet_id,
amount,
status,
destination
)
VALUES($1,$2,$3,$4,'pending',$5)
RETURNING id
`,[
'salon',
salonId,
walletId,
value,
destination || null
]);

const withdrawId = withdraw.rows[0].id;

const systemWallet = await db.query(`
SELECT wallet_id
FROM totem_test.system_wallets
LIMIT 1
`);

if(!systemWallet.rows.length){
await db.query("ROLLBACK");
return res.status(400).json({ok:false,error:"SYSTEM_WALLET_NOT_FOUND"});
}

const systemWalletId = systemWallet.rows[0].wallet_id;

await db.query(`
INSERT INTO totem_test.ledger_entries(
wallet_id,
direction,
amount_cents,
reference_type,
reference_id
)
VALUES($1,'debit',$2,'withdraw',$3)
`,[
walletId,
value,
withdrawId
]);

await db.query(`
INSERT INTO totem_test.ledger_entries(
wallet_id,
direction,
amount_cents,
reference_type,
reference_id
)
VALUES($1,'credit',$2,'withdraw',$3)
`,[
systemWalletId,
value,
withdrawId
]);

await db.query("COMMIT");

return res.json({
ok:true,
withdraw_id:withdrawId,
amount:value,
destination:destination || null,
status:'pending'
});

}catch(err){

try{ await db.query("ROLLBACK"); }catch(e){}

console.error("SALON_WITHDRAW_ERROR",err);

return res.status(500).json({
ok:false,
error:"SALON_WITHDRAW_FAILED"
});

}finally{

db.release();

}

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

/* simple timeline reconstruction */
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
