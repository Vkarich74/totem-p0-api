import express from "express";

export default function buildPayoutsProcessorRouter(pool, getOrCreateSystemWallet){

const r = express.Router();

/* PAYOUT PROCESSOR */
r.post("/payouts/run", async (req,res)=>{

const db = await pool.connect();

try{

await db.query("BEGIN");

const payouts = await db.query(`
SELECT
p.id,
p.booking_id,
p.amount,
b.master_id,
b.salon_id,
b.status as booking_status
FROM payouts p
JOIN bookings b ON b.id=p.booking_id
WHERE p.status='created'
ORDER BY p.id ASC
FOR UPDATE OF p SKIP LOCKED
LIMIT 500
`);

if(!payouts.rows.length){

await db.query("ROLLBACK");

return res.json({
ok:true,
payouts_processed:0,
message:"NO_PAYOUTS"
});

}

let processed = 0;

for(const p of payouts.rows){

/* 🔒 HARD CHECK — BOOKING MUST BE COMPLETED */
if(p.booking_status !== 'completed'){
throw new Error(`INVALID_BOOKING_STATUS booking_id=${p.booking_id} status=${p.booking_status}`);
}

const contract = await db.query(`
SELECT id
FROM contracts
WHERE salon_id=$1
AND master_id=$2
AND status='active'
AND archived_at IS NULL
ORDER BY version DESC, created_at DESC
FOR UPDATE
LIMIT 1
`,[
p.salon_id,
p.master_id
]);

if(!contract.rows.length){
throw new Error(`CONTRACT_REQUIRED salon_id=${p.salon_id} master_id=${p.master_id} booking_id=${p.booking_id} payout_id=${p.id}`);
}

const salonWallet = await db.query(`
SELECT id
FROM totem_test.wallets
WHERE owner_type='salon'
AND owner_id=$1
LIMIT 1
`,[p.salon_id]);

const masterWallet = await db.query(`
SELECT id
FROM totem_test.wallets
WHERE owner_type='master'
AND owner_id=$1
LIMIT 1
`,[p.master_id]);

if(!salonWallet.rows.length){
throw new Error(`SALON_WALLET_NOT_FOUND salon_id=${p.salon_id}`);
}

if(!masterWallet.rows.length){
throw new Error(`MASTER_WALLET_NOT_FOUND master_id=${p.master_id}`);
}

/* exact payout ledger state: same contract as finance/run/full */
await db.query(`
DELETE FROM totem_test.ledger_entries
WHERE reference_type='payout'
AND reference_id=$1
`,[String(p.id)]);

await db.query(`
INSERT INTO totem_test.ledger_entries(
wallet_id,
direction,
amount_cents,
reference_type,
reference_id
)
VALUES
($1,'debit',$3::int,'payout',$4),
($2,'credit',$3::int,'payout',$4)
`,[
salonWallet.rows[0].id,
masterWallet.rows[0].id,
p.amount,
String(p.id)
]);

await db.query(`
UPDATE payouts
SET status='paid'
WHERE id=$1
`,[p.id]);

processed += 1;

}

await db.query("COMMIT");

res.json({
ok:true,
payouts_processed:processed
});

}catch(err){

try{ await db.query("ROLLBACK"); }catch(e){}

console.error("PAYOUT_PROCESSOR_ERROR",err);

res.status(500).json({
ok:false,
error:"PAYOUT_PROCESSOR_FAILED"
});

}finally{

db.release();

}

});

return r;

}