import express from "express";
import crypto from "crypto";
import { pool } from "../db.js";
import { xpayCreateQR, xpayCheckStatus } from "../payments/xpay.js";

export function createInternalRouter(){

const r = express.Router();

/*
GET MASTER BY SLUG
*/
r.get("/masters/:slug", async (req,res)=>{

const { slug } = req.params;

try{

const master = await pool.query(`
SELECT
m.id,
m.name,
m.slug,
m.user_id
FROM masters m
WHERE m.slug=$1
`,[slug]);

if(!master.rows.length){
return res.status(404).json({ok:false,error:"MASTER_NOT_FOUND"});
}

res.json({
ok:true,
master:master.rows[0]
});

}catch(err){

console.error(err);

res.status(500).json({
ok:false,
error:"MASTER_FETCH_FAILED"
});

}

});


/*
MASTER METRICS
*/
r.get("/masters/:slug/metrics", async (req,res)=>{

const { slug } = req.params;

try{

const master = await pool.query(
`SELECT id FROM masters WHERE slug=$1`,
[slug]
);

if(!master.rows.length){
return res.status(404).json({ok:false,error:"MASTER_NOT_FOUND"});
}

const masterId = master.rows[0].id;

const bookingsToday = await pool.query(`
SELECT COUNT(*)::int AS v
FROM bookings
WHERE master_id=$1
AND DATE(start_at)=CURRENT_DATE
`,[masterId]);

const bookingsWeek = await pool.query(`
SELECT COUNT(*)::int AS v
FROM bookings
WHERE master_id=$1
AND start_at >= NOW() - INTERVAL '7 days'
`,[masterId]);

const clientsTotal = await pool.query(`
SELECT COUNT(*)::int AS v
FROM clients
WHERE id IN (
SELECT client_id FROM bookings WHERE master_id=$1
)
`,[masterId]);

res.json({
ok:true,
metrics:{
bookings_today:bookingsToday.rows[0].v,
bookings_week:bookingsWeek.rows[0].v,
clients_total:clientsTotal.rows[0].v
}
});

}catch(err){

console.error("MASTER_METRICS_ERROR",err);

res.status(500).json({
ok:false,
error:"MASTER_METRICS_FAILED"
});

}

});


/*
MASTER BOOKINGS
*/
r.get("/masters/:slug/bookings", async (req,res)=>{

const { slug } = req.params;

try{

const master = await pool.query(
`SELECT id FROM masters WHERE slug=$1`,
[slug]
);

if(!master.rows.length){
return res.status(404).json({ok:false,error:"MASTER_NOT_FOUND"});
}

const masterId = master.rows[0].id;

const bookings = await pool.query(`
SELECT
b.id,
b.status,
b.start_at,
b.end_at,
c.name AS client_name,
c.phone
FROM bookings b
LEFT JOIN clients c ON c.id=b.client_id
WHERE b.master_id=$1
ORDER BY b.start_at DESC
`,[masterId]);

res.json({
ok:true,
bookings:bookings.rows
});

}catch(err){

console.error("MASTER_BOOKINGS_ERROR", err);

res.status(500).json({
ok:false,
error:"MASTER_BOOKINGS_FETCH_FAILED"
});

}

});


/*
MASTER CLIENTS
*/
r.get("/masters/:slug/clients", async (req,res)=>{

const { slug } = req.params;

try{

const master = await pool.query(
`SELECT id FROM masters WHERE slug=$1`,
[slug]
);

if(!master.rows.length){
return res.status(404).json({ok:false,error:"MASTER_NOT_FOUND"});
}

const masterId = master.rows[0].id;

const clients = await pool.query(`
SELECT DISTINCT
c.id,
c.name,
c.phone
FROM clients c
JOIN bookings b ON b.client_id=c.id
WHERE b.master_id=$1
ORDER BY c.id DESC
`,[masterId]);

res.json({
ok:true,
clients:clients.rows
});

}catch(err){

console.error("MASTER_CLIENTS_ERROR",err);

res.status(500).json({
ok:false,
error:"MASTER_CLIENTS_FETCH_FAILED"
});

}

});


/*
MASTER QUICK BOOKING CREATE
*/
r.post("/masters/:slug/bookings", async (req,res)=>{

const { slug } = req.params;
const { client_name, phone, start_at, service_id } = req.body;

const db = await pool.connect();

try{

await db.query("BEGIN");

if(!start_at){
await db.query("ROLLBACK");
return res.status(400).json({ok:false,error:"START_AT_REQUIRED"});
}

if(!service_id){
await db.query("ROLLBACK");
return res.status(400).json({ok:false,error:"SERVICE_ID_REQUIRED"});
}

const start = new Date(start_at);

if(Number.isNaN(start.getTime())){
await db.query("ROLLBACK");
return res.status(400).json({ok:false,error:"INVALID_START_AT"});
}

const master = await db.query(
`SELECT id FROM masters WHERE slug=$1`,
[slug]
);

if(!master.rows.length){
await db.query("ROLLBACK");
return res.status(404).json({ok:false,error:"MASTER_NOT_FOUND"});
}

const masterId = master.rows[0].id;

const serviceLink = await db.query(`
SELECT sms.salon_id, s.slug
FROM salon_master_services sms
JOIN salons s ON s.id=sms.salon_id
WHERE sms.master_id=$1
AND sms.service_pk=$2
AND sms.active=true
LIMIT 1
`,[
masterId,
service_id
]);

if(!serviceLink.rows.length){
await db.query("ROLLBACK");
return res.status(400).json({ok:false,error:"SERVICE_INACTIVE"});
}

const salonId = serviceLink.rows[0].salon_id;
const salonSlug = serviceLink.rows[0].slug;

const safeName = String(client_name || "").trim() || "client";
const safePhone = String(phone || "").trim() || null;

let clientId = null;

if(safePhone){

const existingClient = await db.query(
`SELECT id
FROM clients
WHERE salon_id=$1 AND phone=$2
LIMIT 1`,
[salonId, safePhone]
);

if(existingClient.rows.length){
clientId = existingClient.rows[0].id;
}

}

if(!clientId){

const createdClient = await db.query(`
INSERT INTO clients(
salon_id,
name,
phone
)
VALUES($1,$2,$3)
RETURNING id
`,[
salonId,
safeName,
safePhone
]);

clientId = createdClient.rows[0].id;

}

const end = new Date(start.getTime() + 30 * 60000);

let slotId = null;

const existingSlot = await db.query(`
SELECT id
FROM calendar_slots
WHERE master_id=$1
AND start_at=$2
AND end_at=$3
LIMIT 1
`,[
masterId,
start,
end
]);

if(existingSlot.rows.length){

slotId = existingSlot.rows[0].id;

const existingBooking = await db.query(`
SELECT id
FROM bookings
WHERE calendar_slot_id=$1
LIMIT 1
`,[slotId]);

if(existingBooking.rows.length){

await db.query("ROLLBACK");

return res.status(409).json({
ok:false,
error:"BOOKING_ALREADY_EXISTS_FOR_SLOT",
slot_id:slotId
});

}

}else{

const slot = await db.query(`
INSERT INTO calendar_slots(
salon_id,
master_id,
start_at,
end_at,
status,
request_id
)
VALUES($1,$2,$3,$4,'reserved',$5)
RETURNING id
`,[
salonId,
masterId,
start,
end,
crypto.randomUUID()
]);

slotId = slot.rows[0].id;

}

const requestId = crypto.randomUUID();

const booking = await db.query(`
INSERT INTO bookings(
salon_id,
salon_slug,
master_id,
start_at,
end_at,
status,
request_id,
calendar_slot_id,
client_id,
service_id,
price_snapshot
)
VALUES($1,$2,$3,$4,$5,'reserved',$6,$7,$8,$9,$10)
RETURNING *
`,[
salonId,
salonSlug,
masterId,
start,
end,
requestId,
slotId,
clientId,
service_id,
null
]);

await db.query("COMMIT");

res.json({
ok:true,
booking:booking.rows[0]
});

}catch(err){

try{ await db.query("ROLLBACK"); }catch(e){}

console.error("BOOKING_ENGINE_ERROR",err);

res.status(500).json({
ok:false,
error:"BOOKING_CREATE_FAILED"
});

}finally{

db.release();

}

});


/* SALON ROOT */
r.get("/salons/:slug", async (req,res)=>{

const { slug } = req.params;

try{

const salon = await pool.query(
`SELECT id,name,slug FROM salons WHERE slug=$1`,
[slug]
);

if(!salon.rows.length){
return res.status(404).json({ok:false,error:"SALON_NOT_FOUND"});
}

res.json({
ok:true,
salon:salon.rows[0]
});

}catch(err){

console.error("SALON_FETCH_ERROR",err);

res.status(500).json({
ok:false,
error:"SALON_FETCH_FAILED"
});

}

});


/* SALON MASTERS */
r.get("/salons/:slug/masters", async (req,res)=>{

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

const masters = await pool.query(`
SELECT m.id,m.name,m.slug
FROM masters m
JOIN master_salon ms ON ms.master_id=m.id
WHERE ms.salon_id=$1
`,[salonId]);

res.json({
ok:true,
masters:masters.rows
});

}catch(err){

console.error("SALON_MASTERS_ERROR",err);

res.status(500).json({
ok:false,
error:"SALON_MASTERS_FETCH_FAILED"
});

}

});


