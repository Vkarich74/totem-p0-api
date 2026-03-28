import express from "express";

export default function buildSettlementsRouter(pool){

const r = express.Router();

/* SETTLEMENT ENGINE */
r.post("/settlements/run", async (req,res)=>{

const db = await pool.connect();

try{

await db.query("BEGIN");

const payments = await db.query(`
SELECT
p.id AS payment_id,
p.amount,
b.id AS booking_id,
b.master_id,
b.salon_id
FROM payments p
JOIN bookings b ON b.id=p.booking_id
LEFT JOIN settlement_items si ON si.payment_id=p.id
LEFT JOIN payouts po ON po.booking_id=b.id
WHERE p.status='confirmed'
AND si.id IS NULL
AND po.id IS NULL
ORDER BY p.id ASC
FOR UPDATE OF p SKIP LOCKED
LIMIT 500
`);

if(!payments.rows.length){

await db.query("ROLLBACK");

return res.json({
ok:true,
message:"NO_PAYMENTS_FOR_SETTLEMENT",
payments_processed:0
});

}

const periodCache = new Map();
let paymentsProcessed = 0;

for(const p of payments.rows){

const contract = await db.query(`
SELECT
id,
terms_json
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
throw new Error(`CONTRACT_REQUIRED salon_id=${p.salon_id} master_id=${p.master_id} booking_id=${p.booking_id} payment_id=${p.payment_id}`);
}

const terms = contract.rows[0].terms_json || {};

const masterPercent = parseInt(terms.master_percent || 0,10);
const salonPercent = parseInt(terms.salon_percent || 0,10);
const platformPercent = parseInt(terms.platform_percent || 0,10);

if(masterPercent + salonPercent + platformPercent !== 100){
throw new Error(`INVALID_CONTRACT_SPLIT salon_id=${p.salon_id} master_id=${p.master_id}`);
}

const masterAmount = Math.floor(p.amount * masterPercent / 100);
const salonAmount = Math.floor(p.amount * salonPercent / 100);
const platformAmount = p.amount - masterAmount - salonAmount;

let settlementId = periodCache.get(p.salon_id);

if(!settlementId){

const existingOpenPeriod = await db.query(`
SELECT id
FROM settlement_periods
WHERE salon_id=$1
AND status='open'
AND is_archived=false
ORDER BY id DESC
LIMIT 1
`,[
p.salon_id
]);

if(existingOpenPeriod.rows.length){

settlementId = existingOpenPeriod.rows[0].id;

}else{

const createdPeriod = await db.query(`
INSERT INTO settlement_periods(
period_start,
period_end,
status,
created_at,
salon_id,
is_archived
)
VALUES(
CURRENT_DATE,
CURRENT_DATE,
'open',
NOW(),
$1,
false
)
RETURNING id
`,[
p.salon_id
]);

settlementId = createdPeriod.rows[0].id;

}

periodCache.set(p.salon_id, settlementId);

}

await db.query(`
INSERT INTO settlement_items(
settlement_id,
payment_id,
booking_id,
master_id,
amount_total,
amount_master,
amount_platform,
created_at
)
VALUES($1,$2,$3,$4,$5,$6,$7,NOW())
`,[
settlementId,
p.payment_id,
p.booking_id,
p.master_id,
p.amount,
masterAmount,
platformAmount
]);

const salonWallet = await db.query(`
SELECT id
FROM totem_test.wallets
WHERE owner_type='salon'
AND owner_id=$1
LIMIT 1
`,[
p.salon_id
]);

if(!salonWallet.rows.length){
throw new Error(`SALON_WALLET_NOT_FOUND salon_id=${p.salon_id}`);
}

const masterWallet = await db.query(`
SELECT id
FROM totem_test.wallets
WHERE owner_type='master'
AND owner_id=$1
LIMIT 1
`,[
p.master_id
]);

if(!masterWallet.rows.length){
throw new Error(`MASTER_WALLET_NOT_FOUND master_id=${p.master_id}`);
}

await db.query(`
INSERT INTO payouts(
booking_id,
amount,
status,
created_at,
payment_id,
settlement_period_id,
gross_amount,
take_rate_bps,
platform_fee,
provider_amount
)
VALUES($1,$2,'created',NOW(),$3,$4,$5,$6,$7,$8)
`,[
p.booking_id,
masterAmount,
p.payment_id,
settlementId,
p.amount,
platformPercent * 100,
platformAmount,
masterAmount + salonAmount
]);

paymentsProcessed += 1;

}

await db.query("COMMIT");

res.json({
ok:true,
payments_processed:paymentsProcessed,
settlements_opened:periodCache.size,
settlement_ids:Array.from(periodCache.values())
});

}catch(err){

try{ await db.query("ROLLBACK"); }catch(e){}

console.error("SETTLEMENT_ENGINE_ERROR",err);

res.status(500).json({
ok:false,
error:"SETTLEMENT_ENGINE_FAILED"
});

}finally{

db.release();

}

});

return r;

}