/* SALON CLIENTS */
r.get("/salons/:slug/clients", async (req,res)=>{

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

const clients = await pool.query(`
SELECT id,name,phone
FROM clients
WHERE salon_id=$1
ORDER BY id DESC
`,[salonId]);

res.json({
ok:true,
clients:clients.rows
});

}catch(err){

console.error("SALON_CLIENTS_ERROR",err);

res.status(500).json({
ok:false,
error:"SALON_CLIENTS_FETCH_FAILED"
});

}

});


/* SALON BOOKINGS */
r.get("/salons/:slug/bookings", async (req,res)=>{

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

const bookings = await pool.query(`
SELECT
b.id,
b.start_at,
b.status,
c.name,
c.phone
FROM bookings b
LEFT JOIN clients c ON c.id=b.client_id
WHERE b.salon_id=$1
ORDER BY b.start_at DESC
`,[salonId]);

res.json({
ok:true,
bookings:bookings.rows
});

}catch(err){

console.error("SALON_BOOKINGS_ERROR",err);

res.status(500).json({
ok:false,
error:"SALON_BOOKINGS_FETCH_FAILED"
});

}

});


/* SALON METRICS */
r.get("/salons/:slug/metrics", async (req,res)=>{

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

const bookingsToday = await pool.query(`
SELECT COUNT(*)::int AS v
FROM bookings
WHERE salon_id=$1
AND DATE(start_at)=CURRENT_DATE
`,[salonId]);

const revenueToday = await pool.query(`
SELECT COALESCE(SUM(p.amount),0)::int AS v
FROM payments p
JOIN bookings b ON b.id=p.booking_id
WHERE b.salon_id=$1
AND DATE(p.created_at)=CURRENT_DATE
`,[salonId]);

const revenueMonth = await pool.query(`
SELECT COALESCE(SUM(p.amount),0)::int AS v
FROM payments p
JOIN bookings b ON b.id=p.booking_id
WHERE b.salon_id=$1
AND DATE_TRUNC('month', p.created_at)=DATE_TRUNC('month', NOW())
`,[salonId]);

const paymentsTotal = await pool.query(`
SELECT COUNT(*)::int AS v
FROM payments p
JOIN bookings b ON b.id=p.booking_id
WHERE b.salon_id=$1
`,[salonId]);

res.json({
ok:true,
metrics:{
bookings_today:bookingsToday.rows[0].v,
revenue_today:revenueToday.rows[0].v,
revenue_month:revenueMonth.rows[0].v,
payments_total:paymentsTotal.rows[0].v
}
});

}catch(err){

console.error("SALON_METRICS_ERROR", err);

res.status(500).json({
ok:false,
error:"SALON_METRICS_FAILED"
});

}

});


/* SALON PAYMENTS (FIXED) */
r.get("/salons/:slug/payments", async (req,res)=>{

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

const payments = await pool.query(`
SELECT
p.id,
p.amount,
p.provider,
p.status,
p.created_at,
c.name AS client_name
FROM payments p
JOIN bookings b ON b.id=p.booking_id
LEFT JOIN clients c ON c.id=b.client_id
WHERE b.salon_id=$1
ORDER BY p.created_at DESC
LIMIT 100
`,[salonId]);

res.json({
ok:true,
payments:payments.rows
});

}catch(err){

console.error("SALON_PAYMENTS_ERROR",err);

res.status(500).json({
ok:false,
error:"SALON_PAYMENTS_FETCH_FAILED"
});

}

});


/* SALON SETTLEMENTS */
r.get("/salons/:slug/settlements", async (req,res)=>{

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

const settlements = await pool.query(`
SELECT
sp.id,
sp.period_start,
sp.period_end,
sp.status,
sp.closed_at,
sp.created_at
FROM settlement_periods sp
WHERE sp.salon_id=$1
AND sp.is_archived=false
ORDER BY sp.period_start DESC
LIMIT 50
`,[salonId]);

res.json({
ok:true,
settlements:settlements.rows
});

}catch(err){

console.error("SALON_SETTLEMENTS_ERROR",err);

res.status(500).json({
ok:false,
error:"SALON_SETTLEMENTS_FETCH_FAILED"
});

}

});


/* SALON PAYOUTS */
r.get("/salons/:slug/payouts", async (req,res)=>{

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

const payouts = await pool.query(`
SELECT
p.id,
p.amount,
p.status,
p.created_at
FROM payouts p
JOIN bookings b ON b.id=p.booking_id
WHERE b.salon_id=$1
ORDER BY p.created_at DESC
LIMIT 50
`,[salonId]);

res.json({
ok:true,
payouts:payouts.rows
});

}catch(err){

console.error("SALON_PAYOUTS_ERROR",err);

res.status(500).json({
ok:false,
error:"SALON_PAYOUTS_FETCH_FAILED"
});

}

});


/* SALON WALLET */
r.get("/salons/:slug/wallet", async (req,res)=>{

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

const wallet = await pool.query(`
SELECT
w.id,
w.owner_type,
w.owner_id,
w.currency,
w.created_at
FROM totem_test.wallets w
WHERE w.owner_type='salon'
AND w.owner_id=$1
LIMIT 1
`,[salonId]);

res.json({
ok:true,
wallet:wallet.rows[0] || null
});

}catch(err){

console.error("SALON_WALLET_ERROR",err);

res.status(500).json({
ok:false,
error:"SALON_WALLET_FETCH_FAILED"
});

}

});


/* SALON WALLET BALANCE */
r.get("/salons/:slug/wallet-balance", async (req,res)=>{

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

const balance = await pool.query(`
SELECT
w.id AS wallet_id,
w.owner_type,
w.owner_id,
w.currency,
COALESCE(v.computed_balance_cents,0)::int AS balance
FROM totem_test.wallets w
LEFT JOIN totem_test.v_wallet_balance_computed v ON v.wallet_id=w.id
WHERE w.owner_type='salon'
AND w.owner_id=$1
LIMIT 1
`,[salonId]);

res.json({
ok:true,
wallet_id: balance.rows[0]?.wallet_id || null,
balance: balance.rows[0]?.balance || 0,
currency: balance.rows[0]?.currency || "KGS"
});

}catch(err){

console.error("SALON_WALLET_BALANCE_ERROR",err);

res.status(500).json({
ok:false,
error:"SALON_WALLET_BALANCE_FETCH_FAILED"
});

}

});


/* SALON LEDGER */
r.get("/salons/:slug/ledger", async (req,res)=>{

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

const ledger = await pool.query(`
SELECT
le.id,
le.wallet_id,
le.direction,
COALESCE(le.amount_cents,0)::int AS amount,
le.reference_type,
le.reference_id,
le.created_at
FROM totem_test.ledger_entries le
JOIN totem_test.wallets w ON w.id=le.wallet_id
WHERE w.owner_type='salon'
AND w.owner_id=$1
ORDER BY le.created_at DESC
LIMIT 100
`,[salonId]);

res.json({
ok:true,
ledger:ledger.rows
});

}catch(err){

console.error("SALON_LEDGER_FETCH_ERROR",err);

res.status(500).json({
ok:false,
error:"SALON_LEDGER_FETCH_FAILED"
});

}

});


/* SALON WITHDRAWS */
r.get("/salons/:slug/withdraws", async (req,res)=>{

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

const withdraws = await pool.query(`
SELECT
w.id,
w.owner_type,
w.owner_id,
w.wallet_id,
w.amount,
w.status,
w.destination,
w.external_ref,
w.created_at,
w.updated_at
FROM public.withdraws w
WHERE w.owner_type='salon'
AND w.owner_id=$1
ORDER BY w.created_at DESC
LIMIT 100
`,[salonId]);

res.json({
ok:true,
withdraws:withdraws.rows
});

}catch(err){

console.error("SALON_WITHDRAWS_FETCH_ERROR",err);

res.status(500).json({
ok:false,
error:"SALON_WITHDRAWS_FETCH_FAILED"
});

}

});


/* PAYMENT FLOW */
r.post("/payments/flow", async (req,res)=>{

const { booking_id, service_price } = req.body;

const db = await pool.connect();

try{

await db.query("BEGIN");

const amount = parseInt(service_price,10);
const amountCents = amount;

if(!booking_id || !service_price || Number.isNaN(amount)){
await db.query("ROLLBACK");
return res.status(400).json({ok:false,error:"INVALID_INPUT"});
}

const bookingCheck = await db.query(`
SELECT
b.id,
b.salon_id
FROM bookings b
WHERE b.id=$1
LIMIT 1
`,[
booking_id
]);

if(!bookingCheck.rows.length){
await db.query("ROLLBACK");
return res.status(404).json({ok:false,error:"BOOKING_NOT_FOUND"});
}

const salonId = bookingCheck.rows[0].salon_id;

const activePayment = await db.query(`
SELECT id
FROM payments
WHERE booking_id=$1
AND is_active=true
LIMIT 1
`,[
booking_id
]);

if(activePayment.rows.length){
await db.query("ROLLBACK");
return res.status(409).json({
ok:false,
error:"ACTIVE_PAYMENT_EXISTS",
payment_id:activePayment.rows[0].id
});
}

const payment = await db.query(`
INSERT INTO payments(
booking_id,
provider,
amount,
status,
is_active
)
VALUES($1,'direct',$2,'confirmed',true)
RETURNING id,booking_id,amount,status,provider,created_at
`,[
booking_id,
amount
]);

const paymentId = payment.rows[0].id;

const wallet = await db.query(`
SELECT
w.id
FROM totem_test.wallets w
WHERE w.owner_type='salon'
AND w.owner_id=$1
LIMIT 1
`,[
salonId
]);

if(!wallet.rows.length){
await db.query("ROLLBACK");
return res.status(400).json({ok:false,error:"SALON_WALLET_NOT_FOUND"});
}

const salonWallet = wallet.rows[0].id;

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
VALUES($1,'debit',$2,'payment',$3)
`,[
systemWalletId,
amountCents,
String(paymentId)
]);

await db.query(`
INSERT INTO totem_test.ledger_entries(
wallet_id,
direction,
amount_cents,
reference_type,
reference_id
)
VALUES($1,'credit',$2,'payment',$3)
`,[
salonWallet,
amountCents,
String(paymentId)
]);

await db.query("COMMIT");

res.json({
ok:true,
payment:payment.rows[0]
});

}catch(err){

try{ await db.query("ROLLBACK"); }catch(e){}

console.error("PAYMENT_FLOW_ERROR",err);

res.status(500).json({
ok:false,
error:"PAYMENT_FLOW_FAILED"
});

}finally{

db.release();

}

});


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
LIMIT 500
FOR UPDATE OF p SKIP LOCKED
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
LIMIT 1
FOR UPDATE
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

const payout = await db.query(`
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
RETURNING id
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

const payoutId = payout.rows[0].id;

await db.query(`
INSERT INTO totem_test.ledger_entries(
wallet_id,
direction,
amount_cents,
reference_type,
reference_id
)
VALUES($1,'debit',$2,'payout',$3)
`,[
salonWallet.rows[0].id,
masterAmount,
String(payoutId)
]);

await db.query(`
INSERT INTO totem_test.ledger_entries(
wallet_id,
direction,
amount_cents,
reference_type,
reference_id
)
VALUES($1,'credit',$2,'payout',$3)
`,[
masterWallet.rows[0].id,
masterAmount,
String(payoutId)
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


/* PLATFORM FINANCE REPORT */
r.get("/reports/platform/finance", async (req,res)=>{

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
r.get("/reports/platform/ledger", async (req,res)=>{

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
r.get("/reports/platform/reconciliation", async (req,res)=>{

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


/*
MASTER WALLET
*/
r.get("/masters/:slug/wallet", async (req,res)=>{

const { slug } = req.params;

try{

const master = await pool.query(
`SELECT id FROM masters WHERE slug=$1`,
[slug]
);

if(!master.rows.length){
return res.status(404).json({ok:false,error:"MASTER_NOT_FOUND"});
}

const masterId = master.rows[0].id;

const wallet = await pool.query(`
SELECT
w.id,
w.owner_type,
w.owner_id,
w.currency,
w.created_at
FROM totem_test.wallets w
WHERE w.owner_type='master'
AND w.owner_id=$1
LIMIT 1
`,[masterId]);

res.json({
ok:true,
wallet:wallet.rows[0] || null
});

}catch(err){

console.error("MASTER_WALLET_ERROR",err);

res.status(500).json({
ok:false,
error:"MASTER_WALLET_FETCH_FAILED"
});

}

});


/*
MASTER WALLET BALANCE
*/
r.get("/masters/:slug/wallet-balance", async (req,res)=>{

const { slug } = req.params;

try{

const master = await pool.query(
`SELECT id FROM masters WHERE slug=$1`,
[slug]
);

if(!master.rows.length){
return res.status(404).json({ok:false,error:"MASTER_NOT_FOUND"});
}

const masterId = master.rows[0].id;

const balance = await pool.query(`
SELECT
w.id AS wallet_id,
w.owner_type,
w.owner_id,
w.currency,
COALESCE(v.computed_balance_cents,0)::int AS balance
FROM totem_test.wallets w
LEFT JOIN totem_test.v_wallet_balance_computed v
ON v.wallet_id=w.id
WHERE w.owner_type='master'
AND w.owner_id=$1
LIMIT 1
`,[masterId]);

res.json({
ok:true,
wallet_id: balance.rows[0]?.wallet_id || null,
balance: balance.rows[0]?.balance || 0,
currency: balance.rows[0]?.currency || "KGS"
});

}catch(err){

console.error("MASTER_WALLET_BALANCE_ERROR",err);

res.status(500).json({
ok:false,
error:"MASTER_WALLET_BALANCE_FETCH_FAILED"
});

}

});


/*
MASTER LEDGER
*/
r.get("/masters/:slug/ledger", async (req,res)=>{

const { slug } = req.params;

try{

const master = await pool.query(
`SELECT id FROM masters WHERE slug=$1`,
[slug]
);

if(!master.rows.length){
return res.status(404).json({ok:false,error:"MASTER_NOT_FOUND"});
}

const masterId = master.rows[0].id;

const ledger = await pool.query(`
SELECT
le.id,
le.wallet_id,
le.direction,
COALESCE(le.amount_cents,0)::int AS amount,
le.reference_type,
le.reference_id,
le.created_at
FROM totem_test.ledger_entries le
JOIN totem_test.wallets w ON w.id=le.wallet_id
WHERE w.owner_type='master'
AND w.owner_id=$1
ORDER BY le.created_at DESC
LIMIT 100
`,[masterId]);

res.json({
ok:true,
ledger:ledger.rows
});

}catch(err){

console.error("MASTER_LEDGER_FETCH_ERROR",err);

res.status(500).json({
ok:false,
error:"MASTER_LEDGER_FETCH_FAILED"
});

}

});


/*
MASTER SETTLEMENTS
*/
r.get("/masters/:slug/settlements", async (req,res)=>{

const { slug } = req.params;

try{

const master = await pool.query(
`SELECT id FROM masters WHERE slug=$1`,
[slug]
);

if(!master.rows.length){
return res.status(404).json({ok:false,error:"MASTER_NOT_FOUND"});
}

const masterId = master.rows[0].id;

const settlements = await pool.query(`
SELECT
sp.id,
sp.period_start AS start_date,
sp.period_end AS end_date,
sp.status,
sp.created_at,
SUM(si.amount_master)::int AS amount,
COUNT(si.id)::int AS items
FROM settlement_periods sp
JOIN settlement_items si ON si.settlement_id=sp.id
WHERE si.master_id=$1
GROUP BY sp.id
ORDER BY sp.period_start DESC
LIMIT 50
`,[masterId]);

res.json({
ok:true,
periods:settlements.rows
});

}catch(err){

console.error("MASTER_SETTLEMENTS_ERROR",err);

res.status(500).json({
ok:false,
error:"MASTER_SETTLEMENTS_FETCH_FAILED"
});

}

});

/*
MASTER PAYOUTS
*/
r.get("/masters/:slug/payouts", async (req,res)=>{

const { slug } = req.params;

try{

const master = await pool.query(
`SELECT id FROM masters WHERE slug=$1`,
[slug]
);

if(!master.rows.length){
return res.status(404).json({ok:false,error:"MASTER_NOT_FOUND"});
}

const masterId = master.rows[0].id;

const payouts = await pool.query(`
SELECT
p.id,
p.amount,
p.status,
p.created_at
FROM payouts p
JOIN bookings b ON b.id=p.booking_id
WHERE b.master_id=$1
ORDER BY p.created_at DESC
LIMIT 50
`,[masterId]);

res.json({
ok:true,
payouts:payouts.rows
});

}catch(err){

console.error("MASTER_PAYOUTS_ERROR",err);

res.status(500).json({
ok:false,
error:"MASTER_PAYOUTS_FETCH_FAILED"
});

}

});

/*
ARCHITECTURE CONTRACT (CRITICAL)

Payout ledger is written ONLY by backend (this processor).
Withdraw ledger is written ONLY by backend withdraw routes/processors.

Database trigger:
trg_bridge_payout_paid_to_wallet_ledger
MUST remain DISABLED.

Reason:
Prevent duplicate ledger entries (double-write conflict)
which breaks enforce_ledger_double_entry_row() invariant.

If this trigger is enabled -> system will break.

DO NOT CHANGE WITHOUT FULL FINANCE REFACTOR.
*/

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
b.salon_id
FROM payouts p
JOIN bookings b ON b.id=p.booking_id
WHERE p.status='created'
ORDER BY p.id ASC
LIMIT 500
FOR UPDATE OF p SKIP LOCKED
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

const contract = await db.query(`
SELECT id
FROM contracts
WHERE salon_id=$1
AND master_id=$2
AND status='active'
AND archived_at IS NULL
ORDER BY version DESC, created_at DESC
LIMIT 1
FOR UPDATE
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

/* force exact payout ledger state */
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
($1,'debit',$3,'payout',$5),
($2,'credit',$4,'payout',$5)
`,[
salonWallet.rows[0].id,
masterWallet.rows[0].id,
p.amount,
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


/* WITHDRAW PROCESSOR */
r.post("/withdraws/run", async (req,res)=>{

const db = await pool.connect();

try{

await db.query("BEGIN");

const withdraws = await db.query(`
SELECT
w.id,
w.owner_type,
w.owner_id,
w.wallet_id,
w.amount,
w.destination,
w.external_ref,
w.status
FROM public.withdraws w
WHERE w.status='pending'
ORDER BY w.created_at ASC
LIMIT 500
FOR UPDATE SKIP LOCKED
`);

if(!withdraws.rows.length){
await db.query("ROLLBACK");
return res.json({
ok:true,
withdraws_processed:0,
message:"NO_WITHDRAWS"
});
}

let processed = 0;
const withdrawIds = [];

for(const w of withdraws.rows){

await db.query(`
UPDATE public.withdraws
SET status='processing',
updated_at=NOW()
WHERE id=$1
AND status='pending'
`,[w.id]);

processed += 1;
withdrawIds.push(w.id);

}

await db.query("COMMIT");

res.json({
ok:true,
withdraws_processed:processed,
withdraw_ids:withdrawIds
});

}catch(err){

try{ await db.query("ROLLBACK"); }catch(e){}

console.error("WITHDRAW_PROCESSOR_ERROR",err);

res.status(500).json({
ok:false,
error:"WITHDRAW_PROCESSOR_FAILED"
});

}finally{

db.release();

}

});

/* WITHDRAW COMPLETE */
r.post("/withdraws/:id/complete", async (req,res)=>{

const { id } = req.params;
const { external_ref } = req.body;
const db = await pool.connect();

try{

await db.query("BEGIN");

const withdraw = await db.query(`
SELECT
id,
status,
external_ref
FROM public.withdraws
WHERE id=$1
LIMIT 1
FOR UPDATE
`,[id]);

if(!withdraw.rows.length){
await db.query("ROLLBACK");
return res.status(404).json({ok:false,error:"WITHDRAW_NOT_FOUND"});
}

if(withdraw.rows[0].status !== 'processing'){
await db.query("ROLLBACK");
return res.status(409).json({
ok:false,
error:"WITHDRAW_STATUS_INVALID",
status:withdraw.rows[0].status
});
}

const finalExternalRef = String(external_ref || withdraw.rows[0].external_ref || `withdraw-${id}`).trim();

const completed = await db.query(`
UPDATE public.withdraws
SET status='completed',
external_ref=$2,
updated_at=NOW()
WHERE id=$1
AND status='processing'
RETURNING *
`,[
id,
finalExternalRef
]);

await db.query("COMMIT");

return res.json({
ok:true,
withdraw:completed.rows[0]
});

}catch(err){

try{ await db.query("ROLLBACK"); }catch(e){}

console.error("WITHDRAW_COMPLETE_ERROR",err);

return res.status(500).json({
ok:false,
error:"WITHDRAW_COMPLETE_FAILED"
});

}finally{

db.release();

}

});

/* WITHDRAW FAIL */
r.post("/withdraws/:id/fail", async (req,res)=>{

const { id } = req.params;
const { external_ref } = req.body;
const db = await pool.connect();

try{

await db.query("BEGIN");

const withdraw = await db.query(`
SELECT
id,
status,
external_ref
FROM public.withdraws
WHERE id=$1
LIMIT 1
FOR UPDATE
`,[id]);

if(!withdraw.rows.length){
await db.query("ROLLBACK");
return res.status(404).json({ok:false,error:"WITHDRAW_NOT_FOUND"});
}

if(withdraw.rows[0].status !== 'processing'){
await db.query("ROLLBACK");
return res.status(409).json({
ok:false,
error:"WITHDRAW_STATUS_INVALID",
status:withdraw.rows[0].status
});
}

const finalExternalRef = String(external_ref || withdraw.rows[0].external_ref || '').trim() || null;

const failed = await db.query(`
UPDATE public.withdraws
SET status='failed',
external_ref=$2,
updated_at=NOW()
WHERE id=$1
RETURNING *
`,[
id,
finalExternalRef
]);

await db.query("COMMIT");

return res.json({
ok:true,
withdraw:failed.rows[0]
});

}catch(err){

try{ await db.query("ROLLBACK"); }catch(e){}

console.error("WITHDRAW_FAIL_ERROR",err);

return res.status(500).json({
ok:false,
error:"WITHDRAW_FAIL_FAILED"
});

}finally{

db.release();

}

});


/* AUTO FINANCE ENGINE */
r.post("/finance/run", async (req,res)=>{

const db = await pool.connect();

try{

await db.query("BEGIN");

/* run settlements */
const settlements = await db.query(`
SELECT COUNT(*)::int AS v
FROM payments p
LEFT JOIN settlement_items si ON si.payment_id=p.id
WHERE p.status='confirmed'
AND si.id IS NULL
`);

const withdraws = await db.query(`
SELECT COUNT(*)::int AS v
FROM public.withdraws
WHERE status='pending'
`);

await db.query("COMMIT");

res.json({
ok:true,
message:"FINANCE_RUN_COMPLETED",
pending_settlements:settlements.rows[0].v,
pending_withdraws:withdraws.rows[0].v
});

}catch(err){

try{ await db.query("ROLLBACK"); }catch(e){}

console.error("FINANCE_ENGINE_ERROR",err);

res.status(500).json({
ok:false,
error:"FINANCE_ENGINE_FAILED"
});

}finally{

db.release();

}

});

/* ============================= */
/* CONTRACT ENGINE               */
/* ============================= */

/* CREATE CONTRACT */
r.post("/contracts", async (req,res)=>{

const {
salon_id,
master_id,
terms_json,
effective_from
} = req.body;

try{

if(!salon_id || !master_id){
return res.status(400).json({ok:false,error:"INVALID_CONTRACT_INPUT"});
}

const existing = await pool.query(`
SELECT id
FROM contracts
WHERE salon_id=$1
AND master_id=$2
AND status='active'
LIMIT 1
`,[
salon_id,
master_id
]);

if(existing.rows.length){
return res.status(409).json({
ok:false,
error:"ACTIVE_CONTRACT_EXISTS",
contract_id:existing.rows[0].id
});
}

const contract = await pool.query(`
INSERT INTO contracts(
salon_id,
master_id,
status,
version,
terms_json,
effective_from,
created_at
)
VALUES(
$1,$2,'pending',1,$3,$4,NOW()
)
RETURNING *
`,[
salon_id,
master_id,
terms_json || {},
effective_from || new Date()
]);

res.json({
ok:true,
contract:contract.rows[0]
});

}catch(err){

console.error("CONTRACT_CREATE_ERROR",err);

res.status(500).json({
ok:false,
error:"CONTRACT_CREATE_FAILED"
});

}

});


/* SALON CONTRACTS (ALIAS FOR UI) */
r.get("/salons/:slug/contracts", async (req,res)=>{

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

const contracts = await pool.query(`
SELECT
c.id,
c.master_id,
COALESCE(m.slug, c.master_id::text) AS master_slug,
c.status,
c.version,
c.terms_json,
COALESCE((c.terms_json->>'master_percent')::int, 0) AS share_percent,
c.created_at
FROM contracts c
LEFT JOIN masters m ON m.id::text = c.master_id::text
WHERE c.salon_id=$1
ORDER BY c.created_at DESC
`,[salonId]);

res.json({
ok:true,
contracts:contracts.rows
});

}catch(err){

console.error("SALON_CONTRACTS_FETCH_ERROR",err);

res.status(500).json({
ok:false,
error:"SALON_CONTRACTS_FETCH_FAILED"
});

}

});

/* CREATE CONTRACT FROM SALON SLUG (CABINET API) */
r.post("/salons/:slug/contracts", async (req,res)=>{

const { slug } = req.params;

const {
master_id,
terms_json,
effective_from
} = req.body;

try{

const salon = await pool.query(
`SELECT id FROM salons WHERE slug=$1`,
[slug]
);

if(!salon.rows.length){
return res.status(404).json({ok:false,error:"SALON_NOT_FOUND"});
}

const salonId = salon.rows[0].id;

if(!master_id){
return res.status(400).json({ok:false,error:"MASTER_ID_REQUIRED"});
}

const existing = await pool.query(`
SELECT id
FROM contracts
WHERE salon_id=$1
AND master_id=$2
AND status='active'
LIMIT 1
`,[
salonId,
master_id
]);

if(existing.rows.length){
return res.status(409).json({
ok:false,
error:"ACTIVE_CONTRACT_EXISTS",
contract_id:existing.rows[0].id
});
}

const contract = await pool.query(`
INSERT INTO contracts(
salon_id,
master_id,
status,
version,
terms_json,
effective_from,
created_at
)
VALUES(
$1,$2,'pending',1,$3,$4,NOW()
)
RETURNING *
`,[
salonId,
master_id,
terms_json || {},
effective_from || new Date()
]);

res.json({
ok:true,
contract:contract.rows[0]
});

}catch(err){

console.error("SALON_CONTRACT_CREATE_ERROR",err);

res.status(500).json({
ok:false,
error:"SALON_CONTRACT_CREATE_FAILED"
});

}

});


/* CONTRACTS BY MASTER */
r.get("/contracts/master/:slug", async (req,res)=>{

const { slug } = req.params;

try{

const master = await pool.query(
`SELECT id FROM masters WHERE slug=$1`,
[slug]
);

if(!master.rows.length){
return res.status(404).json({ok:false,error:"MASTER_NOT_FOUND"});
}

const masterId = master.rows[0].id;

const contracts = await pool.query(`
SELECT *
FROM contracts
WHERE master_id=$1
AND archived_at IS NULL
ORDER BY created_at DESC
`,[masterId]);

res.json({
ok:true,
contracts:contracts.rows
});

}catch(err){

console.error("CONTRACTS_FETCH_MASTER_ERROR",err);

res.status(500).json({
ok:false,
error:"CONTRACTS_FETCH_FAILED"
});

}

});


/* ACCEPT CONTRACT */
r.post("/contracts/:id/accept", async (req,res)=>{

const { id } = req.params;
const db = await pool.connect();

try{

await db.query("BEGIN");

const contract = await db.query(`
SELECT *
FROM contracts
WHERE id=$1
LIMIT 1
FOR UPDATE
`,[id]);

if(!contract.rows.length){
await db.query("ROLLBACK");
return res.status(404).json({ok:false,error:"CONTRACT_NOT_FOUND"});
}

const salonId = contract.rows[0].salon_id;
const masterId = contract.rows[0].master_id;

/* deactivate previous active contract */

await db.query(`
UPDATE contracts
SET status='archived',
archived_at=NOW()
WHERE salon_id=$1
AND master_id=$2
AND status='active'
AND id<>$3
`,[
salonId,
masterId,
id
]);

/* activate new contract */

const activated = await db.query(`
UPDATE contracts
SET status='active',
archived_at=NULL
WHERE id=$1
RETURNING *
`,[id]);

await db.query("COMMIT");

res.json({
ok:true,
contract:activated.rows[0]
});

}catch(err){

try{ await db.query("ROLLBACK"); }catch(e){}

console.error("CONTRACT_ACCEPT_ERROR",err);

res.status(500).json({
ok:false,
error:"CONTRACT_ACCEPT_FAILED"
});

}finally{

db.release();

}

});


/* ARCHIVE CONTRACT */
r.post("/contracts/:id/archive", async (req,res)=>{

const { id } = req.params;

try{

const contract = await pool.query(`
UPDATE contracts
SET status='archived',
archived_at=NOW()
WHERE id=$1
RETURNING *
`,[id]);

if(!contract.rows.length){
return res.status(404).json({ok:false,error:"CONTRACT_NOT_FOUND"});
}

res.json({
ok:true,
contract:contract.rows[0]
});

}catch(err){

console.error("CONTRACT_ARCHIVE_ERROR",err);

res.status(500).json({
ok:false,
error:"CONTRACT_ARCHIVE_FAILED"
});

}

});

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


/* ============================= */
/* XPAY QR ENGINE                */
/* ============================= */

r.post("/payments/xpay/create", async (req,res)=>{

const { booking_id, amount } = req.body;
const amountValue = parseInt(amount,10);

try{

if(!booking_id || !amount){
return res.status(400).json({ok:false,error:"INVALID_INPUT"});
}

const booking = await pool.query(`
SELECT id
FROM bookings
WHERE id=$1
`,[booking_id]);

if(!booking.rows.length){
return res.status(404).json({ok:false,error:"BOOKING_NOT_FOUND"});
}

const payment = await pool.query(`
INSERT INTO payments(
booking_id,
provider,
amount,
status,
is_active
)
VALUES($1,'xpay',$2,'pending',true)
RETURNING id
`,[
booking_id,
amountValue
]);

const paymentId = payment.rows[0].id;

const qr = await xpayCreateQR({
payment_id:paymentId,
amount:amountValue
});

res.json({
ok:true,
payment_id:paymentId,
transaction_id:qr.transaction_id,
qr_code:qr.qr_code,
qr_image:qr.qr_image
});

}catch(err){

console.error("XPAY_CREATE_ERROR",err);

res.status(500).json({
ok:false,
error:"XPAY_CREATE_FAILED"
});

}

});


r.post("/payments/xpay/status", async (req,res)=>{

const { transaction_id } = req.body;

try{

if(!transaction_id){
return res.status(400).json({ok:false,error:"TRANSACTION_ID_REQUIRED"});
}

const status = await xpayCheckStatus(transaction_id);

res.json({
ok:true,
status
});

}catch(err){

console.error("XPAY_STATUS_ERROR",err);

res.status(500).json({
ok:false,
error:"XPAY_STATUS_FAILED"
});

}

});

/* CREATE CONTRACT ALIAS (UI COMPATIBILITY) */
r.post("/contracts/create", async (req,res)=>{

const {
salon_id,
master_id,
terms_json,
effective_from
} = req.body;

try{

if(!salon_id || !master_id){
return res.status(400).json({ok:false,error:"INVALID_CONTRACT_INPUT"});
}

const existing = await pool.query(`
SELECT id
FROM contracts
WHERE salon_id=$1
AND master_id=$2
AND status='active'
LIMIT 1
`,[
salon_id,
master_id
]);

if(existing.rows.length){
return res.status(409).json({
ok:false,
error:"ACTIVE_CONTRACT_EXISTS",
contract_id:existing.rows[0].id
});
}

const contract = await pool.query(`
INSERT INTO contracts(
salon_id,
master_id,
status,
version,
terms_json,
effective_from,
created_at
)
VALUES(
$1,$2,'pending',1,$3,$4,NOW()
)
RETURNING *
`,[
salon_id,
master_id,
terms_json || {},
effective_from || new Date()
]);

res.json({
ok:true,
contract:contract.rows[0]
});

}catch(err){

console.error("CONTRACT_CREATE_ALIAS_ERROR",err);

res.status(500).json({
ok:false,
error:"CONTRACT_CREATE_FAILED"
});

}

});

return r;

}
